"""Auto-signup engine using browser-use + CloakBrowser + CapSolver."""

from .agent_runner import run_signup_attempt
from .instruction_parser import parse_instruction_text, build_field_rules_block

__all__ = [
    "run_signup_attempt",
    "parse_instruction_text",
    "build_field_rules_block",
]
