"""
Quét traffic chi tiết 1 URL từ SimilarWeb Pro widgetApi.

Trả về (giống api-adecos):
    {
        "monthly_visits":  int,        # visits tháng gần nhất
        "period_month":    str,        # "YYYY-MM"
        "domain":          str,
        "found":           bool,
        "traffic_details": {
            "global":  [ {period_month, total_visits_monthly, unique_visits_monthly, repeat_visits_monthly,
                          pages_per_visit, avg_visit_duration, bounce_rate_percentage, avg_visits_monthly}, ... ],
            "country": [ {country_code, country_name, traffic_share_percentage, total_visits_monthly,
                          pages_per_visit, avg_visit_duration, bounce_rate_percentage}, ... ],
            "source":  {period_month, organic_search, paid_search, social, email, direct, referrals, display_ads},
            "social":  [ {platform_name, share_percentage}, ... ],
        }
    }

Chiến lược tối ưu:
    1. Probe range cho phép (parse từ error 400 "Allowed interval is YYYY-MM--YYYY-MM") — cache module-level.
    2. Trong range cho phép:
         - EngagementOverview/Table: gọi PER-MONTH song song (cần resolution theo tháng).
         - GeographyExtended / TrafficSourcesOverview / TrafficSourcesSocial: gọi 1 lần cho TOÀN range
           (chỉ giữ snapshot mới nhất nên không cần per-month).
    3. Tất cả task chạy đồng thời bằng asyncio.gather.
    → Giảm ~48 call/domain → ~N+3 call/domain (N = số tháng cho phép).
"""

from __future__ import annotations

import asyncio
import logging
import re
from calendar import monthrange
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import httpx

from . import similarweb as sw

logger = logging.getLogger(__name__)

_SW_BASE = "https://pro.similarweb.com/widgetApi"
_TIMEOUT = 30.0

# Cache range SW account cho phép (parse từ error 400). None = chưa probe.
_ALLOWED_RANGE: tuple[datetime, datetime] | None = None
_ALLOWED_RANGE_LOCK = asyncio.Lock()
_ALLOWED_INTERVAL_RE = re.compile(r"Allowed interval is (\d{4})-(\d{2})--(\d{4})-(\d{2})")


def _extract_domain(url: str) -> str:
    try:
        parsed = urlparse(url if "://" in url else f"https://{url}")
        host = parsed.netloc or parsed.path.split("/")[0]
        return host.removeprefix("www.").split(":")[0]
    except Exception:
        return url


def _sw_date(dt: datetime) -> str:
    return f"{dt.year}|{dt.month:02d}|{dt.day:02d}"


def _month_bounds(year: int, month: int) -> tuple[datetime, datetime]:
    last_day = monthrange(year, month)[1]
    return (
        datetime(year, month, 1, tzinfo=timezone.utc),
        datetime(year, month, last_day, tzinfo=timezone.utc),
    )


def _iter_months(start: datetime, end: datetime) -> list[tuple[datetime, datetime]]:
    """List (from, to) cho từng tháng từ start.year-month → end.year-month, inclusive."""
    months: list[tuple[datetime, datetime]] = []
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        months.append(_month_bounds(y, m))
        m += 1
        if m > 12:
            m = 1
            y += 1
    return months


async def _get_cookie() -> str:
    cookie = sw.load_cached_cookie()
    if cookie:
        return cookie
    return await asyncio.to_thread(sw.refresh_cookie_blocking, False)


