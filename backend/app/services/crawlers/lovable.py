"""Lovable Directory crawler — crawl thật bằng CloakBrowser (Playwright).

Trang root https://affiliateprogram.lovable.app/ là SPA. Mỗi nền tảng
(rewardful, firstpromoter…) là 1 route React, đôi khi nội dung lồng
trong iframe. Crawler nhận `project` → mở CloakBrowser → JS extract
trực tiếp trong DOM (kèm fallback đi vào iframe).
"""
from __future__ import annotations
import asyncio
import json
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.core.logger import get_logger
from app.services.browser.session import get_browser
from .base import BaseCrawler

log = get_logger("crawler.lovable")

LOVABLE_PROJECTS: List[Dict[str, str]] = [
    {"value": "_all", "label": "✨ Tất cả (8 nền tảng)"},
    {"value": "rewardful", "label": "Rewardful"},
    {"value": "firstpromoter", "label": "FirstPromoter"},
    {"value": "postaffiliatepro", "label": "Post Affiliate Pro"},
    {"value": "tolt", "label": "Tolt"},
    {"value": "taprefer", "label": "TapRefer"},
    {"value": "leaddyno", "label": "LeadDyno"},
    {"value": "everflow", "label": "Everflow"},
    {"value": "promotekit", "label": "PromoteKit"},
]
_VALID_PROJECTS = {p["value"] for p in LOVABLE_PROJECTS}
_REAL_PROJECTS = [p["value"] for p in LOVABLE_PROJECTS if p["value"] != "_all"]

BASE_URL = "https://affiliateprogram.lovable.app"

