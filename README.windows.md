# Affiliate Hub — Auto Browser Signup Agent (Windows 10/11)

> Hướng dẫn cài đặt + chạy trên Windows 10/11 cho người không biết code. Dùng PowerShell, không cần WSL.

**Linux / macOS?** Đọc [README.md](README.md).

---

## Yêu cầu

| Phần mềm | Phiên bản | Link tải |
| --- | --- | --- |
| **Python** | 3.11 hoặc 3.12 | <https://www.python.org/downloads/windows/> — khi cài **TICK ô "Add Python to PATH"** |
| **Node.js** | 18 LTS trở lên | <https://nodejs.org/en/download> (chọn "Windows Installer .msi") |
| **Git for Windows** | mới nhất | <https://git-scm.com/download/win> |
| **Visual C++ Build Tools** | 2019+ | <https://visualstudio.microsoft.com/visual-cpp-build-tools/> (cần cho 1 vài package Python) |
| RAM | ≥ 8 GB | — |

Sau khi cài xong, **mở PowerShell mới** (Start → gõ `powershell`) và kiểm tra:

```powershell
python --version    # cần >= 3.11
node --version      # cần >= 18
git --version
```

> Nếu PowerShell báo "execution policy" khi activate venv, chạy 1 lần (Admin):
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```

---

## Cài đặt (5–10 phút)

Mở PowerShell, `cd` về thư mục bạn muốn để source:

```powershell
# 1. Clone source
git clone <repo-url> affiliate-hub
cd affiliate-hub

# 2. Backend
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
playwright install chromium
copy .env.example .env
notepad .env                # mở Notepad điền 2 key bắt buộc bên dưới

# 3. Frontend
cd ..\frontend
npm install
```

### Điền `backend\.env` — chỉ cần 2 key bắt buộc

| Key | Lấy ở | Chi phí |
| --- | --- | --- |
| `GEMINI_API_KEY` | <https://aistudio.google.com/app/apikey> | Free 15 req/min |
| `CAPSOLVER_API_KEY` | <https://capsolver.com> → Dashboard | ~$0.001/captcha |

Các key khác (`PROXY_URL`, `SMS_OTP_API_KEY`, `IMAP_USER/PASSWORD`) là tuỳ chọn.

---

## Chạy (mở 2 cửa sổ PowerShell)

### Terminal 1 — Backend (cổng 8088)

```powershell
cd C:\duong-dan\affiliate-hub\backend
.\.venv\Scripts\Activate.ps1
mkdir logs -Force | Out-Null
uvicorn app.main:app --reload --port 8088 --loop asyncio
```

> Bắt buộc `--loop asyncio` (CloakBrowser hang trên uvloop).
> Muốn lưu log ra file:
> ```powershell
> uvicorn app.main:app --reload --port 8088 --loop asyncio *>&1 | Tee-Object -FilePath logs\backend.log -Append
> ```

### Terminal 2 — Frontend (cổng 3001)

```powershell
cd C:\duong-dan\affiliate-hub\frontend
mkdir logs -Force | Out-Null
npm run dev
```

Lưu log:

```powershell
npm run dev *>&1 | Tee-Object -FilePath logs\frontend.log -Append
```

Mở trình duyệt: <http://localhost:3001> → đăng nhập **`admin` / `1`** (admin được tạo tự động lần đầu BE chạy).

---

## Lưu ý riêng cho Windows

1. **Windows Defender / Antivirus** có thể chặn Chromium của Playwright. Nếu Chrome không bật được:
   - Tạm tắt real-time protection 5 phút khi chạy `playwright install chromium`.
   - Hoặc add ngoại lệ cho thư mục `%LOCALAPPDATA%\ms-playwright\`.
2. **Firewall**: lần đầu chạy `uvicorn` Windows hỏi "cho phép truy cập mạng" → bấm **Allow**.
3. **Đường dẫn dài**: nếu `pip install` lỗi `path too long`, bật Long Path:
   - Win + R → `gpedit.msc` → Computer Configuration → Administrative Templates → System → Filesystem → Enable Win32 long paths → Enabled.
4. **Cổng 3001 / 8088 bị chiếm**: tìm process chiếm cổng
   ```powershell
   netstat -ano | findstr :8088
   taskkill /PID <pid> /F
   ```
5. **CloakBrowser** chạy ngầm trên Windows mặc định **không headless** — bạn sẽ thấy cửa sổ Chrome bật. Muốn ẩn: đặt `HEADLESS=true` trong `.env` (chỉ nên dùng khi đã verify chạy ổn).

---

## Dùng thế nào

Giống Linux — xem mục "Dùng thế nào" trong [README.md](README.md#dùng-thế-nào).

---

## Cấu hình thêm (`backend\.env`)

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `SIGNUP_WORKER_CONCURRENCY` | 5 | Số job đăng ký chạy song song |
| `SIGNUP_MAX_STEPS` | 60 | Số bước tối đa agent / site |
| `HEADLESS` | false | `true` = ẩn cửa sổ Chrome |
| `PROXY_URL` | — | `http://user:pass@host:port` |

---

## Troubleshooting (Windows)

| Triệu chứng | Xử lý |
| --- | --- |
| `python` không phải lệnh | Cài lại Python tick "Add to PATH", restart PowerShell |
| `Activate.ps1 cannot be loaded` | `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` |
| `pip install` báo lỗi build C++ | Cài Visual C++ Build Tools (link trên) |
| Chrome bật rồi đứng im | BE phải chạy `--loop asyncio`, kiểm tra Defender không chặn |
| Banner UI báo "Thiếu LLM / CapSolver" | Mở `backend\.env`, điền key, BE auto-reload |
| Cổng bị chiếm | `netstat -ano \| findstr :PORT` → `taskkill /PID <pid> /F` |
| Frontend trắng | Mở DevTools (F12) → tab Console xem lỗi; check `frontend\logs\frontend.log` |

Xem log realtime:

```powershell
Get-Content backend\logs\backend.log -Wait -Tail 100
Get-Content frontend\logs\frontend.log -Wait -Tail 100
```

---

## Bàn giao khách hàng

1. **KHÔNG gửi `backend\.env`** (gitignored). Gửi key qua kênh riêng.
2. Gửi kèm file này + `backend\.env.example`.
3. Khách copy `.env.example` → `.env`, điền 2 key bắt buộc, chạy 2 cửa sổ PowerShell ở trên.
4. Đăng nhập `admin` / `1` → test 1 program goaffpro.

---

## License

Internal use — MIC ACE.
