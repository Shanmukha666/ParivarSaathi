"""Crisis handling for the chat endpoint. Runs BEFORE rate limits, length limits, the trade requirement and
any LLM call, so nothing can stand between a person in distress and the helpline number."""
import logging
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.escalation import create_escalation_ticket
from app.core.safety import crisis_reply
from app.models.models import Message, Session

logger = logging.getLogger(__name__)
MAX_STORED_TEXT = 1000


async def handle_distress(db: AsyncSession, owner_id: Any, session_id: Any, text: str, lang: str, speaker: str) -> dict:
    """Store the message, file an urgent ticket, and answer with the helpline.

    The reply only says a counsellor was notified if the urgent ticket really exists. Every database step is
    best effort: a failure must never remove the helpline from the reply.
    """
    notified = False
    try:
        session = (await db.execute(select(Session).where(Session.id == uuid.UUID(str(session_id)), Session.owner_id == owner_id))).scalars().first()
    except Exception:
        logger.exception("distress: session lookup failed")
        session = None

    if session is not None:
        try:
            db.add(Message(session_id=session.id, speaker=speaker, text=text[:MAX_STORED_TEXT], lang=lang))
            await db.commit()
        except Exception:
            logger.exception("distress: could not store message")
            await db.rollback()
        try:
            await create_escalation_ticket(session.id, "Distress signal detected", db, priority="urgent")
            notified = True
        except Exception:
            logger.exception("distress: could not create urgent ticket")
            await db.rollback()

    return {
        "reply": crisis_reply(lang, notified),
        "citations": [],
        "suggested_chips": [],
        "escalate": notified,
        "escalate_reason": "distress_signal",
    }
