"""GoAffPro crawler — gọi trực tiếp public API của GoAffPro.

Trang https://goaffpro.com/affiliate/stores/search yêu cầu login + Cloudflare
Turnstile, nhưng nguồn data thực chất là endpoint công khai:

    GET https://api-server-3.goaffpro.com/v1/public/sites
        ?keyword=&country=&currency=&category=&limit=1000&offset=0

Endpoint này không cần auth. Tổng > 22,800 shop. Để tránh ngập DB,
mặc định chỉ pull 2000 shop mới nhất; có thể chọn 500/2000/5000/all
từ UI.

Tham khảo:
- Login (nếu cần token cho endpoint khác): POST /website/affiliate/login,
  trả Bearer JWT, kèm Cloudflare Turnstile (giải bằng CapSolver).
"""
from __future__ import annotations
import asyncio
import json
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx

from app.core.logger import get_logger
from .base import BaseCrawler

log = get_logger("crawler.goaffpro")

API_BASE = "https://api-server-3.goaffpro.com"
SITES_ENDPOINT = f"{API_BASE}/v1/public/sites"
SITE_URL = "https://goaffpro.com"
PAGE_LIMIT = 1000  # max server-side per request
DEFAULT_MAX = 2000


GOAFFPRO_MAX_CHOICES = [
    {"value": "500", "label": "Nhanh — 500 shop"},
    {"value": "2000", "label": "Cân bằng — 2000 shop"},
    {"value": "5000", "label": "Nhiều — 5000 shop"},
    {"value": "all", "label": "Tất cả (~22.8k shop)"},
]


def _coerce_max(value: Any) -> int:
    if value in (None, "", "all"):
        return 0  # 0 = không giới hạn
    if isinstance(value, int):
        return max(0, value)
    s = str(value).strip().lower()
    if s == "all":
        return 0
    try:
        return max(0, int(s))
    except ValueError:
        return DEFAULT_MAX


