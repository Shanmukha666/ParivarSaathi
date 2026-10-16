"""Per-identity rate limiting.

With REDIS_URL set, counters live in Redis so the limit holds across workers and instances
(fixed window, INCR + EXPIRE). Without it, or if Redis is unreachable, a per-process sliding
window is used, so a Redis outage degrades protection to per-instance rather than blocking users.
"""
import os
from collections import defaultdict, deque
from time import monotonic, time

from fastapi import HTTPException, status

_WINDOW_SECONDS = 60
_MAX_REQUESTS = 30
_requests: dict[str, deque[float]] = defaultdict(deque)
_redis_client = None
_redis_checked = False


def _redis():
    """Lazily build the Redis client; None when not configured."""
    global _redis_client, _redis_checked
    if _redis_checked:
        return _redis_client
    _redis_checked = True
    url = os.getenv("REDIS_URL", "").strip()
    if not url:
        return None
    try:
        import redis

        _redis_client = redis.Redis.from_url(url, socket_timeout=0.25, socket_connect_timeout=0.25)
    except Exception:  # bad URL / missing package: stay on the in-memory path
        _redis_client = None
    return _redis_client


def _too_many() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Too many requests. Please try again shortly.",
        headers={"Retry-After": str(_WINDOW_SECONDS)},
    )


def _memory_limit(identity: str, limit: int) -> None:
    now = monotonic()
    bucket = _requests[identity]
    while bucket and now - bucket[0] > _WINDOW_SECONDS:
        bucket.popleft()
    if len(bucket) >= limit:
        raise _too_many()
    bucket.append(now)


def enforce_rate_limit(identity: str, limit: int = _MAX_REQUESTS) -> None:
    client = _redis()
    if client is not None:
        key = f"rl:{identity}:{int(time() // _WINDOW_SECONDS)}"
        try:
            count = client.incr(key)
            if count == 1:
                client.expire(key, _WINDOW_SECONDS * 2)
        except Exception:
            _memory_limit(identity, limit)  # Redis down: degrade, never block everyone
            return
        if count > limit:
            raise _too_many()
        return
    _memory_limit(identity, limit)
