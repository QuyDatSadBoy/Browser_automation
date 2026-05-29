"""Smoke test trực tiếp agent_runner — không cần UI/auth."""
import asyncio
import json
import logging
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.services.signup.agent_runner import run_signup_attempt
from app.core.config import settings


async def main():
    program = {
        "id": 2,
        "name": "Webflow",
        "signup_url": "https://webflow.com/affiliates",
    }
    profile_path = settings.data_path("profiles") / "dat_main.json"
    profile = json.loads(profile_path.read_text())

    print(f"\n=== Testing signup ===")
    print(f"Model: {settings.signup_llm_model}")
    print(f"Max steps: {settings.signup_max_steps}")
    print(f"Program: {program['name']} - {program['signup_url']}")
    print(f"Profile: {profile['email']}")
    print(f"Headless: False (visible browser)\n")

    result = await run_signup_attempt(
        job_id=999,
        program=program,
        profile=profile,
        instruction_content="",
        instruction_filename="",
        extra_prompt="If asked for traffic source, choose Blog / Organic search.",
        headless=False,
    )
    print("\n=== RESULT ===")
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
