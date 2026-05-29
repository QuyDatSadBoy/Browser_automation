# Backend — Affiliate Hub

## Cài đặt

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

## Chạy

```bash
uvicorn app.main:app --reload --port 8088 --loop asyncio  # --loop asyncio: bắt buộc cho CloakBrowser (tránh uvloop subprocess hang)
```

API docs: <http://localhost:8088/docs>
