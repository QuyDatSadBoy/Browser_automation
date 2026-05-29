# AGENTS.md

Quy ước cho AI coding agent khi làm việc trong repo này.

---

## 1. Skill có sẵn

> **BẮT BUỘC**: match task → load file SKILL.md tương ứng **TRƯỚC KHI** hành động. Dùng `read_file` để đọc đầy đủ. Nhiều skill có thể kết hợp.

| Tình huống | Skill |
| --- | --- |
| Thêm feature mới / sửa >1 file / refactor | [.agents/skills/incremental-implementation/SKILL.md](.agents/skills/incremental-implementation/SKILL.md) |
| Lỗi / test fail / behavior sai | [.agents/skills/debugging-and-error-recovery/SKILL.md](.agents/skills/debugging-and-error-recovery/SKILL.md) |
| Viết / review React + Next.js | [.agents/skills/vercel-react-best-practices/SKILL.md](.agents/skills/vercel-react-best-practices/SKILL.md) |
| Thiết kế / polish UI, audit UX | [.agents/skills/impeccable/SKILL.md](.agents/skills/impeccable/SKILL.md) |
| Trước khi build FE (lấy design system) | [.github/prompts/ui-ux-pro-max/ui_ux.prompt.md](.github/prompts/ui-ux-pro-max/ui_ux.prompt.md) |
| Animation web | `.agents/skills/gsap-*` (core, timeline, scrolltrigger, react, plugins, performance, utils) |
| 3D scene | `.agents/skills/threejs-*` (fundamentals, geometry, materials, textures, lighting, shaders, loaders, animation, interaction, postprocessing) |

---

## 2. Cấu trúc thư mục

```text
backend/app/
├── main.py            # FastAPI entry — chỉ wire router, startup seed admin
├── core/              # config, db, logger
├── models/            # SQLAlchemy (1 file / 1 bảng)
├── schemas/           # Pydantic DTO (1 file / 1 resource)
├── api/               # Router — mỏng, KHÔNG business logic
├── services/          # TẤT CẢ business logic ở đây
│   ├── crawlers/      # 1 file / 1 trang nguồn + registry.py
│   ├── browser/       # CloakBrowser session (chỉ 1 chỗ)
│   ├── signup/        # agent_runner, sms_otp, email_reader
│   ├── captcha/       # capsolver.py
│   └── storage/       # profile JSON / instruction TXT I/O
└── deps.py

backend/data/          # runtime: app.db (SQLite), profiles/*.json, instructions/*.txt

frontend/
├── app/<route>/page.tsx
├── components/<Name>.tsx
└── lib/api.ts         # API client — KHÔNG fetch trong component
```

### Quy ước đặt code

| Loại code | Đặt ở đâu |
| --- | --- |
| Endpoint HTTP | `api/<resource>.py` — parse request → gọi service → trả response |
| Business logic | `services/...` — luôn ở đây, không ở router |
| DB query | `services/*_service.py` |
| Model / DTO | `models/<table>.py` / `schemas/<resource>.py` (1 file / 1 thứ) |
| Crawler trang mới | `services/crawlers/<source>.py` + đăng ký `registry.py` |
| Browser session | Chỉ qua `services/browser/session.py` |
| Config | `core/config.py` (pydantic-settings) — KHÔNG `os.getenv()` rải rác |
| UI page / component | `frontend/app/<route>/page.tsx` / `frontend/components/` |

### Quy tắc code

- Import **đầu file**, không import trong hàm (trừ lib siêu nặng + chỉ dùng 1 chỗ, vd `browser_use`).
- Field / param mới phải có **default** (backward compatible).
- Tool schema LLM: KHÔNG `Optional[X]` → dùng `str = ""`, `int = 0`, `bool = False`.

---

## 3. DB & migration

- DB là **SQLite tự tạo** ở `backend/data/app.db` qua `Base.metadata.create_all` trong [backend/app/main.py](backend/app/main.py) — **KHÔNG dùng Alembic**.
- Thêm cột / bảng:
  1. Sửa model trong [backend/app/models/](backend/app/models/).
  2. Restart BE (hoặc nếu cột mới trên bảng cũ → xoá `data/app.db` mất dữ liệu test, **hoặc** thêm logic `_ensure_column` trong [backend/app/core/db.py](backend/app/core/db.py) như các cột hiện tại).
- Default admin `admin/1` được auto-seed bởi `seed_default_admin()` trong [backend/app/services/user_service.py](backend/app/services/user_service.py), gọi từ startup lifespan ([backend/app/main.py](backend/app/main.py)).

---

## 4. Lệnh thường dùng

| Mục đích | Lệnh |
| --- | --- |
| Python env | `python3 -m venv .venv && source .venv/bin/activate` |
| Python deps | `pip install -r requirements.txt` |
| Node deps | `npm install` |
| Run BE dev | `uvicorn app.main:app --reload --port 8088 --loop asyncio` |
| Run BE + log | `mkdir -p logs && uvicorn app.main:app --reload --port 8088 --loop asyncio 2>&1 \| tee -a logs/backend.log` |
| Run FE dev | `npm run dev` |
| Run FE + log | `mkdir -p logs && npm run dev 2>&1 \| tee -a logs/frontend.log` |
| Xem log realtime | `tail -f backend/logs/backend.log` / `tail -f frontend/logs/frontend.log` |
| Queue | `asyncio.Queue` in-process — **KHÔNG Celery** |

> BE bắt buộc `--loop asyncio` (CloakBrowser hang trên uvloop).

---

## 5. Lưu ý vận hành

- App đang **auto-reload** → đừng kill terminal / restart server, chỉ save file. Tránh edit khi job đang chạy (reload sẽ kill job).
- **Update** file thay vì xoá-tạo (đặc biệt `docs/*`, `README*`).
- `.env` chứa secret thật → không log ra console, không commit (đã gitignore).
- **Debug bug — BẮT BUỘC đọc log TRƯỚC khi sửa code**:
  - BE: `tail -n 200 backend/logs/backend.log` hoặc `grep -i "error\|exception\|traceback" backend/logs/backend.log | tail -50`
  - FE: `tail -n 200 frontend/logs/frontend.log`
  - Lọc theo job: `grep "job_id=<N>" backend/logs/backend.log`
- Đừng tự ý refactor / "improve" code không liên quan đến request.
- Khi gặp lỗi → load skill `debugging-and-error-recovery`, đừng đoán mò.
