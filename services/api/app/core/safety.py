"""Distress detection and the crisis reply for the FastAPI service.

The phrases and reply text are NOT written here. They live in apps/web/src/lib/safety.ts and are copied
into safety_data.json by `npm run sync:safety`, so both services answer identically; a vitest parity
test fails if the file goes stale. Before this module existed the service detected only the English
word "suicide" (as an escalation keyword) and never returned a helpline.

Detection is simple substring matching on normalised text. The Telugu, Hindi and Tamil lists have not
had native-speaker review (see docs/LANGUAGE_REVIEW.md).
"""
import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

_DATA_FILE = Path(__file__).with_name("safety_data.json")
_ZERO_WIDTH = re.compile("[\u200b-\u200d\ufeff]")
_SPACES = re.compile(r"\s+")
SCAN_CHARS = 5000  # a long, desperate message must still be scanned even though it is too long to process


@lru_cache(maxsize=1)
def _data() -> dict:
    return json.loads(_DATA_FILE.read_text(encoding="utf-8"))


def _normalise(text: str) -> str:
    return _SPACES.sub(" ", _ZERO_WIDTH.sub("", unicodedata.normalize("NFC", text).lower()))


@lru_cache(maxsize=1)
def _all_phrases() -> tuple:
    return tuple(_normalise(p) for phrases in _data()["phrases"].values() for p in phrases)


def has_distress_signal(text: str) -> bool:
    t = _normalise(text[:SCAN_CHARS])
    return any(p in t for p in _all_phrases())


def crisis_reply(lang: str, counsellor_notified: bool = True) -> str:
    """The helpline reply. With counsellor_notified=False the sentence promising a counsellor is dropped,
    so we never promise a callback that was not queued. The helpline numbers always stay in."""
    replies = _data()["replies"]
    entry = replies.get(lang) or replies["en"]
    return entry["full"] if counsellor_notified else entry["without_counsellor_claim"]
