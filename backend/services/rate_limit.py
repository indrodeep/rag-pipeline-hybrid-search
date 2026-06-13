"""In-memory request guardrails that cap OpenAI spend from public traffic.

Two layers, both resetting at 00:00 UTC:
  - a per-IP daily cap on /v1/ask
  - a global daily cap across all callers — the hard kill-switch

Plus an admin gate: when a request carries  X-Admin-Key: <settings.admin_api_key>
it bypasses the caps and may reach the expensive admin-only endpoints (document
upload, eval suite) even while the public demo is locked down.

State is process-local. On a single instance (e.g. Render's free web service)
that is exactly the blast radius we want, and a restart simply resets the
counters — acceptable for a demo. If you ever run more than one replica, back
these counters with Redis instead.
"""

from __future__ import annotations

import datetime as _dt
import logging

from fastapi import Request

from config import settings
from exceptions import AdminRequiredError, RateLimitError

logger = logging.getLogger(__name__)


def _today() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%d")


class _DailyCounters:
    """Per-IP and global request counts that roll over at UTC midnight."""

    def __init__(self) -> None:
        self._date = _today()
        self._global = 0
        self._per_ip: dict[str, int] = {}

    def _rollover(self) -> None:
        today = _today()
        if today != self._date:
            self._date = today
            self._global = 0
            self._per_ip = {}

    def snapshot(self, ip: str) -> tuple[int, int]:
        """Return (ip_used_today, global_used_today) after a date rollover check."""
        self._rollover()
        return self._per_ip.get(ip, 0), self._global

    def count(self, ip: str) -> None:
        self._rollover()
        self._global += 1
        self._per_ip[ip] = self._per_ip.get(ip, 0) + 1


_counters = _DailyCounters()


def client_ip(request: Request) -> str:
    # Behind a proxy (Render et al.) the real client is the first hop of
    # X-Forwarded-For: "client, proxy1, proxy2".
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def is_admin(request: Request) -> bool:
    key = settings.admin_api_key.strip()
    if not key:
        return False
    supplied = request.headers.get("x-admin-key", "")
    return bool(supplied) and supplied == key


async def enforce_rate_limit(request: Request) -> None:
    """Dependency for public, spend-incurring endpoints (/v1/ask).

    Admins and non-demo instances bypass entirely. Otherwise the global
    kill-switch is checked first, then the per-IP cap; on success the call is
    counted toward both. There is no `await` between the check and the count,
    so under FastAPI's single-threaded event loop the pair is atomic.
    """
    if not settings.public_demo_mode or is_admin(request):
        return

    ip = client_ip(request)
    ip_used, global_used = _counters.snapshot(ip)

    if global_used >= settings.rate_limit_global_daily:
        logger.warning("global_daily_cap_reached", extra={"cap": settings.rate_limit_global_daily})
        raise RateLimitError(
            "This public demo has hit its shared daily query budget. "
            "It resets at 00:00 UTC — please check back tomorrow, or run the "
            "project locally with your own OpenAI key for unlimited use."
        )
    if ip_used >= settings.rate_limit_per_ip_daily:
        raise RateLimitError(
            f"You've used your {settings.rate_limit_per_ip_daily} free demo queries for today. "
            "The limit resets at 00:00 UTC."
        )

    _counters.count(ip)


async def require_admin(request: Request) -> None:
    """Dependency for expensive admin-only endpoints (upload, eval) in demo mode."""
    if not settings.public_demo_mode or is_admin(request):
        return
    raise AdminRequiredError(
        "Uploading documents and running the eval suite are disabled in the public "
        "demo (each makes many model calls). Run the project locally for full access."
    )


def usage(request: Request) -> dict[str, object]:
    """Public snapshot of the current caller's standing against the limits."""
    ip_used, global_used = _counters.snapshot(client_ip(request))
    return {
        "demo_mode": settings.public_demo_mode,
        "is_admin": is_admin(request),
        "per_ip_daily_limit": settings.rate_limit_per_ip_daily,
        "per_ip_used_today": ip_used,
        "per_ip_remaining_today": max(settings.rate_limit_per_ip_daily - ip_used, 0),
        "global_daily_limit": settings.rate_limit_global_daily,
        "global_used_today": global_used,
    }
