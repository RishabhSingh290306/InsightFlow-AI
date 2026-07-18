"""Application logging configuration.

Centralizes structured logging so security-relevant events (failed logins,
forbidden access, server errors) are recorded consistently instead of being
scattered or silent. `configure_logging()` is called once at process start
from the app lifespan; modules get a namespaced logger via `get_logger()`.
"""
from __future__ import annotations

import logging
import sys


def configure_logging(level: int = logging.INFO) -> None:
    """Configure the root logger exactly once (idempotent across reboots).

    Uses stdout so container runtimes capture it; structured enough for log
    aggregation without pulling in a heavy dependency.
    """
    root = logging.getLogger()
    if root.handlers:
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            "%(asctime)s %(levelname)s %(name)s %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        )
    )
    root.addHandler(handler)
    root.setLevel(level)


def get_logger(name: str) -> logging.Logger:
    """Return a namespaced logger (app.*) for the calling module."""
    return logging.getLogger(name)
