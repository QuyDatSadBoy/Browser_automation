"""SMS OTP provider status — check balance + lookup country/service name."""
from fastapi import APIRouter, Depends

from app.core.config import settings
from app.deps import get_current_user
from app.services.signup.sms_otp import SmsOtpService

router = APIRouter(prefix="/api/sms", tags=["sms"])

@router.get("/status")
async def sms_status(_=Depends(get_current_user)):
    """Check connection + balance + lookup tên cho country/product ID đang config."""
    svc = SmsOtpService()
    result = await svc.check_balance()
    country_name = ""
    product_name = ""
    if svc.provider == "smspool":
        country_name = await SmsOtpService._smspool_lookup_name("country", svc.default_country)
        product_name = await SmsOtpService._smspool_lookup_name("service", svc.default_product)
    return {
        "provider": svc.provider,
        "enabled": svc.enabled,
        "api_key_masked": (svc.api_key[:4] + "***" + svc.api_key[-4:]) if len(svc.api_key) > 8 else "",
        "ok": result["ok"],
        "balance": result["balance"],
        "currency": result["currency"],
        "error": result["error"],
        "default_country": svc.default_country,
        "default_country_name": country_name,
        "default_product": svc.default_product,
        "default_product_name": product_name,
        "default_operator": svc.default_operator,
        "timeout_sec": settings.sms_otp_timeout_sec,
        "docs_url": (
            "https://www.smspool.net/my/settings" if svc.provider == "smspool"
            else "https://5sim.net/profile" if svc.provider == "5sim"
            else "https://sms-activate.org/en/profile"
        ),
    }


@router.get("/countries")
async def list_countries(_=Depends(get_current_user)):
    """List quốc gia SMSPool hỗ trợ (cache trong process)."""
    svc = SmsOtpService()
    if svc.provider != "smspool":
        return []
    return await SmsOtpService.smspool_list("country")


@router.get("/services")
async def list_services(_=Depends(get_current_user)):
    """List service (Shopee, Google, Facebook, ...) SMSPool hỗ trợ."""
    svc = SmsOtpService()
    if svc.provider != "smspool":
        return []
    return await SmsOtpService.smspool_list("service")
