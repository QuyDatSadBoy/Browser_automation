import logging
import os
import sys
from logging.handlers import RotatingFileHandler

_FMT = "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s"

_root = logging.getLogger()
if not getattr(_root, "_ah_configured", False):
    _root.setLevel(logging.INFO)
    _formatter = logging.Formatter(_FMT)

    _stream = logging.StreamHandler(sys.stdout)
    _stream.setFormatter(_formatter)
    _root.addHandler(_stream)

    try:
        _log_dir = os.path.join(os.path.dirname(__file__), "..", "..", "logs")
        os.makedirs(_log_dir, exist_ok=True)
        _file = RotatingFileHandler(
            os.path.join(_log_dir, "backend.log"),
            maxBytes=20 * 1024 * 1024,
            backupCount=5,
            encoding="utf-8",
        )
        _file.setFormatter(_formatter)
        _root.addHandler(_file)
    except Exception:
        pass

    _root._ah_configured = True


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
