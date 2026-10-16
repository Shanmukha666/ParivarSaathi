import pytest
from fastapi import HTTPException

from app.core import rate_limit


@pytest.fixture(autouse=True)
def reset(monkeypatch):
    rate_limit._requests.clear()
    monkeypatch.setattr(rate_limit, "_redis_client", None)
    monkeypatch.setattr(rate_limit, "_redis_checked", True)  # default: no Redis


def test_memory_limit_blocks_after_limit():
    for _ in range(3):
        rate_limit.enforce_rate_limit("a", limit=3)
    with pytest.raises(HTTPException) as exc:
        rate_limit.enforce_rate_limit("a", limit=3)
    assert exc.value.status_code == 429 and exc.value.headers["Retry-After"] == "60"
    rate_limit.enforce_rate_limit("b", limit=3)  # other identities unaffected


class FakeRedis:
    def __init__(self):
        self.counts, self.expiries = {}, {}

    def incr(self, key):
        self.counts[key] = self.counts.get(key, 0) + 1
        return self.counts[key]

    def expire(self, key, seconds):
        self.expiries[key] = seconds


def test_redis_counter_is_shared_and_expires(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(rate_limit, "_redis_client", fake)
    for _ in range(2):
        rate_limit.enforce_rate_limit("fam", limit=2)
    with pytest.raises(HTTPException):
        rate_limit.enforce_rate_limit("fam", limit=2)
    assert fake.expiries and not rate_limit._requests  # counted in Redis, not in process memory


def test_redis_outage_degrades_to_memory_not_to_blocking(monkeypatch):
    class Broken:
        def incr(self, key):
            raise ConnectionError("down")

    monkeypatch.setattr(rate_limit, "_redis_client", Broken())
    rate_limit.enforce_rate_limit("x", limit=1)  # allowed, counted in memory
    with pytest.raises(HTTPException):
        rate_limit.enforce_rate_limit("x", limit=1)