def _humanize_cookie(seconds: Any) -> Optional[str]:
    try:
        n = int(seconds)
    except (TypeError, ValueError):
        return None
    if n <= 0:
        return None
    days = n // 86400
    if days >= 1:
        return f"{days}d"
    hours = max(1, n // 3600)
    return f"{hours}h"


def _commission_text(commission: Dict[str, Any]) -> Optional[str]:
    if not isinstance(commission, dict):
        return None
    ctype = (commission.get("type") or "").strip().lower()
    amount = commission.get("amount")
    on = (commission.get("on") or "").strip().lower()
    if amount is None:
        return None
    if ctype == "percentage":
        head = f"{amount}%"
    elif ctype in ("flat_rate", "flat", "fixed"):
        head = f"${amount}"
    else:
        head = f"{amount} {ctype}".strip()
    return f"{head} on {on}" if on else head


def _norm_type(raw: Any) -> Optional[str]:
    s = str(raw or "").strip().lower()
    if not s:
        return None
    if "percent" in s:
        return "percentage"
    if "flat" in s or "fixed" in s:
        return "flat"
    return s[:32]


def _commission_value(commission: Dict[str, Any]) -> Optional[float]:
    if not isinstance(commission, dict):
        return None
    amount = commission.get("amount")
    if amount is None:
        return None
    try:
        return float(amount)
    except (TypeError, ValueError):
        m = re.search(r"(\d+(?:\.\d+)?)", str(amount))
        return float(m.group(1)) if m else None


def _category_hint(store: Dict[str, Any]) -> Optional[str]:
    # API hiện không trả category — suy ra từ tên/url khá tốn công.
    # Tạm để None; FE vẫn có cột Category rỗng OK.
    cat = store.get("category") or store.get("niche")
    return str(cat).strip() if cat else None


def _portal_url(store: Dict[str, Any]) -> Optional[str]:
    portal = (store.get("affiliatePortal") or "").strip()
    if not portal:
        return None
    if portal.startswith("http"):
        return portal
    return f"https://{portal}"


def _to_row(store: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    sid = store.get("id")
    if not sid:
        return None
    name = (store.get("name") or "").strip()
    commission = store.get("commission") or {}
    portal = _portal_url(store)
    if not name:
        website = str(store.get("website") or "").strip()
        website_host = re.sub(r"^https?://", "", website).split("/")[0] if website else ""
        portal_host = re.sub(r"^https?://", "", portal).split("/")[0] if portal else ""
        name = website_host or portal_host or f"Store {sid}"
    reg_open = store.get("areRegistrationsOpen")
    auto_approve = store.get("isApprovedAutomatically")
    # Tổng hợp directory_status
    if reg_open in (0, False):
        dir_status = "Closed"
    elif auto_approve in (1, True):
        dir_status = "Auto-approve"
    elif auto_approve in (0, False):
        dir_status = "Manual approve"
    else:
        dir_status = None
    currency = (store.get("currency") or "").strip() or None
    return {
        "source": "goaffpro",
        "external_id": str(sid),
        "name": name,
        "url": store.get("website") or portal,
        "signup_url": portal or "",
        "category": _category_hint(store),
        "commission": _commission_text(commission),
        "commission_value": _commission_value(commission),
        "commission_type": _norm_type(commission.get("type")),
        "payout": currency,
        "payout_currency": currency,
        "cookie_duration": _humanize_cookie(store.get("cookieDuration")),
        "description": None,
        "logo_url": (str(store.get("logo")).strip() or None) if store.get("logo") else None,
        "directory_status": dir_status,
        "directory_approval": "auto" if auto_approve in (1, True) else ("manual" if auto_approve in (0, False) else None),
        "registrations_open": 1 if reg_open in (1, True) else (0 if reg_open in (0, False) else None),
        "tags_json": json.dumps(
            [t for t in [store.get("currency"), store.get("country")] if t],
            ensure_ascii=False,
        ),
        "raw_json": json.dumps(store, ensure_ascii=False, default=str),
        "source_url": f"{SITE_URL}/affiliate/stores/search?store={sid}",
        "crawled_at": datetime.utcnow(),
    }


class GoAffProCrawler(BaseCrawler):
    source = "goaffpro"
    source_url = SITE_URL

    def __init__(
        self,
        max_stores: Any = DEFAULT_MAX,
        keyword: str = "",
        currency: str = "",
        category: str = "",
        country: str = "",
        **_: object,
    ) -> None:
        self.max_stores = _coerce_max(max_stores)
        self.keyword = (keyword or "").strip()
        self.currency = (currency or "").strip()
        self.category = (category or "").strip()
        self.country = (country or "").strip()

    async def crawl(self) -> List[Dict]:
        log.info(
            "GoAffPro crawl start — max=%s keyword=%r currency=%r",
            self.max_stores or "ALL", self.keyword, self.currency,
        )
        rows: List[Dict] = []
        offset = 0
        total_count: Optional[int] = None
        async with httpx.AsyncClient(
            timeout=30.0,
            headers={"accept": "application/json", "user-agent": "AffiliateHub/1.0"},
        ) as client:
            while True:
                params = {
                    "keyword": self.keyword,
                    "country": self.country,
                    "currency": self.currency,
                    "category": self.category,
                    "limit": PAGE_LIMIT,
                    "offset": offset,
                }
                # Retry nhẹ tránh fail 1-time
                for attempt in range(3):
                    try:
                        resp = await client.get(SITES_ENDPOINT, params=params)
                        resp.raise_for_status()
                        data = resp.json()
                        break
                    except (httpx.HTTPError, json.JSONDecodeError) as e:
                        log.warning(
                            "GoAffPro fetch offset=%s attempt=%s lỗi: %s",
                            offset, attempt + 1, e,
                        )
                        if attempt == 2:
                            raise
                        await asyncio.sleep(1.5 * (attempt + 1))

                stores = data.get("stores") or []
                if total_count is None:
                    total_count = int(data.get("count") or 0)
                    log.info("GoAffPro tổng shop trên server: %s", total_count)
                if not stores:
                    break

                for st in stores:
                    row = _to_row(st)
                    if row:
                        rows.append(row)
                    if self.max_stores and len(rows) >= self.max_stores:
                        break

                offset += len(stores)
                log.info(
                    "GoAffPro batch offset=%s got=%s total_rows=%s",
                    offset, len(stores), len(rows),
                )
                if self.max_stores and len(rows) >= self.max_stores:
                    break
                if len(stores) < PAGE_LIMIT:
                    break
                if total_count and offset >= total_count:
                    break

        log.info("GoAffPro extract xong: %s shop", len(rows))
        return rows
