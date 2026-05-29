"""OpenAffiliate crawler — pull dữ liệu trực tiếp từ open-source repo.

Trang https://openaffiliate.dev là Next.js SSR/CSR, nhưng toàn bộ data
là YAML public ở repo `Affitor/open-affiliate` (thư mục `programs/`).
Cách tối ưu: download tarball 1 lần, parse 750+ file YAML in-memory.

Nhanh hơn browser crawl ~50x, không cần CapSolver / proxy.
"""
from __future__ import annotations
import io
import json
import re
import tarfile
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx
import yaml

from app.core.logger import get_logger
from .base import BaseCrawler

log = get_logger("crawler.openaffiliate")

TARBALL_URL = "https://codeload.github.com/Affitor/open-affiliate/tar.gz/refs/heads/main"
SITE_URL = "https://openaffiliate.dev"


def _parse_commission_value(raw: Any) -> Optional[float]:
    if raw is None:
        return None
    m = re.search(r"(\d+(?:\.\d+)?)", str(raw))
    return float(m.group(1)) if m else None


def _norm_type(raw: Any) -> Optional[str]:
    s = str(raw or "").lower().strip()
    if not s:
        return None
    if "recurring" in s:
        return "recurring"
    if "one" in s:
        return "one-time"
    if "lifetime" in s:
        return "lifetime"
    if "tier" in s:
        return "tiered"
    if "hybrid" in s:
        return "hybrid"
    if "flat" in s:
        return "flat"
    return s[:32] or None


def _commission_text(commission: Dict[str, Any]) -> Optional[str]:
    if not isinstance(commission, dict):
        return None
    rate = str(commission.get("rate") or "").strip()
    ctype = str(commission.get("type") or "").strip()
    duration = str(commission.get("duration") or "").strip()
    bits = [b for b in (rate, ctype) if b]
    text = " ".join(bits)
    if duration and duration.lower() not in text.lower():
        text = f"{text} / {duration}" if text else duration
    return text or None


def _payout_text(payout: Dict[str, Any]) -> Optional[str]:
    if not isinstance(payout, dict):
        return None
    mn = payout.get("minimum")
    cur = payout.get("currency") or ""
    freq = payout.get("frequency") or ""
    bits: List[str] = []
    if mn is not None:
        bits.append(f"min {mn} {cur}".strip())
    if freq:
        bits.append(str(freq))
    return ", ".join([b for b in bits if b]) or None


def _to_row(data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    name = (data.get("name") or "").strip()
    slug = (data.get("slug") or "").strip()
    if not name or not slug:
        return None
    commission = data.get("commission") or {}
    payout = data.get("payout") or {}
    tags = data.get("tags") or []
    if not isinstance(tags, list):
        tags = [str(tags)]
    restrictions = data.get("restrictions") or []
    if not isinstance(restrictions, list):
        restrictions = [str(restrictions)]
    agents = data.get("agents") or {}
    if not isinstance(agents, dict):
        agents = {}
    methods = payout.get("methods") if isinstance(payout, dict) else None
    if methods is not None and not isinstance(methods, list):
        methods = [str(methods)]
    verified = data.get("verified")
    if verified is True:
        dir_status = "Verified"
    elif verified is False:
        dir_status = "Unverified"
    else:
        dir_status = None
    short_desc = (data.get("short_description") or "").strip() or None
    long_desc = (data.get("description") or "").strip() or None
    return {
        "source": "openaffiliate",
        "external_id": slug,
        "name": name,
        "url": data.get("url") or data.get("signup_url"),
        "signup_url": data.get("signup_url") or "",
        "category": data.get("category"),
        "commission": _commission_text(commission),
        "commission_value": _parse_commission_value(commission.get("rate")),
        "commission_type": _norm_type(commission.get("type")),
        "commission_duration": (str(commission.get("duration")).strip() or None) if commission.get("duration") else None,
        "commission_conditions": (str(commission.get("conditions")).strip() or None) if commission.get("conditions") else None,
        "payout": _payout_text(payout),
        "payout_min": _safe_float(payout.get("minimum") if isinstance(payout, dict) else None),
        "payout_currency": (str(payout.get("currency")).strip() or None) if isinstance(payout, dict) and payout.get("currency") else None,
        "payout_frequency": (str(payout.get("frequency")).strip() or None) if isinstance(payout, dict) and payout.get("frequency") else None,
        "payout_methods_json": json.dumps(methods, ensure_ascii=False) if methods else None,
        "cookie_duration": (
            f"{data.get('cookie_days')}d" if data.get("cookie_days") else None
        ),
        "description": long_desc or short_desc,
        "short_description": short_desc,
        "tags_json": json.dumps(tags, ensure_ascii=False),
        "logo_url": f"{SITE_URL}/logos/{slug}.png" if slug else None,
        "restrictions_json": json.dumps(restrictions, ensure_ascii=False) if restrictions else None,
        "agents_json": json.dumps(agents, ensure_ascii=False) if agents else None,
        "directory_status": dir_status,
        "directory_network": (str(data.get("network")).strip() or None) if data.get("network") else None,
        "directory_approval": (str(data.get("approval")).strip().lower() or None) if data.get("approval") else None,
        "directory_approval_time": (str(data.get("approval_time")).strip() or None) if data.get("approval_time") else None,
        "directory_attribution": (str(data.get("attribution")).strip() or None) if data.get("attribution") else None,
        "directory_tracking": (str(data.get("tracking_method")).strip() or None) if data.get("tracking_method") else None,
        "directory_last_verified_at": (str(data.get("last_verified_at")).strip() or None) if data.get("last_verified_at") else None,
        "directory_program_age": (str(data.get("program_age")).strip() or None) if data.get("program_age") else None,
        "raw_json": json.dumps(data, ensure_ascii=False, default=str),
        "source_url": f"{SITE_URL}/programs/{slug}",
        "crawled_at": datetime.utcnow(),
    }


def _safe_float(v: Any) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        m = re.search(r"(\d+(?:\.\d+)?)", str(v))
        return float(m.group(1)) if m else None


class OpenAffiliateCrawler(BaseCrawler):
    source = "openaffiliate"
    source_url = SITE_URL

    def __init__(self, **_: object) -> None:
        pass

    async def crawl(self) -> List[Dict]:
        log.info("OpenAffiliate crawl start: %s", TARBALL_URL)
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            resp = await client.get(TARBALL_URL)
            resp.raise_for_status()
            data = resp.content
        log.info("Downloaded tarball: %.1f KB", len(data) / 1024)

        rows: List[Dict] = []
        skipped = 0
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tf:
            for member in tf.getmembers():
                if not member.isfile():
                    continue
                parts = member.name.split("/", 2)
                if len(parts) < 3 or parts[1] != "programs":
                    continue
                if not member.name.endswith((".yaml", ".yml")):
                    continue
                f = tf.extractfile(member)
                if not f:
                    continue
                try:
                    parsed = yaml.safe_load(f.read())
                except Exception as e:
                    log.debug("YAML parse fail %s: %s", member.name, e)
                    skipped += 1
                    continue
                if not isinstance(parsed, dict):
                    skipped += 1
                    continue
                row = _to_row(parsed)
                if row:
                    rows.append(row)
                else:
                    skipped += 1
        log.info("OpenAffiliate parsed %s rows (skipped %s)", len(rows), skipped)
        return rows
