"""Row-level-security red-team suite. Runs against a real Postgres holding the Supabase stub + all migrations.

    bash tools/verify_rls.sh        # builds the database from scratch, then runs this file

Connection: PGHOST (default /tmp), PGPORT (default 5433), PGUSER (default postgres), PGDATABASE (default t).
Exit code 0 only if every check passes. Each check name states the property being defended.
"""
import json
import os
import subprocess
import sys
import uuid

P = ["psql", "-h", os.getenv("PGHOST", "/tmp"), "-p", os.getenv("PGPORT", "5433"), "-U", os.getenv("PGUSER", "postgres"),
     "-d", os.getenv("PGDATABASE", "t"), "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=0"]
TAGS = ("INSERT ", "UPDATE ", "DELETE ", "SET")


def sql(q, role=None, claims=None):
    pre = ""
    if role:
        pre += f"set role {role};"
        if claims is not None:
            pre += f"set request.jwt.claims = '{json.dumps(claims)}';"
    r = subprocess.run(P + ["-c", pre + q], capture_output=True, text=True)
    # Drop psql command tags ("INSERT 0 1") but keep zero-row tags so "did nothing" is observable.
    lines = [l for l in r.stdout.strip().splitlines()
             if not l.startswith(TAGS) or l.startswith(("INSERT 0 0", "UPDATE 0", "DELETE 0"))]
    return "\n".join(lines).strip(), r.stderr.strip()


def admin(q):
    return sql(q)  # superuser: seeds data and bypasses RLS


results = []


def check(name, cond, detail=""):
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + (f"   [{detail}]" if (detail and not cond) else ""))


def first(o):
    return o.split("\n")[0].strip()


def denied(e):
    return any(s in e for s in ("permission denied", "row-level security", "violates", "forbidden"))


# ---- users. Staff authority comes from public.staff_roles: the same source the API and the policies use.
fam_a, fam_b, couns_a, couns_b, couns_far, adm = [str(uuid.uuid4()) for _ in range(6)]


def mk(uid, role=None, district=None, anon=False):
    admin(f"insert into auth.users(id, raw_app_meta_data, is_anonymous) values ('{uid}','{{}}',{str(anon).lower()})")
    if role:
        d = f"'{district}'" if district else "null"
        admin(f"insert into staff_roles(user_id, role, district) values ('{uid}','{role}',{d})")


mk(fam_a, anon=True)
mk(fam_b, anon=True)
mk(couns_a, "counsellor")                          # may claim any district
mk(couns_b, "counsellor")
mk(couns_far, "counsellor", district="Adilabad")   # restricted to a different district
mk(adm, "admin")
admin("insert into districts values ('Telangana','Warangal'),('Telangana','Adilabad') on conflict do nothing")
TRADE = first(admin("select id from trades order by id limit 1")[0])


def claims(uid, anon=False, user_meta=None):
    c = {"sub": uid, "role": "authenticated", "is_anonymous": anon, "app_metadata": {}}
    if user_meta:
        c["user_metadata"] = user_meta
    return c


A, B = claims(fam_a, True), claims(fam_b, True)
CA, CB, CFAR, AD = claims(couns_a), claims(couns_b), claims(couns_far), claims(adm)
COLS = "lang,state,district,user_role,learner_class,income_bracket,consent"
NEW_SESSION = f"insert into sessions({COLS}) values ('en','Telangana','Warangal','both','Class 10','1-3L',true) returning id"

print("== Reference data / anon")
o, e = sql("select count(*) from trades", "anon"); check("anon can read trades", o.isdigit() and int(o) > 0, e)
o, e = sql("select count(*) from sessions", "anon"); check("anon cannot read sessions", "permission denied" in e or o == "0", e or o)
o, e = sql("insert into trades(name_en,sector) values ('x','y')", "authenticated", A); check("family cannot write trades", denied(e), e or o)

