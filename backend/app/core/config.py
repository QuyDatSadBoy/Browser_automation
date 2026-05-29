from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Affiliate Hub"
    database_url: str = "sqlite+aiosqlite:///./data/app.db"
    session_cookie_name: str = "ah_session"
    session_ttl_hours: int = 720
    cors_origins_raw: str = "http://localhost:3000"
    data_dir: Path = Path("./data")
    cloak_browser_path: str = ""
    headless: bool = True
    capsolver_api_key: str = ""
    capsolver_app_id: str = ""
    # SimilarWeb traffic scan (port từ api-adecos)
    similarweb_email: str = ""
    similarweb_password: str = ""
    selenium_hub_url: str = ""
    novnc_url: str = "http://localhost:7900"

    # LLM cho browser-use auto-signup (Gemini ưu tiên)
    gemini_api_key: str = ""
    openai_api_key: str = ""
    signup_llm_model: str = "gemini-3.5-flash"
    signup_max_steps: int = 60
    signup_worker_concurrency: int = 5  # số job signup chạy song song
    signup_user_agent: str = (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    )

    # Proxy cho browser (ngăn ban IP / rate-limit)
    # Format: "http://user:pass@host:port" hoặc "socks5://host:port"
    proxy_url: str = ""
    proxy_bypass: str = "localhost,127.0.0.1"

    # SMS OTP receive service (smspool.net mặc định; fallback 5sim | sms-activate)
    sms_otp_provider: str = "smspool"  # smspool | 5sim | sms-activate
    sms_otp_api_key: str = ""
    # SMSPool dùng ID dạng số: country (vd 241=VN, 1=US), product/service (vd 823=Shopee, 1=Any)
    sms_otp_country: str = "1"
    sms_otp_operator: str = "any"
    sms_otp_product: str = "1"
    sms_otp_timeout_sec: int = 180

    # Email verification (IMAP). Có thể override per-profile qua profile['imap'].
    imap_host: str = "imap.gmail.com"
    imap_port: int = 993
    imap_ssl: bool = True
    imap_user: str = ""
    imap_password: str = ""
    imap_timeout_sec: int = 180

    # SerpAPI (Google Ads Transparency Center)
    serpapi_keys: str = ""

    @property
    def cors_origins(self) -> List[str]:
        return [s.strip() for s in self.cors_origins_raw.split(",") if s.strip()]

    @property
    def serpapi_keys_list(self) -> List[str]:
        return [k.strip() for k in self.serpapi_keys.split(",") if k.strip()]

    def data_path(self, *parts: str) -> Path:
        return self.data_dir.joinpath(*parts)


settings = Settings()