# Extract toàn bộ cards → trả JSON string.
# Mỗi sub-directory của Lovable (toltdirectory, getrewardfuldirectory,
# firstpromoterdirectory…) tự xây Tailwind/shadcn riêng → class khác nhau,
# nhưng STRUCTURAL ORDER giống nhau:
#   h3 (name) → status badge → slug (p.font-mono) → description
#   → traffic + popularity row → keywords → pills [commission, type, cookie]
#   → <a>Sign Up</a> (hoặc "Đăng Ký" ở leaddyno)
# ⇒ Định vị pills bằng "previousElementSibling của anchor signup".
# - Status: chuẩn hoá text (strip bullet/dot prefix) và cả element có child decoration
#   (vd promotekit: <span><span dot/></span>Active & Verified</span>) đều match được.
# - leaddyno: signup text = "Đăng Ký", cookie có thể = "30 ngày" (không có word "cookie").
_EXTRACT_JS = r"""
(() => {
  const txt = (el) => (el ? (el.textContent || '').replace(/\s+/g,' ').trim() : '');
  const SIGNUP_RE = /sign\s*up|signup|đăng\s*k[ýy]/i;
  const STATUS_ONLY = /^(active\s*&\s*verified|active|verified|inactive|moved|new|invite\s*only)$/i;

  // 1. Tìm card root = ancestor LỚN NHẤT của <h3> mà vẫn chỉ chứa 1 h3.
  //    (Walk up tới khi parent tiếp theo có >1 h3 → ancestor hiện tại là card đầy đủ.)
  //    Cách này đảm bảo lấy được toàn bộ siblings (status badge, description,
  //    commission row…) thường ở mức cha của h3-wrapper.
  //    Bỏ qua h3 không có slug + không trong card layout (vd "Đăng ký affiliate"
  //    hero text) bằng cách yêu cầu card phải chứa <p> slug khớp domain hoặc
  //    có signup link hợp lệ.
  const SLUG_RE = /^[a-z0-9_-]+(\.[a-z0-9_-]+){1,}/i;
  const isCardLike = (el) => {
    if (el.querySelector('p.font-mono')) return true;
    if (Array.from(el.querySelectorAll('p')).some(p => {
      const t = (p.textContent || '').trim();
      return t.length < 80 && SLUG_RE.test(t);
    })) return true;
    return Array.from(el.querySelectorAll('a[href]')).some(a =>
      SIGNUP_RE.test(a.textContent || '')
      && /^https?:/.test(a.href)
      && !/lovable\.dev|facebook\.com/.test(a.href)
    );
  };
  const cards = new Set();
  document.querySelectorAll('h3').forEach(h => {
    let p = h.parentElement;
    let best = null;
    for (let i = 0; i < 12 && p; i++, p = p.parentElement) {
      if (p.querySelectorAll('h3').length !== 1) break; // gặp grid → dừng
      if (isCardLike(p)) best = p;
    }
    if (best) cards.add(best);
  });

  const out = [];
  cards.forEach(card => {
    const h3 = card.querySelector('h3');
    const name = txt(h3); if (!name) return;

    // Status: scan toàn card, lấy "direct text" của element (bỏ qua text của con)
    // để vượt qua nested decoration (vd <span><span dot/></span>Active</span>).
    // Strip bullet/dot prefix trước khi match.
    let status = '';
    for (const el of card.querySelectorAll('*')) {
      if (el === h3) continue;
      const direct = Array.from(el.childNodes)
        .filter(n => n.nodeType === 3)
        .map(n => n.textContent).join('').trim();
      const candidate = direct || (el.children.length === 0 ? txt(el) : '');
      if (!candidate || candidate.length > 40) continue;
      const norm = candidate.replace(/^[^A-Za-z]+/, '').replace(/[^A-Za-z &]+$/, '').trim();
      if (STATUS_ONLY.test(norm)) { status = norm; break; }
    }

    // Slug: p.font-mono hoặc p khớp pattern domain
    const slugEl = card.querySelector('p.font-mono')
      || Array.from(card.querySelectorAll('p')).find(p => /^[a-z0-9_-]+(\.[a-z0-9_-]+){1,}/i.test(txt(p)) && txt(p).length < 80);
    const slug = txt(slugEl);

    // Description: p text dài, không phải slug, không phải keywords
    const descEl = Array.from(card.querySelectorAll('p')).find(p => {
      const t = txt(p);
      if (!t || t === slug) return false;
      if (/^(Từ khóa|Keywords?)/i.test(t)) return false;
      return t.length >= 20;
    });
    const description = txt(descEl);

    // Traffic + popularity: row flex có ĐÚNG 2 span con + svg (icon eye + trending)
    let traffic = '', popularity = '';
    const tRow = Array.from(card.querySelectorAll('div')).find(d => {
      if (!/flex/.test(d.className || '')) return false;
      const spans = d.querySelectorAll(':scope > span');
      return spans.length === 2 && d.querySelector('svg');
    });
    if (tRow) {
      const spans = tRow.querySelectorAll(':scope > span');
      traffic = txt(spans[0]); popularity = txt(spans[1]);
    }

    // Keywords: labeled <p> first (chip fallback runs after pillsRow is set below)
    let keywords = [];
    const kwP = Array.from(card.querySelectorAll('p')).find(p => /^(Từ khóa|Keywords?)/i.test(txt(p)));
    if (kwP) {
      keywords = txt(kwP).replace(/^[^:]+:\s*/, '').split(/,\s*/).map(s => s.trim()).filter(Boolean);
    }

    // Pills row = previousElementSibling trực tiếp của anchor signup nếu có.
    // Fallback (inactive cards, không có Sign Up): pills = div cuối cùng có
    // bg-secondary span children — đây là layout chuẩn cho commission/type/cookie.
    let commission = '', commissionType = '', cookie = '';
    const signupA = Array.from(card.querySelectorAll('a[href]')).find(a => SIGNUP_RE.test(txt(a)));
    let pillsRow = null;
    if (signupA) {
      pillsRow = signupA.previousElementSibling;
    } else {
      // Tìm div pills: chứa span.bg-secondary HOẶC flex div với 2-3 children ngắn
      const cands = Array.from(card.querySelectorAll('div')).filter(d => {
        if (!/flex/.test(d.className || '')) return false;
        const kids = d.children;
        if (kids.length < 2 || kids.length > 4) return false;
        return Array.from(kids).every(c => {
          const t = txt(c);
          return t && t.length < 60 && !c.querySelector('h3');
        }) && (d.querySelector('span.bg-secondary, [class*="bg-secondary"]') || /commission|cookie|recurring|one[- ]time|lifetime|\d+\s*%|\d+\s*d/i.test(txt(d)));
      });
      // Lấy cái cuối cùng (gần signup nhất nếu có)
      pillsRow = cands[cands.length - 1] || null;
    }
    if (pillsRow) {
      const pills = Array.from(pillsRow.children)
        .map(c => txt(c))
        .filter(t => t && t.length < 60);
      commission = pills[0] || '';
      commissionType = pills[1] || '';
      cookie = pills[2] || '';
    }

    // Chip-style keywords fallback (pillsRow now defined — safe to exclude it)
    if (keywords.length === 0) {
      const chipCands = [];
      card.querySelectorAll('div,ul').forEach(d => {
        if (d === pillsRow || (pillsRow && pillsRow.contains(d))) return;
        if (d === tRow || (tRow && tRow.contains(d))) return;
        const kids = Array.from(d.children);
        if (kids.length < 2 || kids.length > 12) return;
        if (kids.some(k => /^(A|BUTTON|H[1-6]|IMG|INPUT|SELECT|TEXTAREA)$/.test(k.tagName) || k.querySelector('h1,h2,h3,h4,a,button,img'))) return;
        const texts = kids.map(k => txt(k)).filter(t => t.length > 0 && t.length < 40 && !/^\+\d+/.test(t));
        if (texts.length >= 2) chipCands.push(texts);
      });
      if (chipCands.length > 0) {
        chipCands.sort((a, b) => b.length - a.length);
        keywords = chipCands[0];
      }
    }

    const signup_url = signupA ? signupA.href : '';
    out.push({
      name, slug, status, description, traffic, popularity, keywords,
      commission, commission_type: commissionType, cookie_duration: cookie, signup_url
    });
  });
  return JSON.stringify(out);
})()
"""