print("== Sessions")
o, e = sql(NEW_SESSION, "authenticated", A); sess_a = first(o); check("family A creates own session", len(sess_a) == 36, e)
o, e = sql(NEW_SESSION.replace("true)", "false)"), "authenticated", A); check("session without consent rejected", "check" in e or "policy" in e, e or o)
o, e = sql(NEW_SESSION.replace("'Warangal'", "'<script>alert(1)</script>'"), "authenticated", A); check("unknown/XSS district rejected by FK", "foreign key" in e, e or o)
o, e = sql(f"insert into sessions(owner_id,{COLS}) values ('{fam_b}','en','Telangana','Warangal','both','x','y',true)", "authenticated", A); check("cannot create session owned by someone else", "row-level security" in e, e or o)
o, e = sql("select count(*) from sessions", "authenticated", B); check("family B cannot see A's session", o == "0", e or o)
o, e = sql(f"update sessions set owner_id='{fam_b}' where id='{sess_a}'", "authenticated", A); check("cannot reassign session ownership (column grant)", "permission denied" in e, e or o)
o, e = sql(f"update sessions set selected_trade_id={TRADE} where id='{sess_a}' returning selected_trade_id", "authenticated", A); check("can set own selected trade", o.startswith(TRADE), e or o)

print("== Messages / classifier")
o, e = sql(f"insert into messages(session_id,speaker,text,lang) values ('{sess_a}','parent','hello','en')", "authenticated", A); check("family can write its own message", e == "", e)
o, e = sql(f"insert into messages(session_id,speaker,text,lang) values ('{sess_a}','counsellor','fake','en')", "authenticated", A); check("family cannot impersonate a counsellor", "row-level security" in e, e or o)
o, e = sql(f"insert into messages(session_id,speaker,text,lang) values ('{sess_a}','ai','fake answer','en')", "authenticated", A); check("family cannot forge an AI message", "row-level security" in e, e or o)
o, e = sql(f"insert into messages(session_id,speaker,text,lang) values ('{sess_a}','parent','spoof','en')", "authenticated", B); check("family B cannot write into A's session", "row-level security" in e, e or o)
for i, (txt, s) in enumerate([("worried about money", -0.6), ("still worried", -0.5), ("what about safety", -0.4), ("ok maybe", 0.1), ("sounds good", 0.5)]):
    mid = first(admin(f"insert into messages(session_id,speaker,text,lang) values ('{sess_a}','parent','{txt}','en') returning id")[0])
    admin(f"insert into message_analysis(message_id,objection_category,sentiment) values ({mid},'{'income' if i < 2 else 'safety' if i == 2 else 'none'}',{s})")
o, e = sql("select count(*) from message_analysis", "authenticated", A); check("family cannot read classifier output", "permission denied" in e, e or o)
o, e = sql("select count(*) from messages", "authenticated", A); check("family reads own messages (6)", o == "6", e or o)
o, e = sql("select count(*) from messages", "authenticated", B); check("family B reads none", o == "0", e or o)
o, e = sql("select count(*) from messages", "authenticated", AD); check("ADMIN cannot read raw messages (data minimisation)", o == "0", e or o)
o, e = sql("select count(*) from messages", "authenticated", CA); check("counsellor sees nothing before any escalation", o == "0", e or o)

