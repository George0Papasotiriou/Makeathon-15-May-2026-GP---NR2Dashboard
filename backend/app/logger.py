import logging
import sys
from datetime import UTC, datetime

from app.settings import settings

_LEVEL_MAP: dict[str, int] = {
    "debug": logging.DEBUG,
    "info": logging.INFO,
    "warning": logging.WARNING,
    "error": logging.ERROR,
}

_STANDARD_LOG_RECORD_KEYS: set[str] = {
    "name",
    "msg",
    "args",
    "levelname",
    "levelno",
    "pathname",
    "filename",
    "module",
    "exc_info",
    "exc_text",
    "stack_info",
    "lineno",
    "funcName",
    "created",
    "msecs",
    "relativeCreated",
    "thread",
    "threadName",
    "processName",
    "process",
    "message",
    "taskName",
}


class _ConsoleFormatter(logging.Formatter):
    """Format: [HH:MM:SS.mmm] [LEVEL] [module] message {data}"""

    def format(self, record: logging.LogRecord) -> str:
        ts = datetime.now(UTC).strftime("%H:%M:%S.%f")[:-3]
        level = record.levelname
        module = record.name
        msg = record.getMessage()
        extras = {k: v for k, v in record.__dict__.items() if k not in _STANDARD_LOG_RECORD_KEYS}
        suffix = f" {extras}" if extras else ""
        return f"[{ts}] [{level}] [{module}] {msg}{suffix}"


def setup_logging() -> None:
    root = logging.getLogger()
    root.setLevel(_LEVEL_MAP[settings.LOG_LEVEL])
    root.handlers.clear()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(_ConsoleFormatter())
    root.addHandler(handler)


def get_logger(module: str) -> logging.Logger:
    return logging.getLogger(module)
