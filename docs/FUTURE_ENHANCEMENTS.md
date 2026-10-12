# Future Enhancements Roadmap: WhatsApp, IVR & Automated Ingestion

**Product**: Parivar Path  
**Scope**: Smart India Hackathon PS #26241 Extension Capabilities

---

## 1. WhatsApp Conversational Interface (Architecture Plan)

### Objective
Provide direct accessibility for rural families without requiring installation of an application or web browsing.

### System Diagram
```
[Parent / Learner]
       |  (WhatsApp Message)
       v
[Meta Cloud API / Twilio Webhook]
       |
       v
[FastAPI / Next.js Webhook Handler (/api/webhooks/whatsapp)]
       |
       +---> [Session Manager (Phone-hashed Anonymous ID)]
       +---> [Grounding & Concern Classifier]
       +---> [Gemini AI / Tele-MANAS Safety Gate]
       |
       v
[Automated Interactive WhatsApp Reply]
  - Native language text
  - Interactive Quick Reply buttons (Objection chips)
  - PDF/Image download link for Summary Card
```

### Key Security & Privacy Safeguards
- Phone numbers hashed using SHA-256 with monthly rotation salt to uphold DPDP anonymity.
- Explicit guardian consent prompt triggered as first automated message before profile queries.

---

## 2. Interactive Voice Response (IVR) & Feature Phone Pipeline

### Objective
Support non-smartphone users and illiterate parents via toll-free voice calls.

### Integration Pipeline
1. **Telephony Gateway**: Integration with Exotel or Knowlarity toll-free inbound lines.
2. **Speech-to-Text (STT)**: Bhashini ASR (Automated Speech Recognition) supporting Telugu, Tamil, and Hindi regional dialects.
3. **Dialogue Engine**: Reuses the core Parivar Path Grounding Orchestrator.
4. **Text-to-Speech (TTS)**: Regional Bhashini or ElevenLabs Indic voice synthesis.
5. **Human Escalation**: If speech recognition confidence is low ($< 0.70$) or user requests a counsellor, call is immediately bridged to the on-duty human counsellor queue via SIP transfer.

---

## 3. Automated Government Portal Data Scraping & Verification ETL

### Objective
Replace static dataset imports with continuous automated synchronization against national and state vocational databases.

### Target Portals
- **NCVT MIS Portal** (`ncvtmis.gov.in`): ITI admissions, trade certifications, seating capacity.
- **Skill India Digital Hub (SIDH)**: PMKVY course listings, accredited centres, state fees.
- **State DGET Portals**: Telangana Employment & Training Department placement bulletins.

### Staged Verification Workflow
```
[Scraper Worker (Scheduled Cron / Playwright)]
       |
       v
[Staging Table: `outcome_metrics_staging`]
  (Marked `verification_status = 'pending'`, `is_synthetic = true`)
       |
       v
[Validation Rules Engine]
  - Salary range sanity checks
  - District/trade foreign key reconciliation
       |
       v
[Admin Review Portal (/admin/verification)]
  - Human verification checklist
  - Click to approve -> moves to production `outcome_metrics`
```