print("== Escalation, phone masking, takeover")
o, e = sql(f"insert into escalations(session_id,reason) values ('{sess_a}','wants human') returning id", "authenticated", A); esc = first(o); check("family creates escalation", esc.isdigit(), e)
o, e = sql(NEW_SESSION, "authenticated", A); sess_a2 = first(o)
o, e = sql(f"insert into escalations(session_id,reason,status,counsellor_id) values ('{sess_a2}','x','assigned','{couns_a}')", "authenticated", A)
stored, _ = admin(f"select status||'|'||(counsellor_id is null) from escalations where session_id='{sess_a2}'")
# Either the insert is refused, or the escalation_normalize trigger forces it back to an unassigned 'new' ticket.
check("family cannot self-assign a counsellor (refused or neutralised to unassigned 'new')", denied(e) or stored == "new|true", e or stored)
o, e = sql(f"insert into escalation_contacts(escalation_id,callback_phone,consented) values ({esc},'9876543210',true)", "authenticated", A); check("family stores callback phone", e == "", e or o)
o, e = sql(f"insert into escalation_contacts(escalation_id,callback_phone,consented) values ({esc},'12345',true)", "authenticated", A); check("bad phone number rejected", "check" in e or "violates" in e, e or o)
o, e = sql(f"select count(*) from escalations where id={esc}", "authenticated", CA); check("unrestricted counsellor A sees queued ticket", o == "1", e or o)
o, e = sql(f"select count(*) from escalations where id={esc}", "authenticated", CFAR); check("district-restricted counsellor (Adilabad) does NOT see a Warangal ticket", o == "0", e or o)
o, e = sql("select count(*) from escalation_contacts", "authenticated", CA); check("phone HIDDEN before accepting", o == "0", e or o)
o, e = sql("select count(*) from messages", "authenticated", CA); check("counsellor can read transcript to triage", o == "6", e or o)
o, e = sql("select count(*) from messages", "authenticated", CFAR); check("out-of-district counsellor cannot read transcript", o == "0", e or o)
o, e = sql(f"update escalations set status='assigned', counsellor_id='{couns_a}' where id={esc} returning status", "authenticated", CA); check("counsellor A accepts ticket", o.startswith("assigned"), e or o)
o, e = sql(f"select accepted_at is not null from escalations where id={esc}", "authenticated", CA); check("accepted_at stamped by trigger", o == "t", e or o)
o, e = sql("select count(*) from escalation_contacts", "authenticated", CA); check("phone VISIBLE after accepting", o == "1", e or o)
o, e = sql(f"select count(*) from escalations where id={esc}", "authenticated", CB); check("counsellor B cannot see A's assigned ticket", o == "0", e or o)
o, e = sql("select count(*) from messages", "authenticated", CB); check("counsellor B cannot read A's transcript", o == "0", e or o)
o, e = sql(f"update escalations set status='resolved' where id={esc}", "authenticated", CB); check("counsellor B cannot resolve A's ticket", o in ("", "UPDATE 0") and "permission" not in e, e or o)
o, e = sql(f"update escalations set counsellor_id='{couns_b}' where id={esc}", "authenticated", CA); check("counsellor cannot hand off by editing counsellor_id to someone else", "row-level security" in e, e or o)
o, e = sql(f"insert into messages(session_id,speaker,text,lang) values ('{sess_a}','counsellor','Namaste, this is your counsellor','en')", "authenticated", CA); check("assigned counsellor can message", e == "", e)
o, e = sql(f"insert into messages(session_id,speaker,text,lang) values ('{sess_a}','counsellor','intruder','en')", "authenticated", CB); check("other counsellor cannot message", "row-level security" in e, e or o)
o, e = sql(f"insert into messages(session_id,speaker,text,lang) values ('{sess_a}','parent','thank you','en')", "authenticated", A); check("family can reply once ticket is active", e == "", e)
o, e = sql(f"update escalations set resolved_at=now()-interval '10 days' where id={esc}", "authenticated", CA); check("cannot forge resolved_at (column grant)", "permission denied" in e, e or o)
o, e = sql(f"update escalations set status='resolved', family_changed_mind=true where id={esc} returning resolved_at is not null", "authenticated", CA); check("resolve + record 'changed mind' outcome", o.startswith("t"), e or o)
o, e = sql("select count(*) from audit_log where entity='escalations'", "authenticated", AD); check("admin can read audit trail (accept + resolve >= 2)", o.isdigit() and int(o) >= 2, e or o)
o, e = sql("select count(*) from audit_log", "authenticated", CA); check("counsellor sees zero audit rows (policy filters)", o == "0", e or o)

