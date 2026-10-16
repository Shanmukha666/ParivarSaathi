# Decisions that need a human

These are product or policy choices, not bugs, so the code does not make them silently.

## 1. Should the organisers' dummy dataset be visible in the live app?
Today the importer (`tools/import_dataset.py`) stores every row as `is_synthetic = true`,
`verification_status = 'pending'`. The live chat and trade pages only read rows that are `verified` and not
synthetic, and demo mode answers from in-code data without reading the database. **So an imported dummy file
never appears anywhere.** A judge pointing the app at the organisers' file would see "verified information is
unavailable" for every salary question, and each one opens a counsellor ticket.

Options: (a) keep as is and demo the refusal as a feature; (b) add an explicit
`ALLOW_LABELLED_SAMPLE_DATA` switch that lets pending/synthetic rows through with a visible "sample data, not
verified" label in every answer. (b) needs a change to `assessEvidence` and its tests, so it was not done
without your say-so.

## 2. Should counsellors read the transcript before accepting a ticket?
The database allows it (triage policy). The API deliberately requires an assigned ticket, which is the
stricter, more private choice, so counsellors triage from the ticket summary. Loosen only if you want it.

## 3. Demo-mode crisis reply
In demo mode the crisis reply says a counsellor was notified, and the counsellor dashboard shows a simulated
queue. That is a consistent demo story; in live mode the same sentence is only shown when a real ticket exists.

## 4. React Hook warnings
`next lint` reports three `react-hooks/exhaustive-deps` warnings (chat, summary, trade detail). They may hide
stale-closure bugs, but changing effect dependencies without browser testing could change behaviour.
