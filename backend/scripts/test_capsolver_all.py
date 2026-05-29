"""Smoke-test toàn bộ solve methods của CapSolver client.

Test trên các demo site công khai để verify từng task type hoạt động.
Không cần browser; chỉ gọi CapSolver REST API.
"""
import asyncio
import base64
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.captcha.capsolver import CapSolver, CapSolverError


# Demo sitekeys công khai (không thay đổi):
DEMOS = {
    "recaptcha_v2": {
        "url": "https://www.google.com/recaptcha/api2/demo",
        "sitekey": "6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-",
    },
    "recaptcha_v3": {
        # 2captcha official v3 demo (sitekey rút từ docs)
        "url": "https://2captcha.com/demo/recaptcha-v3",
        "sitekey": "6LfB5_IbAAAAAMCtsjEHEHKqcB9iQocwwxTiihJu",
        "action": "demo_action",
    },
    "hcaptcha": {
        # 3rd-party demo (accounts.hcaptcha.com bị CapSolver blocklist)
        "url": "https://democaptcha.com/demo-form-eng/hcaptcha.html",
        "sitekey": "338af34c-7bcb-4c7c-900b-acbec73d7d43",
    },
    "turnstile": {
        # Real production sitekey (Orbit Rings — proven trong job#8)
        "url": "https://orbitrings.goaffpro.com/create-account",
        "sitekey": "0x4AAAAAAALRXKa8yBsKwSxF",
    },
}


# Captcha-like image với 5 ký tự — base64 PNG (sinh bằng Pillow nếu có,
# nếu không có Pillow thì dùng PNG sample sẵn).
def _make_text_captcha_image() -> str:
    """Sinh 1 ảnh chữ "A4K7P" trên nền trắng, return base64 (không prefix)."""
    try:
        from PIL import Image, ImageDraw, ImageFont
        import io
        img = Image.new("RGB", (240, 90), "white")
        d = ImageDraw.Draw(img)
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 48)
        except Exception:
            font = ImageFont.load_default()
        d.text((25, 15), "A4K7P", fill="black", font=font)
        # vài đường nhiễu
        d.line((0, 45, 240, 70), fill="gray", width=2)
        d.line((10, 10, 230, 80), fill="lightgray", width=2)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode()
    except Exception:
        # fallback: PNG 200x80 trống — sẽ trả empty từ CapSolver
        return TINY_PNG_B64


# 1x1 PNG black pixel — base64 (placeholder; OCR sẽ trả empty hoặc rác)
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


async def run_one(name: str, coro):
    print(f"\n=== {name} ===", flush=True)
    t0 = time.time()
    try:
        result = await coro
        dt = time.time() - t0
        preview = str(result)
        if len(preview) > 120:
            preview = preview[:120] + "..."
        print(f"PASS ({dt:.1f}s) → {preview}", flush=True)
        return True
    except CapSolverError as e:
        dt = time.time() - t0
        print(f"FAIL ({dt:.1f}s) → CapSolverError: {e}", flush=True)
        return False
    except Exception as e:
        dt = time.time() - t0
        print(f"FAIL ({dt:.1f}s) → {type(e).__name__}: {e}", flush=True)
        return False


async def main():
    cap = CapSolver()
    if not cap.enabled:
        print("CAPSOLVER_API_KEY missing — aborted")
        return 1

    results = {}

    # 0. Balance
    results["balance"] = await run_one("balance", cap.balance())

    # 1. reCAPTCHA v2
    r = DEMOS["recaptcha_v2"]
    results["recaptcha_v2"] = await run_one(
        "solve_recaptcha_v2", cap.solve_recaptcha_v2(r["url"], r["sitekey"]),
    )

    # 2. reCAPTCHA v3
    r = DEMOS["recaptcha_v3"]
    results["recaptcha_v3"] = await run_one(
        "solve_recaptcha_v3",
        cap.solve_recaptcha_v3(r["url"], r["sitekey"], action=r["action"], min_score=0.3),
    )

    # 3. hCaptcha
    r = DEMOS["hcaptcha"]
    results["hcaptcha"] = await run_one(
        "solve_hcaptcha", cap.solve_hcaptcha(r["url"], r["sitekey"]),
    )

    # 4. Turnstile (Cloudflare demo)
    r = DEMOS["turnstile"]
    results["turnstile"] = await run_one(
        "solve_turnstile", cap.solve_turnstile(r["url"], r["sitekey"]),
    )

    # 5. ImageToText — captcha-like image
    img_b64 = _make_text_captcha_image()
    results["image_to_text"] = await run_one(
        "solve_image_to_text", cap.solve_image_to_text(img_b64),
    )

    # 6. ReCaptchaV2Classification — recognition endpoint, dùng grid image giả
    # CapSolver chấp nhận payload nhưng có thể trả 'no objects' với ảnh giả → tính endpoint pass nếu không raise CapSolverError.
    results["recaptcha_v2_classification"] = await run_one(
        "solve_recaptcha_v2_classification",
        cap.solve_recaptcha_v2_classification(img_b64, question="/m/0k4j"),
    )

    # 7. AwsWafClassification — dùng 1 ảnh giả + question toycarcity
    results["aws_waf_classification"] = await run_one(
        "solve_aws_waf_classification",
        cap.solve_aws_waf_classification([img_b64], question="aws:toycarcity:carcity"),
    )

    # 8. VisionEngine — slider_1, dùng 2 ảnh giả
    results["vision_engine"] = await run_one(
        "solve_vision_engine",
        cap.solve_vision_engine(module="slider_1", image_base64=img_b64, image_background_base64=img_b64),
    )

    print("\n=== SUMMARY ===")
    for k, v in results.items():
        print(f"  {k:20s}  {'PASS' if v else 'FAIL'}")

    failed = [k for k, v in results.items() if not v]
    return 0 if not failed else 2


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