def _parse_commission_value(raw: str) -> Optional[float]:
    """Lấy giá trị commission. Với range '15-30%' lấy số cao nhất để rank."""
    if not raw:
        return None
    nums = re.findall(r"\d+(?:\.\d+)?", raw)
    if not nums:
        return None
    return max(float(n) for n in nums)


def _norm_type(raw: str) -> Optional[str]:
    s = (raw or "").strip().lower()
    if not s:
        return None
    if "recurring" in s:
        return "recurring"
    if "lifetime" in s:
        return "lifetime"
    if "tiered" in s or "tier" in s:
        return "tiered"
    if "hybrid" in s:
        return "hybrid"
    if "per referral" in s or "referral" in s:
        return "per-referral"
    if "per sale" in s or "cps" in s:
        return "per-sale"
    if "per lead" in s or "cpl" in s:
        return "per-lead"
    if "per click" in s or "cpc" in s:
        return "per-click"
    if "one" in s or "one-time" in s:
        return "one-time"
    if "cpa" in s:
        return "cpa"
    if "flat" in s or "fixed" in s:
        return "flat"
    # Fallback: store raw value (capped at 32 chars) instead of dropping it
    return (raw or "").strip()[:32] or None


async def _eval_json(target, js: str) -> Any:
    """Eval JS, parse JSON string nếu cần. `target` = Playwright Page hoặc Frame."""
    try:
        raw = await target.evaluate(js)
    except Exception as e:
        log.debug("evaluate lỗi: %s", e)
        return None
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except Exception:
            return None
    return raw if isinstance(raw, (list, dict)) else None


async def _scroll_and_extract(target, label: str = "page") -> List[Dict]:
    """Scroll-to-bottom + retry 8 lần để trigger lazy-load."""
    best: List[Dict] = []
    for attempt in range(8):
        await asyncio.sleep(1.5)
        try:
            await target.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        except Exception:
            pass
        items = await _eval_json(target, _EXTRACT_JS) or []
        if len(items) > len(best):
            best = items
        if best and attempt >= 3 and len(items) == len(best):
            break
    log.info("Extract %s: %s items", label, len(best))
    return best