async def _get_widget(url: str, params: dict, headers: dict) -> tuple[dict | None, dict, int]:
    """GET widget. 401/403 → refresh cookie 1 lần + retry. Returns (json, headers, status)."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(url, params=params, headers=headers)

    if resp.status_code in (401, 403):
        logger.info("[traffic] cookie expired (%s) — refreshing", resp.status_code)
        sw.invalidate_cookie()
        _reset_range_cache()
        cookie = await asyncio.to_thread(sw.refresh_cookie_blocking, False)
        headers = sw.build_headers(cookie)
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(url, params=params, headers=headers)

    if resp.status_code != 200:
        return None, headers, resp.status_code
    try:
        return resp.json(), headers, 200
    except Exception:
        return None, headers, 200


# ---------------------------------------------------------------------------
# 4 endpoints
# ---------------------------------------------------------------------------


async def _fetch_global(domain: str, from_dt: datetime, to_dt: datetime, headers: dict):
    url = f"{_SW_BASE}/WebsiteOverview/EngagementOverview/Table"
    params = {
        "country": 999, "from": _sw_date(from_dt), "to": _sw_date(to_dt),
        "isWindow": "false", "webSource": "Total", "ignoreFilterConsistency": "false",
        "includeSubDomains": "true", "timeGranularity": "Monthly", "keys": domain,
        "ShouldGetVerifiedData": "false",
    }
    data, _h, status = await _get_widget(url, params, headers)
    if status == 400:
        return []  # domain không có SW data
    if not data:
        return None
    rows = data.get("Data") or []
    if not rows:
        return []
    out = []
    for row in rows:
        vpu = float(row.get("VisitsPerUser") or 0)
        uu = float(row.get("UniqueUsers") or 0)
        dedup = float(row.get("DedupUniqueUsers") or 0)
        avg_month = float(row.get("AvgMonthVisits") or 0)
        total = round(vpu * uu) if vpu and uu else 0
        repeat = round(uu - dedup) if uu >= dedup else 0
        out.append({
            "period_month": from_dt.strftime("%Y-%m"),
            "total_visits_monthly": total,
            "avg_visits_monthly": round(avg_month),
            "unique_visits_monthly": round(uu),
            "repeat_visits_monthly": repeat,
            "pages_per_visit": round(float(row.get("PagesPerVisit") or 0), 2),
            "avg_visit_duration": round(float(row.get("AvgVisitDuration") or 0)),
            "bounce_rate_percentage": round(float(row.get("BounceRate") or 0) * 100, 2),
        })
    return out or None


async def _fetch_country(domain, from_dt, to_dt, headers, global_total: int = 0):
    url = f"{_SW_BASE}/WebsiteGeographyExtended/GeographyExtended/Table"
    params = {
        "includeSubDomains": "true", "keys": domain,
        "from": _sw_date(from_dt), "to": _sw_date(to_dt),
        "country": 999, "webSource": "Total", "isWindow": "false",
        "timeGranularity": "Monthly", "page": 1, "pageSize": 50,
        "includeRegionalDomains": "false",
    }
    data, _h, _s = await _get_widget(url, params, headers)
    if not data or not data.get("Data"):
        return None
    country_map: dict[int, tuple[str, str]] = {}
    for cf in (data.get("Filters") or {}).get("country") or []:
        try:
            cid = int(cf.get("id"))
            icon = cf.get("icon", "")
            code = icon.split("flag-")[-1].upper() if "flag-" in icon else ""
            country_map[cid] = (cf.get("text", f"Country-{cid}"), code)
        except (TypeError, ValueError):
            continue
    out = []
    for row in data["Data"]:
        cid = row.get("Country")
        if cid is None:
            continue
        country_name, country_code = country_map.get(cid, (f"Country-{cid}", str(cid)))
        share = float(row.get("Share") or 0)
        total_visits = round(global_total * share) if global_total and share else None
        out.append({
            "country_code": country_code,
            "country_name": country_name,
            "traffic_share_percentage": round(share * 100, 2),
            "total_visits_monthly": total_visits,
            "pages_per_visit": round(float(row.get("PagePerVisit") or 0), 2),
            "avg_visit_duration": round(float(row.get("AvgVisitDuration") or 0)),
            "bounce_rate_percentage": round(float(row.get("BounceRate") or 0) * 100, 2),
        })
    return out or None


async def _fetch_sources(domain, from_dt, to_dt, headers):
    url = f"{_SW_BASE}/MarketingMixTotal/TrafficSourcesOverview/PieChart"
    params = {
        "country": 999, "from": _sw_date(from_dt), "to": _sw_date(to_dt),
        "includeSubDomains": "true", "isWindow": "false",
        "timeGranularity": "Monthly", "keys": domain,
    }
    data, _h, _s = await _get_widget(url, params, headers)
    if not data or not data.get("Data"):
        return None
    total = (data["Data"].get("Total") or {}).get(domain)
    if not total:
        return None
    return {
        "period_month": from_dt.strftime("%Y-%m"),
        "organic_search": round(total.get("Organic Search") or 0),
        "social": round(total.get("Social") or 0),
        "email": round(total.get("Email") or 0),
        "display_ads": round(total.get("Display Ads") or 0),
        "direct": round(total.get("Direct") or 0),
        "referrals": round(total.get("Referrals") or 0),
        "paid_search": round(total.get("Paid Search") or 0),
    }


async def _fetch_social(domain, from_dt, to_dt, headers):
    url = f"{_SW_BASE}/WebsiteOverviewDesktop/TrafficSourcesSocial/PieChart"
    params = {
        "country": 999, "from": _sw_date(from_dt), "to": _sw_date(to_dt),
        "includeSubDomains": "true", "isWindow": "false",
        "timeGranularity": "Monthly", "webSource": "Desktop", "keys": domain,
    }
    data, _h, _s = await _get_widget(url, params, headers)
    if not data or not data.get("Data"):
        return None
    domain_data = data["Data"].get(domain)
    if not domain_data:
        return None
    out = []
    for platform, pdata in domain_data.items():
        share = pdata.get("Share") if isinstance(pdata, dict) else pdata
        out.append({"platform_name": platform, "share_percentage": float(share) if share else None})
    return out or None


# ---------------------------------------------------------------------------
# Public entry
# ---------------------------------------------------------------------------


async def _probe_available_range(headers: dict) -> tuple[datetime, datetime]:
    """Probe SW account allowed interval. Cache module-level, refresh khi cookie đổi.

    Strategy: gửi 1 request EngagementOverview với range cố tình rộng (24 tháng) →
    SW trả 400 kèm "Allowed interval is YYYY-MM--YYYY-MM" → parse.
    Nếu request thành công (account unlimited) → trả về range = 12 tháng gần nhất.
    """
    global _ALLOWED_RANGE
    async with _ALLOWED_RANGE_LOCK:
        if _ALLOWED_RANGE is not None:
            return _ALLOWED_RANGE

        now = datetime.now(timezone.utc)
        # 24 tháng trước → 1 tháng trước
        far_start = datetime(now.year - 2, now.month, 1, tzinfo=timezone.utc)
        prev_month = datetime(now.year, now.month, 1, tzinfo=timezone.utc) - timedelta(days=1)
        url = f"{_SW_BASE}/WebsiteOverview/EngagementOverview/Table"
        params = {
            "country": 999, "from": _sw_date(far_start), "to": _sw_date(prev_month),
            "isWindow": "false", "webSource": "Total", "ignoreFilterConsistency": "false",
            "includeSubDomains": "true", "timeGranularity": "Monthly", "keys": "google.com",
            "ShouldGetVerifiedData": "false",
        }
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                resp = await client.get(url, params=params, headers=headers)
        except Exception as e:
            logger.warning("[traffic] probe failed: %s — fallback last 3 months", e)
            resp = None

        start_y, start_m = prev_month.year, prev_month.month
        end_y, end_m = prev_month.year, prev_month.month

        if resp is not None:
            if resp.status_code == 200:
                # Account có quyền 24 tháng → dùng full
                start_y, start_m = far_start.year, far_start.month
            elif resp.status_code == 400:
                match = _ALLOWED_INTERVAL_RE.search(resp.text or "")
                if match:
                    start_y, start_m = int(match.group(1)), int(match.group(2))
                    end_y, end_m = int(match.group(3)), int(match.group(4))
                    logger.info("[traffic] SW allowed range: %04d-%02d → %04d-%02d", start_y, start_m, end_y, end_m)
                else:
                    logger.warning("[traffic] 400 but no allowed interval in body — fallback 3 months")
                    # Fallback: 3 tháng cuối
                    start_dt = prev_month
                    for _ in range(2):
                        start_dt = datetime(start_dt.year, start_dt.month, 1, tzinfo=timezone.utc) - timedelta(days=1)
                    start_y, start_m = start_dt.year, start_dt.month

        start = datetime(start_y, start_m, 1, tzinfo=timezone.utc)
        end_last = monthrange(end_y, end_m)[1]
        end = datetime(end_y, end_m, end_last, tzinfo=timezone.utc)
        _ALLOWED_RANGE = (start, end)
        return _ALLOWED_RANGE


def _reset_range_cache() -> None:
    """Gọi khi cookie refresh (account có thể đổi tier)."""
    global _ALLOWED_RANGE
    _ALLOWED_RANGE = None


async def scan_traffic(url: str, months: int = 0) -> dict:
    """Quét traffic chi tiết. Raise RuntimeError nếu không có cookie / SW lỗi nặng.

    Param `months` giữ lại để backward-compat nhưng KHÔNG dùng — range tự detect từ SW account.
    """
    _ = months  # unused, kept for backward compatibility
    domain = _extract_domain(url)
    if not domain:
        raise RuntimeError("URL không hợp lệ")

    cookie = await _get_cookie()
    headers = sw.build_headers(cookie)

    range_start, range_end = await _probe_available_range(headers)
    months_range = _iter_months(range_start, range_end)
    if not months_range:
        raise RuntimeError("SW allowed range rỗng")

    logger.info(
        "[traffic] %s scan %d months [%s → %s]",
        domain, len(months_range),
        range_start.strftime("%Y-%m"), range_end.strftime("%Y-%m"),
    )

    # Song song: N × global per-month + 1 country (full range) + 1 source + 1 social
    global_tasks = [_fetch_global(domain, fr, to, headers) for fr, to in months_range]
    country_task = _fetch_country(domain, range_start, range_end, headers, global_total=0)
    source_task = _fetch_sources(domain, range_start, range_end, headers)
    social_task = _fetch_social(domain, range_start, range_end, headers)

    results = await asyncio.gather(
        *global_tasks, country_task, source_task, social_task,
        return_exceptions=True,
    )
    n = len(global_tasks)
    global_results = results[:n]
    country_raw, source_raw, social_raw = results[n], results[n + 1], results[n + 2]

    all_global: list[dict] = []
    for r in global_results:
        if isinstance(r, Exception) or not r:
            continue
        all_global.extend(r)

    period_now = months_range[-1][0].strftime("%Y-%m")

    if not all_global:
        return {
            "monthly_visits": 0,
            "period_month": period_now,
            "domain": domain,
            "found": False,
            "traffic_details": None,
        }

    latest = max(all_global, key=lambda x: x.get("period_month") or "")
    monthly_visits = int(latest.get("total_visits_monthly") or 0)
    period_month = latest.get("period_month") or period_now

    country_data = None if isinstance(country_raw, Exception) else country_raw
    source_data = None if isinstance(source_raw, Exception) else source_raw
    social_data = None if isinstance(social_raw, Exception) else social_raw

    # Country: total_visits_monthly trong country dựa global_total = 0 do chưa biết tổng.
    # Tính lại theo monthly_visits của tháng latest.
    if country_data and monthly_visits:
        for row in country_data:
            share_pct = row.get("traffic_share_percentage") or 0
            if share_pct:
                row["total_visits_monthly"] = round(monthly_visits * share_pct / 100)

    # Source period_month set theo range_start (default từ _fetch_sources) — override sang latest
    if isinstance(source_data, dict):
        source_data["period_month"] = period_month

    details: dict = {"global": all_global}
    if country_data:
        details["country"] = country_data
    if source_data:
        details["source"] = source_data
    if social_data:
        details["social"] = social_data

    logger.info(
        "[traffic] %s → %s visits %s | groups=%s | calls=%d",
        domain, f"{monthly_visits:,}", period_month, list(details.keys()),
        n + 3,
    )

    return {
        "monthly_visits": monthly_visits,
        "period_month": period_month,
        "domain": domain,
        "found": True,
        "traffic_details": details,
    }