print("== Privilege escalation attempts")
o, e = sql("select public.is_staff('admin')", "authenticated", claims(fam_a, True, {"role": "admin"})); check("user_metadata role=admin is IGNORED", o == "f", e or o)
o, e = sql("select public.is_staff('admin')", "authenticated", AD); check("staff_roles admin is recognised", o == "t", e or o)
o, e = sql("select admin_kpis()", "authenticated", A); check("family cannot call admin_kpis", "forbidden" in e, e or o)
o, e = sql("select admin_kpis()", "authenticated", CA); check("counsellor cannot call admin_kpis", "forbidden" in e, e or o)
o, e = sql("select admin_kpis()", "anon"); check("anon cannot even execute admin_kpis", "permission denied" in e, e or o)
o, e = sql(f"insert into staff_roles(user_id, role) values ('{fam_a}','admin')", "authenticated", A); check("family cannot grant itself a staff role", denied(e), e or o)
o, e = sql("select count(*) from staff_roles", "authenticated", A); check("family sees no staff_roles rows", o == "0", e or o)

print("== Admin aggregates and k-anonymity")
o, e = sql("select admin_kpis()->'avg_sentiment_shift'", "authenticated", AD); check("with 1 session: shift is NULL, not a fake number", o in ("", "null"), o or e)
o, e = sql("select session_count, resistance_index is null from admin_district_resistance('Telangana') where district='Warangal'", "authenticated", AD); check("<10 sessions: resistance suppressed", o == "2|t", o or e)
for i in range(11):  # push Warangal past k=10
    u = str(uuid.uuid4()); mk(u, anon=True)
    sid = first(admin(f"insert into sessions(owner_id,{COLS}) values ('{u}','hi','Telangana','Warangal','parent','x','y',true) returning id")[0])
    if i < 5:
        admin(f"insert into escalations(session_id,reason,status,counsellor_id) values ('{sid}','r','assigned','{couns_a}')")
    for j, s in enumerate([-0.7, -0.6, -0.3, 0.2, 0.5]):
        mid = first(admin(f"insert into messages(session_id,speaker,text,lang) values ('{sid}','parent','m{j}','hi') returning id")[0])
        admin(f"insert into message_analysis(message_id,objection_category,sentiment) values ({mid},'{'status' if j < 3 else 'none'}',{s})")
o, e = sql("select session_count, resistance_index, escalation_rate, share_neg_start, mean_sentiment from admin_district_resistance('Telangana') where district='Warangal'", "authenticated", AD)
print("   district row:", o or e)
cols = o.split("|") if o else []
check("13 sessions: resistance index computed", len(cols) == 5 and cols[1] != "", o or e)
# mean_sentiment is the mean ENDING sentiment (11 seeded sessions end at +0.35, ours at +0.30).
check("families end positive: mean ending sentiment is about 0.35", len(cols) == 5 and cols[4] != "" and 0.30 < float(cols[4]) < 0.40, o)
# The shift itself (last two minus first two messages) is about +1.0 for this data.
o, e = sql("select (admin_kpis()->>'avg_sentiment_shift')::numeric", "authenticated", AD); check("KPI sentiment shift is real and about +1.0 (>=10 sessions)", o != "" and 0.9 < float(o) < 1.1, o or e)
o, e = sql("select admin_objection_breakdown('Warangal')::text", "authenticated", AD); check("objection breakdown returns rows", "status" in o, o or e)

print("== Counsellor workflow: the exact statements apps/web/src/app/api/counsellor/** sends")


def new_ticket(fam_claims):
    s = first(sql(NEW_SESSION, "authenticated", fam_claims)[0])
    return s, first(sql(f"select create_escalation('{s}','workflow','high',null,null,false)", "authenticated", fam_claims)[0])