class LovableCrawler(BaseCrawler):
    source = "lovable"
    source_url = BASE_URL

    def __init__(self, project: str = "rewardful", **_: object) -> None:
        if project not in _VALID_PROJECTS:
            raise ValueError(f"Lovable project không hỗ trợ: {project}")
        self.project = project
        self.page_url = f"{BASE_URL}/{project}" if project != "_all" else BASE_URL

    async def crawl(self) -> List[Dict]:
        # "_all" → chạy lần lượt tất cả project, gộp kết quả (de-dup theo external_id).
        if self.project == "_all":
            merged: Dict[str, Dict] = {}
            for proj in _REAL_PROJECTS:
                try:
                    sub = LovableCrawler(project=proj)
                    rows = await sub.crawl()
                    for r in rows:
                        merged[r["external_id"]] = r
                    log.info("Lovable _all: %s → %d rows (tổng %d)", proj, len(rows), len(merged))
                except Exception as e:
                    log.warning("Lovable _all: project %s lỗi: %s", proj, e)
            return list(merged.values())
        browser = await get_browser()
        if browser is None:
            raise RuntimeError("CloakBrowser chưa khả dụng (chưa cài cloakbrowser)")
        try:
            log.info("Lovable crawl start: %s", self.page_url)
            page = await browser.new_page()
            try:
                await page.goto(self.page_url, wait_until="networkidle", timeout=30000)
            except Exception as e:
                log.warning("goto networkidle timeout (%s) — fallback domcontentloaded", e)
                await page.goto(self.page_url, wait_until="domcontentloaded", timeout=30000)
            raw_items = await _scroll_and_extract(page, label=self.project)
            # Fallback: thử iframe nếu DOM gốc rỗng (Tolt, FirstPromoter…)
            if not raw_items:
                raw_items = await self._extract_from_iframes(browser, page)
            log.info("Lovable extracted %s items thô", len(raw_items))
            return [self._to_row(it) for it in raw_items if it.get("name")]
        finally:
            try:
                await browser.close()
            except Exception:
                pass

    async def _extract_from_iframes(self, browser, page) -> List[Dict]:
        """Mở iframe URL trong NEW PAGE (giống nodriver `new_tab=True`).

        Nhiều project (rewardful, firstpromoter...) iframe vào subdomain
        nhưng tự nó là full app — mở trực tiếp render nhanh & ổn hơn.
        """
        srcs = await _eval_json(
            page,
            "JSON.stringify(Array.from(document.querySelectorAll('iframe')).map(f => f.src).filter(Boolean))",
        ) or []
        log.info("Iframe srcs found: %s", srcs)
        for src in srcs:
            try:
                fpage = await browser.new_page()
                try:
                    try:
                        await fpage.goto(src, wait_until="networkidle", timeout=30000)
                    except Exception:
                        await fpage.goto(src, wait_until="domcontentloaded", timeout=30000)
                    items = await _scroll_and_extract(fpage, label=f"iframe-page {src[:60]}")
                    if items:
                        return items
                finally:
                    try:
                        await fpage.close()
                    except Exception:
                        pass
            except Exception as e:
                log.warning("iframe %s lỗi: %s", src, e)
        return []

    def _to_row(self, it: Dict) -> Dict:
        name: str = (it.get("name") or "").strip()
        slug: str = (it.get("slug") or "").strip().rstrip(".")
        ext = f"{self.project}:{slug or name.lower().replace(' ', '-')}"
        keywords = it.get("keywords") or []
        url = ""
        if slug and "." in slug:
            url = f"https://{slug.split('…')[0]}"
        commission = (it.get("commission") or "").strip()
        return {
            "source": self.source,
            "external_id": ext,
            "name": name,
            "url": url or it.get("signup_url"),
            "signup_url": it.get("signup_url") or "",
            "category": self.project,
            "commission": commission or None,
            "commission_value": _parse_commission_value(commission),
            "commission_type": _norm_type(it.get("commission_type") or ""),
            "payout": None,
            "cookie_duration": (it.get("cookie_duration") or "").strip() or None,
            "description": (it.get("description") or "").strip() or None,
            "tags_json": json.dumps(keywords, ensure_ascii=False),
            "directory_traffic": (it.get("traffic") or "").strip() or None,
            "directory_popularity": (it.get("popularity") or "").strip() or None,
            "directory_status": (it.get("status") or "").strip() or None,
            "raw_json": json.dumps(it, ensure_ascii=False),
            "source_url": self.page_url,
            "crawled_at": datetime.utcnow(),
        }
