# Affiliate Hub — Auto Browser Signup Agent (Linux / macOS)

> AI agent tự mở trình duyệt stealth, đăng ký hàng loạt chương trình affiliate, tự giải CAPTCHA, tự nhận OTP qua SMS & email.

**Windows?** Đọc [README.windows.md](README.windows.md).

---

## ✅ Đã verify (May 2026)

5 link Goaffpro chạy **song song**, Cloudflare Turnstile — **5/5 captcha pass, 5/5 đăng ký thành công (100%)**.

---

## Tính năng chính

- **Crawl** affiliate program từ nhiều nguồn (OpenAffiliate, GoAffPro…) — `/sources`, `/jobs`.
- **Lọc / xếp hạng** theo traffic SimilarWeb, commission, cookie days — `/programs`, `/shortlists`.
- **Auto signup** bằng AI browser agent (Gemini 3.5 Flash + Chrome stealth) — `/signup`.
- **Auto giải captcha**: Cloudflare Turnstile, reCAPTCHA v2/v3, hCaptcha, FunCaptcha, AWS WAF, Cloudflare interstitial.
- **Auto OTP**: SMSPool / 5sim / sms-activate (SMS) + IMAP Gmail (email verify).
- **Multi-profile / proxy / email**: round-robin chạy song song nhiều job (mặc định 5 job/lúc).
- **Báo cáo trực quan**: progress bar % thành công, screenshot từng bước, lịch sử click xem chi tiết từng program trong job.
- **Banner cảnh báo**: thiếu API key nào → UI báo đỏ ngay, không phải đọc log.

---

## Yêu cầu hệ thống

| Thứ | Phiên bản |
| --- | --- |
| Python | 3.11+ |
| Node.js | 18+ |
| OS | Linux / macOS (Windows → dùng WSL2 hoặc [README.windows.md](README.windows.md)) |
| RAM | ≥ 8 GB |

---

## Cài đặt (5 phút)

```bash
# 1. Clone
git clone <repo-url> affiliate-hub
cd affiliate-hub

# 2. Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
cp .env.example .env          # mở .env điền 2 key bắt buộc bên dưới

# 3. Frontend
cd ../frontend
npm install
```

### Điền `backend/.env` — chỉ cần 2 key bắt buộc

| Key | Lấy ở | Chi phí |
| --- | --- | --- |
| `GEMINI_API_KEY` | <https://aistudio.google.com/app/apikey> | Free 15 req/min |
| `CAPSOLVER_API_KEY` | <https://capsolver.com> → Dashboard | ~$0.001/captcha |

Các key khác (`PROXY_URL`, `SMS_OTP_API_KEY`, `IMAP_USER/PASSWORD`) là tuỳ chọn — site nào yêu cầu thì điền.

---

## Chạy (2 terminal)

**Terminal 1 — Backend:**

```bash
cd backend
source .venv/bin/activate
mkdir -p logs
uvicorn app.main:app --reload --port 8088 --loop asyncio 2>&1 | tee -a logs/backend.log
```

> Bắt buộc `--loop asyncio` (CloakBrowser hang trên uvloop).

**Terminal 2 — Frontend:**

```bash
cd frontend
mkdir -p logs
npm run dev 2>&1 | tee -a logs/frontend.log
```

Mở <http://localhost:3001> → **đăng nhập `admin` / `1`** (tài khoản admin được tạo tự động khi BE khởi động lần đầu).

---

## Dùng thế nào

1. `/library` → tạo Profile (họ tên, email mặc định, payment), Email (Gmail + App Password), Proxy (residential).
2. `/jobs` → bấm **Run** một crawler để lấy danh sách program. Hoặc nhập tay ở `/programs`.
3. `/shortlists` → tạo shortlist xếp hạng top program đáng đăng ký nhất.
4. `/signup` → chọn shortlist + program + profile/email/proxy → **Bắt đầu đăng ký**.
5. Theo dõi panel **Lịch sử jobs**: click vào job để xem progress bar % thành công + chi tiết từng program (status, message, steps, screenshot).

**Mỗi job có nhiều program** → click 1 job sẽ hiện danh sách kết quả **của tất cả program** trong job đó (success/fail/pending_verify riêng từng dòng).

---

## Cấu hình thêm (tuỳ chọn, trong `backend/.env`)

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `SIGNUP_WORKER_CONCURRENCY` | 5 | Số job đăng ký chạy song song |
| `SIGNUP_MAX_STEPS` | 60 | Số bước tối đa agent chạy / site (60 ≈ 3 phút) |
| `HEADLESS` | false | `true` = ẩn cửa sổ Chrome (deploy server) |
| `PROXY_URL` | — | `http://user:pass@host:port` (residential rotating) |

---

## Troubleshooting nhanh

| Triệu chứng | Xử lý |
| --- | --- |
| Banner báo "Thiếu LLM / CapSolver" | Điền key vào `backend/.env`, BE tự reload |
| `Executable doesn't exist` | Chạy `playwright install chromium` |
| Chrome bật rồi đứng im | BE phải chạy với `--loop asyncio`, `HEADLESS=false` |
| Site "IP blocked" | Điền `PROXY_URL` |
| Browser còn rác sau khi xong | Đã fix — `keep_alive=False` + `close()`+`kill()` trong finally |

Xem log:

```bash
tail -f backend/logs/backend.log
tail -f frontend/logs/frontend.log
```

---

## Bàn giao khách hàng

1. **KHÔNG gửi `backend/.env`** (gitignored). Gửi key qua kênh riêng (1Password / mail bảo mật).
2. Gửi kèm: `README.md` (Linux/Mac) + `README.windows.md` (Windows) + `backend/.env.example`.
3. Khách copy `.env.example` → `.env`, điền 2 key bắt buộc, chạy 2 lệnh `uvicorn` + `npm run dev`.
4. Đăng nhập `admin` / `1` → test 1 program goaffpro để verify.

---

## License

Internal use — MIC ACE.
