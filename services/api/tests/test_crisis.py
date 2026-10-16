"""The FastAPI service must answer distress with the helpline, first, and honestly."""
import json
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core import safety
from app.core.safety import crisis_reply, has_distress_signal
from app.database import Base
from app.models.models import Escalation, Message, Session
from app.routers import chat as chat_router
from app.schemas.schemas import ChatRequest

DATA = json.loads((Path(__file__).parents[1] / "app/core/safety_data.json").read_text(encoding="utf-8"))
OWNER = uuid.uuid4()


@pytest.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as session:
        yield session
    await engine.dispose()


async def make_session(db, selected_trade=None, owner=OWNER):
    s = Session(id=uuid.uuid4(), owner_id=owner, lang="en", state="Telangana", district="Warangal",
                user_role="parent", learner_class="Class 10", income_bracket="1-3L", selected_trade_id=selected_trade)
    db.add(s)
    await db.commit()
    return s


def req(session_id, text, lang="en"):
    return ChatRequest(session_id=session_id, speaker="parent", text=text, lang=lang)


def test_data_file_has_every_language_and_the_helpline():
    assert {"en", "te", "hi", "ta", "romanised"} <= set(DATA["phrases"])
    for lang in ("en", "te", "hi", "ta"):
        assert "14416" in crisis_reply(lang) and "1800-891-4416" in crisis_reply(lang)


@pytest.mark.parametrize("lang", ["en", "te", "hi", "ta", "romanised"])
def test_every_phrase_in_every_language_is_detected(lang):
    assert DATA["phrases"][lang], lang
    for phrase in DATA["phrases"][lang]:
        assert has_distress_signal(f"  {phrase.upper()}  ... "), phrase


def test_ordinary_questions_are_not_flagged():
    for text in ["What is the fee for the electrician course?", "Will he get a job after ITI?", "salary for 2 years"]:
        assert not has_distress_signal(text)


def test_detects_in_a_very_long_message():
    assert has_distress_signal("x " * 2000 + "I want to die")


@pytest.mark.parametrize("lang", ["en", "te", "hi", "ta"])
def test_reply_drops_the_counsellor_promise_but_keeps_the_helpline(lang):
    honest = crisis_reply(lang, counsellor_notified=False)
    assert "14416" in honest and honest != crisis_reply(lang)
    assert len(honest) < len(crisis_reply(lang))


async def test_distress_files_an_urgent_ticket_and_stores_the_message(db):
    s = await make_session(db)
    out = await chat_router.send_message(req(s.id, "I want to die"), current_user=SimpleNamespace(id=OWNER), db=db)
    assert "14416" in out.reply and out.escalate is True
    ticket = (await db.execute(select(Escalation).where(Escalation.session_id == s.id))).scalars().one()
    assert ticket.priority == "urgent"
    assert (await db.execute(select(Message).where(Message.session_id == s.id))).scalars().first().text == "I want to die"


async def test_distress_works_with_no_trade_selected_and_when_rate_limited(db, monkeypatch):
    def boom(*a, **k):
        raise HTTPException(status_code=429, detail="limited")
    monkeypatch.setattr(chat_router, "enforce_rate_limit", boom)
    s = await make_session(db, selected_trade=None)
    # An ordinary message is refused ...
    with pytest.raises(HTTPException) as e:
        await chat_router.send_message(req(s.id, "what is the fee"), current_user=SimpleNamespace(id=OWNER), db=db)
    assert e.value.status_code == 429
    # ... but a crisis message still gets the helpline.
    out = await chat_router.send_message(req(s.id, "I want to die"), current_user=SimpleNamespace(id=OWNER), db=db)
    assert "14416" in out.reply


async def test_a_very_long_distress_message_is_not_rejected(db):
    s = await make_session(db)
    out = await chat_router.send_message(req(s.id, "I want to die. " + "please help " * 300), current_user=SimpleNamespace(id=OWNER), db=db)
    assert "14416" in out.reply


async def test_unknown_or_foreign_session_gets_the_helpline_without_a_false_promise(db):
    other = await make_session(db, owner=uuid.uuid4())
    for sid in (uuid.uuid4(), other.id):
        out = await chat_router.send_message(req(sid, "I want to die"), current_user=SimpleNamespace(id=OWNER), db=db)
        assert "14416" in out.reply and out.escalate is False
        assert out.reply == crisis_reply("en", counsellor_notified=False)
    assert (await db.execute(select(Escalation))).scalars().first() is None


async def test_ticket_failure_does_not_remove_the_helpline_or_promise_help(db, monkeypatch):
    async def fail(*a, **k):
        raise RuntimeError("db down")
    monkeypatch.setattr("app.core.crisis.create_escalation_ticket", fail)
    s = await make_session(db)
    out = await chat_router.send_message(req(s.id, "I want to die"), current_user=SimpleNamespace(id=OWNER), db=db)
    assert "14416" in out.reply and out.escalate is False
    assert out.reply == crisis_reply("en", counsellor_notified=False)


async def test_non_crisis_text_over_1000_chars_is_rejected_after_the_crisis_check(db):
    s = await make_session(db)
    with pytest.raises(HTTPException) as e:
        await chat_router.send_message(req(s.id, "a" * 1001), current_user=SimpleNamespace(id=OWNER), db=db)
    assert e.value.status_code == 422