sw, ew = new_ticket(A)
o, e = sql(f"update escalations set status='assigned', counsellor_id='{couns_a}' where id={ew} and status='new' returning id", "authenticated", CA); check("accept statement works", o == ew, e or o)
o, e = sql(f"update escalations set status='assigned', counsellor_id='{couns_b}' where id={ew} and status='new' returning id", "authenticated", CB); check("second counsellor accepting the same ticket changes 0 rows (route returns 409)", e == "" and o in ("", "UPDATE 0"), e or o)
o, e = sql(f"select callback_phone from escalation_contacts where escalation_id={ew}", "authenticated", CA); check("phone lookup after accept returns no error (null when family gave none)", e == "", e)
o, e = sql(f"update escalations set status='contacted' where id={ew} and counsellor_id='{couns_a}' and status='assigned' returning contacted_at is not null", "authenticated", CA); check("contact statement works and the trigger stamps contacted_at", o == "t", e or o)
o, e = sql(f"update escalations set status='resolved', resolution_note='done' where id={ew} and counsellor_id='{couns_a}' and status in ('assigned','contacted') returning resolved_at is not null", "authenticated", CA); check("resolve statement works (from contacted) and the trigger stamps resolved_at", o == "t", e or o)
o, e = sql(f"update escalations set status='closed_no_response', resolution_note='x' where id={ew} and counsellor_id='{couns_a}' and status in ('assigned','contacted')", "authenticated", CA); check("a resolved ticket cannot be closed (route returns 409)", o in ("", "UPDATE 0") and e == "", e or o)

sw2, ew2 = new_ticket(A)
sql(f"update escalations set status='assigned', counsellor_id='{couns_a}' where id={ew2} and status='new'", "authenticated", CA)
o, e = sql(f"update escalations set status='resolved', resolution_note='direct', resolved_at=now() where id={ew2}", "authenticated", CA); check("REGRESSION: sending resolved_at is refused (the old route did this on every resolve)", "permission denied" in e, e or o)
o, e = sql(f"update escalations set status='contacted', contacted_at=now() where id={ew2}", "authenticated", CA); check("REGRESSION: sending contacted_at is refused (the old route did this)", "permission denied" in e, e or o)
o, e = sql(f"update escalations set status='resolved', resolution_note='direct' where id={ew2} and counsellor_id='{couns_a}' and status in ('assigned','contacted') returning id", "authenticated", CA); check("resolve straight from assigned works (the dashboard has no contact step)", o == ew2, e or o)
sw3, ew3 = new_ticket(A)
sql(f"update escalations set status='assigned', counsellor_id='{couns_a}' where id={ew3} and status='new'", "authenticated", CA)
o, e = sql(f"update escalations set status='closed_no_response', resolution_note='no answer after 3 calls' where id={ew3} and counsellor_id='{couns_a}' and status in ('assigned','contacted') returning closed_at is not null", "authenticated", CA); check("close statement works from assigned and the trigger stamps closed_at", o == "t", e or o)
o, e = sql(f"update escalations set resolution_note='{'x' * 1001}' where id={ew3}", "authenticated", CA); check("resolution_note over 1000 chars is refused by the database", "violates" in e or "check" in e or "permission" in e, e or o)
o, e = sql("select count(*) from escalations where status in ('new','assigned','contacted')", "authenticated", AD); check("queue filter (active tickets only) is a valid query for admins", o.isdigit(), e or o)

print("== Delete my data")
o, e = sql(f"delete from sessions where id='{sess_a}'", "authenticated", A); check("family deletes own session", e == "", e)
o2, _ = admin(f"select (select count(*) from messages where session_id='{sess_a}'),(select count(*) from escalations where session_id='{sess_a}'),(select count(*) from escalation_contacts where escalation_id={esc})")
check("cascade removed messages, escalation and phone", o2 == "0|0|0", o2)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
