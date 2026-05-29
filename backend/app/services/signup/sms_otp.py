"""
SMS OTP receive service wrapper.

Provider mặc định: **smspool.net** (HTTP API, form `key=<API_KEY>`).
- Rent số → đợi SMS → đọc code → finish/cancel.
- API key trong env: SMS_OTP_API_KEY.

Cũng support fallback **5sim** và **sms-activate** (chọn qua SMS_OTP_PROVIDER).

Dùng từ agent_runner: tool `request_sms_number(country, product)` rồi `read_sms_otp_code(rental_id)`.

SMSPool API ref: https://documenter.getpostman.com/view/30155063/2s9YXmZ1JY
- POST https://api.smspool.net/purchase/sms   key, country (ID, vd 241=VN), service (ID, vd 823=Shopee)
- POST https://api.smspool.net/sms/check       key, orderid
- POST https://api.smspool.net/sms/cancel      key, orderid
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class SmsOtpError(Exception):
    pass


class SmsOtpService:
    """Wrapper cho smspool.net (mặc định). Stateless — rental_id giữ ở caller."""

    def __init__(self) -> None:
        self.provider = (settings.sms_otp_provider or "smspool").lower()
        self.api_key = settings.sms_otp_api_key or ""
        self.default_country = settings.sms_otp_country or ""
        self.default_operator = settings.sms_otp_operator or "any"
        self.default_product = settings.sms_otp_product or ""

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    async def buy_number(self, country: str = "", operator: str = "", product: str = "") -> dict:
        """Rent 1 số mới. Return {rental_id, phone, country, operator, product}."""
        if not self.enabled:
            raise SmsOtpError("SMS_OTP_API_KEY chưa cấu hình")
        country = country or self.default_country
        operator = operator or self.default_operator
        product = product or self.default_product

        if self.provider == "smspool":
            # SMSPool: country & service là ID dạng số (vd VN=241, Shopee=823).
            # Danh sách: https://api.smspool.net/country/retrieve_all  /  /service/retrieve_all
            url = "https://api.smspool.net/purchase/sms"
            data = {
                "key": self.api_key,
                "country": country or "1",       # 1 = US mặc định nếu chưa set
                "service": product or "1",       # 1 = "Any" service
            }
            if operator and operator.lower() != "any":
                data["pool"] = operator          # SMSPool dùng `pool` ~ operator
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.post(url, data=data)
            if r.status_code != 200:
                raise SmsOtpError(f"smspool buy failed {r.status_code}: {r.text[:200]}")
            try:
                resp = r.json()
            except Exception:
                raise SmsOtpError(f"smspool buy: invalid JSON: {r.text[:200]}")
            if not resp.get("success"):
                raise SmsOtpError(f"smspool buy: {resp.get('message') or resp}")
            phone = str(resp.get("number") or resp.get("phonenumber") or "")
            if phone and not phone.startswith("+"):
                phone = f"+{phone}"
            return {
                "rental_id": str(resp.get("order_id") or resp.get("orderid") or ""),
                "phone": phone,
                "country": country,
                "operator": operator,
                "product": product,
            }

        if self.provider == "5sim":
            url = f"https://5sim.net/v1/user/buy/activation/{country}/{operator}/{product}"
            headers = {"Authorization": f"Bearer {self.api_key}", "Accept": "application/json"}
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.get(url, headers=headers)
            if r.status_code != 200:
                raise SmsOtpError(f"5sim buy failed {r.status_code}: {r.text[:200]}")
            data = r.json()
            return {
                "rental_id": str(data["id"]),
                "phone": data["phone"],  # đã có dấu '+' country code
                "country": country,
                "operator": operator,
                "product": product,
            }

        if self.provider == "sms-activate":
            url = (
                f"https://api.sms-activate.org/stubs/handler_api.php"
                f"?api_key={self.api_key}&action=getNumber&service={product}&country={country}"
            )
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.get(url)
            text = r.text
            # response: ACCESS_NUMBER:ID:NUMBER
            if not text.startswith("ACCESS_NUMBER:"):
                raise SmsOtpError(f"sms-activate buy failed: {text[:200]}")
            _, rid, phone = text.split(":", 2)
            return {"rental_id": rid, "phone": f"+{phone}", "country": country, "operator": "", "product": product}

        raise SmsOtpError(f"Unsupported SMS provider: {self.provider}")

    async def wait_for_code(self, rental_id: str, timeout_sec: int = 180, poll_interval: float = 5.0) -> str:
        """Poll cho đến khi nhận SMS chứa code. Return code (digits)."""
        if not self.enabled:
            raise SmsOtpError("SMS_OTP_API_KEY chưa cấu hình")

        deadline = asyncio.get_event_loop().time() + timeout_sec
        last_status = ""

        while asyncio.get_event_loop().time() < deadline:
            try:
                code = await self._poll_once(rental_id)
                if code:
                    return code
            except SmsOtpError as e:
                last_status = str(e)
                logger.warning(f"SMS poll {rental_id}: {e}")
            await asyncio.sleep(poll_interval)

        raise SmsOtpError(f"SMS timeout sau {timeout_sec}s (last status: {last_status})")

    async def _poll_once(self, rental_id: str) -> str:
        if self.provider == "smspool":
            url = "https://api.smspool.net/sms/check"
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(url, data={"key": self.api_key, "orderid": rental_id})
            if r.status_code != 200:
                raise SmsOtpError(f"smspool check failed {r.status_code}: {r.text[:120]}")
            try:
                data = r.json()
            except Exception:
                raise SmsOtpError(f"smspool check: invalid JSON: {r.text[:120]}")
            # status: 1=pending, 3=completed, 6=refunded, 4=expired
            status = data.get("status")
            if status == 3:
                code = data.get("code") or ""
                if code:
                    return str(code)
                text = data.get("sms") or data.get("full_sms") or ""
                m = re.search(r"\b(\d{4,8})\b", text)
                if m:
                    return m.group(1)
                return ""
            if status in (6, 4, "6", "4"):
                raise SmsOtpError(f"smspool order {rental_id} status={status} ({data.get('message','')})")
            return ""

        if self.provider == "5sim":
            url = f"https://5sim.net/v1/user/check/{rental_id}"
            headers = {"Authorization": f"Bearer {self.api_key}", "Accept": "application/json"}
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(url, headers=headers)
            if r.status_code != 200:
                raise SmsOtpError(f"check failed {r.status_code}: {r.text[:120]}")
            data = r.json()
            sms_list = data.get("sms") or []
            for sms in sms_list:
                text = sms.get("text") or sms.get("code") or ""
                code = sms.get("code")
                if code:
                    return str(code)
                m = re.search(r"\b(\d{4,8})\b", text)
                if m:
                    return m.group(1)
            status = data.get("status") or ""
            if status in ("CANCELED", "TIMEOUT", "BANNED"):
                raise SmsOtpError(f"rental {rental_id} status={status}")
            return ""

        if self.provider == "sms-activate":
            url = (
                f"https://api.sms-activate.org/stubs/handler_api.php"
                f"?api_key={self.api_key}&action=getStatus&id={rental_id}"
            )
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(url)
            text = r.text
            if text.startswith("STATUS_OK:"):
                return text.split(":", 1)[1].strip()
            if text in ("STATUS_WAIT_CODE", "STATUS_WAIT_RETRY"):
                return ""
            raise SmsOtpError(f"sms-activate: {text[:120]}")

        raise SmsOtpError(f"Unsupported provider: {self.provider}")

    async def finish(self, rental_id: str) -> None:
        """Đánh dấu hoàn thành (giải phóng số). Best-effort."""
        if not self.enabled:
            return
        try:
            if self.provider == "smspool":
                # SMSPool tự đóng order sau khi nhận SMS — không cần finish riêng.
                return
            if self.provider == "5sim":
                url = f"https://5sim.net/v1/user/finish/{rental_id}"
                headers = {"Authorization": f"Bearer {self.api_key}", "Accept": "application/json"}
                async with httpx.AsyncClient(timeout=15) as client:
                    await client.get(url, headers=headers)
            elif self.provider == "sms-activate":
                url = (
                    f"https://api.sms-activate.org/stubs/handler_api.php"
                    f"?api_key={self.api_key}&action=setStatus&status=6&id={rental_id}"
                )
                async with httpx.AsyncClient(timeout=15) as client:
                    await client.get(url)
        except Exception as e:
            logger.warning(f"SMS finish {rental_id} failed: {e}")

    async def cancel(self, rental_id: str) -> None:
        if not self.enabled:
            return
        try:
            if self.provider == "smspool":
                url = "https://api.smspool.net/sms/cancel"
                async with httpx.AsyncClient(timeout=15) as client:
                    await client.post(url, data={"key": self.api_key, "orderid": rental_id})
                return
            if self.provider == "5sim":
                url = f"https://5sim.net/v1/user/cancel/{rental_id}"
                headers = {"Authorization": f"Bearer {self.api_key}", "Accept": "application/json"}
                async with httpx.AsyncClient(timeout=15) as client:
                    await client.get(url, headers=headers)
            elif self.provider == "sms-activate":
                url = (
                    f"https://api.sms-activate.org/stubs/handler_api.php"
                    f"?api_key={self.api_key}&action=setStatus&status=8&id={rental_id}"
                )
                async with httpx.AsyncClient(timeout=15) as client:
                    await client.get(url)
        except Exception as e:
            logger.warning(f"SMS cancel {rental_id} failed: {e}")

    async def check_balance(self) -> dict:
        """Test API key + lấy số dư. Return {ok, balance, currency, error}."""
        if not self.api_key:
            return {"ok": False, "balance": "", "currency": "", "error": "SMS_OTP_API_KEY chưa cấu hình"}
        try:
            if self.provider == "smspool":
                # SMSPool: POST /request/balance với form key=...
                async with httpx.AsyncClient(timeout=15) as client:
                    r = await client.post(
                        "https://api.smspool.net/request/balance",
                        data={"key": self.api_key},
                    )
                if r.status_code != 200:
                    return {"ok": False, "balance": "", "currency": "", "error": f"HTTP {r.status_code}: {r.text[:160]}"}
                try:
                    data = r.json()
                except Exception:
                    return {"ok": False, "balance": "", "currency": "", "error": f"Invalid JSON: {r.text[:160]}"}
                bal = str(data.get("balance", "") or "")
                if not bal:
                    return {"ok": False, "balance": "", "currency": "USD", "error": data.get("message") or "no balance field"}
                return {"ok": True, "balance": bal, "currency": "USD", "error": ""}

            if self.provider == "5sim":
                async with httpx.AsyncClient(timeout=15) as client:
                    r = await client.get(
                        "https://5sim.net/v1/user/profile",
                        headers={"Authorization": f"Bearer {self.api_key}", "Accept": "application/json"},
                    )
                if r.status_code != 200:
                    return {"ok": False, "balance": "", "currency": "", "error": f"HTTP {r.status_code}: {r.text[:160]}"}
                d = r.json()
                return {"ok": True, "balance": str(d.get("balance", "")), "currency": "RUB", "error": ""}

            if self.provider == "sms-activate":
                async with httpx.AsyncClient(timeout=15) as client:
                    r = await client.get(
                        "https://api.sms-activate.org/stubs/handler_api.php",
                        params={"api_key": self.api_key, "action": "getBalance"},
                    )
                if r.status_code != 200:
                    return {"ok": False, "balance": "", "currency": "", "error": f"HTTP {r.status_code}"}
                text = r.text.strip()
                if text.startswith("ACCESS_BALANCE:"):
                    return {"ok": True, "balance": text.split(":", 1)[1].strip(), "currency": "RUB", "error": ""}
                return {"ok": False, "balance": "", "currency": "", "error": text[:160]}

            return {"ok": False, "balance": "", "currency": "", "error": f"Unsupported provider: {self.provider}"}
        except Exception as e:
            return {"ok": False, "balance": "", "currency": "", "error": f"{e.__class__.__name__}: {e}"}

    @staticmethod
    async def _smspool_lookup_name(kind: str, item_id: str) -> str:
        """Tra tên country/service từ ID (best-effort, cache trong process)."""
        if not item_id:
            return ""
        cache_attr = f"_cache_{kind}"
        cache = getattr(SmsOtpService, cache_attr, None)
        if cache is None:
            try:
                url = f"https://api.smspool.net/{kind}/retrieve_all"
                async with httpx.AsyncClient(timeout=15) as client:
                    r = await client.get(url)
                items = r.json() if r.status_code == 200 else []
                cache = {str(x.get("ID") or x.get("id")): (x.get("name") or x.get("country") or "") for x in items}
                setattr(SmsOtpService, cache_attr, cache)
            except Exception:
                cache = {}
                setattr(SmsOtpService, cache_attr, cache)
        return cache.get(str(item_id), "")

    @staticmethod
    async def smspool_list(kind: str) -> list[dict]:
        """List full country / service cho dropdown FE. Return [{id, name}]."""
        list_attr = f"_list_{kind}"
        cached = getattr(SmsOtpService, list_attr, None)
        if cached is not None:
            return cached
        try:
            url = f"https://api.smspool.net/{kind}/retrieve_all"
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(url)
            items = r.json() if r.status_code == 200 else []
            out = [
                {
                    "id": str(x.get("ID") or x.get("id") or ""),
                    "name": str(x.get("name") or x.get("country") or ""),
                }
                for x in items
            ]
            out = [x for x in out if x["id"] and x["name"]]
            out.sort(key=lambda x: x["name"].lower())
            setattr(SmsOtpService, list_attr, out)
            # Cũng populate cache lookup name
            setattr(SmsOtpService, f"_cache_{kind}", {x["id"]: x["name"] for x in out})
            return out
        except Exception:
            return []
