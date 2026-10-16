#!/usr/bin/env python3
"""Import a placement/earnings dataset (CSV or XLSX) into Supabase as DUMMY evaluation data.

Usage:
  python tools/import_dataset.py data.csv --out import.sql [--replace-previous] [--create-missing-trades]

Then paste import.sql into Supabase -> SQL Editor and run it (it is one transaction and safe to re-run).
Every row is flagged is_synthetic = true, verification_status = 'pending'. NOTE: the live app reads only verified, non-synthetic rows, so imported rows are
stored but NOT displayed until you decide how to surface labelled sample data (see docs/OPEN_DECISIONS.md).
Nothing is ever marked verified by this tool.

Accepted columns (names are matched loosely, e.g. "Placement (%)", "Avg Starting Salary (INR/month)"):
  trade, state, district, provider, year/batch, sample_size,
  placement_rate, starting_earnings, earnings_after_period
or "long" format: metric + value columns (one metric per row).
Bad rows are skipped and reported; the tool never invents or "fixes" a number silently.
"""
from __future__ import annotations

import argparse
import csv
import difflib
import hashlib
import math
import re
import sys
from datetime import date
from pathlib import Path

PUBLISHER = "Hackathon evaluation dataset (dummy)"
TELANGANA = [
    "Adilabad", "Bhadradri Kothagudem", "Hanumakonda", "Hyderabad", "Jagtial", "Jangaon", "Jayashankar Bhupalpally",
    "Jogulamba Gadwal", "Kamareddy", "Karimnagar", "Khammam", "Kumuram Bheem Asifabad", "Mahabubabad", "Mahabubnagar",
    "Mancherial", "Medak", "Medchal-Malkajgiri", "Mulugu", "Nagarkurnool", "Nalgonda", "Narayanpet", "Nirmal",
    "Nizamabad", "Peddapalli", "Rajanna Sircilla", "Rangareddy", "Sangareddy", "Siddipet", "Suryapet", "Vikarabad",
    "Wanaparthy", "Warangal", "Yadadri Bhuvanagiri",
]
METRICS = {  # key -> (unit)
    "starting_earnings_min": "INR",
    "starting_earnings_max": "INR",
    "earnings_after_period_min": "INR",
    "earnings_after_period_max": "INR",
    "placement_rate": "percentage",
    "starting_earnings": "INR",
    "earnings_after_period": "INR",
}
# Resolution order matters: more specific fields first so "salary_after_3_years" is not mistaken for starting pay.
ALIASES = {
    "starting_earnings_min": ["starting_earnings_min", "starting_salary_min", "min_starting_salary", "salary_min", "min_salary"],
    "starting_earnings_max": ["starting_earnings_max", "starting_salary_max", "max_starting_salary", "salary_max", "max_salary"],
    "earnings_after_period_min": ["earnings_after_period_min", "salary_after_3_years_min", "salary_3yr_min", "experienced_salary_min"],
    "earnings_after_period_max": ["earnings_after_period_max", "salary_after_3_years_max", "salary_3yr_max", "experienced_salary_max"],
    "earnings_after_period": ["earnings_after_period", "salary_after_3_years", "earnings_after_3_years", "salary_3yr",
                              "salary_after_3yrs", "experienced_salary", "salary_after_period", "three_year_salary",
                              "salary_after_3_yr"],
    "placement_rate": ["placement_rate", "placement_percentage", "placement_percent", "placement_pct", "placement",
                       "placed_percent", "employment_rate", "job_rate"],
    "starting_earnings": ["starting_earnings", "starting_salary", "avg_starting_salary", "average_starting_salary",
                          "start_salary", "initial_salary", "entry_salary", "monthly_salary", "avg_salary",
                          "average_salary", "salary"],
    "trade": ["trade_name", "tradename", "trade", "course_name", "course", "occupation", "job_role", "programme", "program"],
    "state": ["state"],
    "district": ["district_name", "district", "location", "city"],
    "provider": ["provider_name", "provider", "training_provider", "institution", "institute", "iti", "training_centre",
                 "training_center", "centre", "center"],
    "year": ["batch_year", "cohort_year", "passout_year", "year", "batch", "cohort"],
    "sample_size": ["sample_size", "respondents", "learners", "trainees", "students", "sample", "count", "n"],
}
LONG_KEY = ["metric_key", "metric", "indicator"]
LONG_VAL = ["metric_value", "value", "amount"]


def norm(header: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(header).strip().lower()).strip("_")


def resolve_columns(headers: list[str]) -> dict[str, str]:
    """Map our field names to actual headers: exact alias match first, then prefix match."""
    normed = {h: norm(h) for h in headers}
    used: set[str] = set()
    found: dict[str, str] = {}
    for field, aliases in ALIASES.items():
        pick = None
        for alias in aliases:  # exact
            pick = next((h for h, n in normed.items() if n == alias and h not in used), None)
            if pick:
                break
        if not pick:
            for alias in aliases:  # prefix, e.g. avg_starting_salary_inr_month
                pick = next((h for h, n in normed.items() if n.startswith(alias + "_") and h not in used), None)
                if pick:
                    break
        if pick:
            found[field] = pick
            used.add(pick)
    for names, label in ((LONG_KEY, "long_key"), (LONG_VAL, "long_val")):
        pick = next((h for h, n in normed.items() if n in names and h not in used), None)
        if pick:
            found[label] = pick
            used.add(pick)
    return found


def parse_number(raw) -> float | None:
    if raw is None:
        return None
    text = str(raw).strip().lower()
    if text in {"", "na", "n/a", "nan", "-", "--", "null", "none"}:
        return None
    text = re.sub(r"(rs\.?|inr|₹|%|per month|/month|/mo|,|\s)", "", text)
    mult = 1.0
    if text.endswith("k"):
        mult, text = 1000.0, text[:-1]
    value = float(text) * mult  # raises ValueError for junk -> caller reports it
    if not math.isfinite(value):
        raise ValueError("not finite")
    return value


def q(value: str) -> str:
    """SQL string literal. Control characters are dropped, quotes doubled."""
    clean = "".join(ch for ch in str(value) if ch == "\t" or ord(ch) >= 32)
    return "'" + clean.replace("'", "''") + "'"


def read_rows(path: Path) -> tuple[list[str], list[dict]]:
    if path.suffix.lower() in {".xlsx", ".xlsm"}:
        try:
            import openpyxl  # type: ignore
        except ImportError:  # pragma: no cover
            sys.exit("Reading .xlsx needs openpyxl: pip install openpyxl  (or save the sheet as CSV)")
        sheet = openpyxl.load_workbook(path, read_only=True, data_only=True).worksheets[0]
        rows = list(sheet.iter_rows(values_only=True))
        headers = [str(h) if h is not None else "" for h in rows[0]]
        return headers, [dict(zip(headers, r)) for r in rows[1:] if any(c is not None for c in r)]
    with path.open(newline="", encoding="utf-8-sig") as fh:
        sample = fh.read(4096)
        fh.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
        except csv.Error:
            dialect = csv.excel
        reader = csv.DictReader(fh, dialect=dialect)
        return list(reader.fieldnames or []), [r for r in reader if any((v or "").strip() for v in r.values() if isinstance(v, str))]


def known_trades() -> set[str]:
    seed = Path(__file__).resolve().parents[1] / "services" / "api" / "app" / "seed" / "trades.csv"
    try:
        with seed.open(newline="", encoding="utf-8-sig") as fh:
            names = {r["name_en"].strip().lower() for r in csv.DictReader(fh) if r.get("name_en")}
        return names | {"food processing"}
    except (OSError, KeyError):
        return set()


def build(headers: list[str], rows: list[dict], source_title: str, ref: str, replace_previous: bool,
          create_missing_trades: bool) -> tuple[str, dict]:
    cols = resolve_columns(headers)
    errors: list[str] = []
    warnings: list[str] = []
    long_format = "long_key" in cols and "long_val" in cols
    if "trade" not in cols:
        errors.append("No trade column found (expected e.g. 'trade', 'course', 'trade_name').")
    if "district" not in cols:
        errors.append("No district column found (expected e.g. 'district', 'location').")
    if not long_format and not any(k in cols for k in METRICS):
        errors.append("No metric columns found (placement_rate / starting_earnings / earnings_after_period).")
    if errors:
        return "", {"cols": cols, "errors": errors, "warnings": warnings, "rows": 0, "metrics": 0, "trades": set()}

    # Placement given as fractions (0-1) is converted once, loudly, only if EVERY value is within 0-1.
    placement_vals = []
    for r in rows:
        key = cols.get("placement_rate")
        try:
            v = parse_number(r.get(key)) if key else None
        except ValueError:
            v = None
        if v is not None:
            placement_vals.append(v)
    fraction = bool(placement_vals) and max(placement_vals) <= 1.0 and min(placement_vals) >= 0
    if fraction:
        warnings.append("placement_rate values are all between 0 and 1: treated as fractions and multiplied by 100.")

    seen_districts: dict[tuple[str, str], str] = {}
    metric_rows: list[dict] = []
    providers: set[tuple[str, str, str]] = set()
    trades_seen: set[str] = set()
    valid_rows = 0
    this_year = date.today().year

    for idx, r in enumerate(rows, start=2):  # row 1 is the header
        def cell(field):
            return (str(r.get(cols[field])).strip() if field in cols and r.get(cols[field]) is not None else "")

        def bad(msg):
            errors.append(f"row {idx}: {msg}")

        trade, district = cell("trade"), cell("district")
        state = cell("state") or "Telangana"
        if not cell("state") and idx == 2:
            warnings.append("No state column/value: assuming Telangana.")
        if not trade or not district:
            bad("missing trade or district, row skipped")
            continue
        if state.lower() == "telangana":
            state = "Telangana"
            if district not in TELANGANA:
                exact = next((d for d in TELANGANA if d.lower() == district.lower()), None)
                close = difflib.get_close_matches(district, TELANGANA, n=1, cutoff=0.82)
                fixed = exact or (close[0] if close else None)
                if fixed:
                    if not exact:
                        warnings.append(f"row {idx}: district '{district}' read as '{fixed}'.")
                    district = fixed
                else:
                    warnings.append(f"row {idx}: district '{district}' is not a known Telangana district; kept as written.")
        try:
            year = int(float(cell("year"))) if cell("year") else this_year
            if not cell("year") and idx == 2:
                warnings.append(f"No year column/value: using {this_year}.")
            if not 2000 <= year <= this_year + 1:
                raise ValueError("year out of range")
            sample = parse_number(cell("sample_size")) if cell("sample_size") else None
            if sample is not None and (sample < 0 or sample != int(sample)):
                raise ValueError("sample_size must be a whole number >= 0")
        except ValueError as exc:
            bad(f"{exc}, row skipped")
            continue
        provider = cell("provider")

        pairs: list[tuple[str, float]] = []
        try:
            if long_format:
                key_raw = norm(cell("long_key"))
                key = next((m for m, al in ALIASES.items() if m in METRICS and (key_raw == m or key_raw in al)), None)
                if not key:
                    bad(f"unknown metric '{cell('long_key')}', row skipped")
                    continue
                val = parse_number(cell("long_val"))
                if val is not None:
                    pairs.append((key, val))
            else:
                for key in METRICS:
                    if key in cols:
                        val = parse_number(r.get(cols[key]))
                        if val is not None:
                            pairs.append((key, val))
        except ValueError as exc:
            bad(f"number could not be read ({exc}), row skipped")
            continue

        row_ok = []
        for key, val in pairs:
            if key == "placement_rate":
                val = val * 100 if fraction else val
                if not 0 <= val <= 100:
                    bad(f"placement_rate {val} outside 0-100, metric skipped")
                    continue
            else:
                if val <= 0:
                    bad(f"{key} {val} must be positive, metric skipped")
                    continue
                if val > 500000:
                    bad(f"{key} {val:,.0f} is implausible per month (annual figure?), metric skipped")
                    continue
                if val > 200000 or val < 3000:
                    warnings.append(f"row {idx}: {key} {val:,.0f} per month looks unusual; kept as written.")
            row_ok.append((key, round(val, 3)))
        vals = dict(row_ok)
        for base in ("starting_earnings", "earnings_after_period"):
            lo, hi = vals.get(base + "_min"), vals.get(base + "_max")
            if lo is not None and hi is not None and lo > hi:
                bad(f"{base}: min {lo:,.0f} is greater than max {hi:,.0f}, both skipped")
                row_ok = [(k, v) for k, v in row_ok if k not in (base + "_min", base + "_max")]
        if not row_ok:
            if pairs:
                continue
            warnings.append(f"row {idx}: no metric values, nothing imported.")
            continue
        valid_rows += 1
        trades_seen.add(trade)
        seen_districts[(state, district)] = ""
        if provider:
            providers.add((provider, state, district))
        for key, val in row_ok:
            metric_rows.append({"trade": trade, "state": state, "district": district, "provider": provider,
                                "year": year, "sample": None if sample is None else int(sample), "key": key, "val": val})

    # duplicates inside the file (same trade/district/provider/year/metric)
    seen = {}
    for m in metric_rows:
        k = (m["trade"].lower(), m["district"], m["provider"], m["year"], m["key"])
        if k in seen and seen[k] != m["val"]:
            warnings.append(f"conflicting duplicate for {k[0]} / {k[1]} / {k[4]} / {k[3]}: both kept.")
        seen[k] = m["val"]

    known = known_trades()
    unknown_trades = sorted(t for t in trades_seen if known and t.lower() not in known)
    if unknown_trades:
        action = "will be created" if create_missing_trades else "are NOT in the database and will import nothing (use --create-missing-trades)"
        warnings.append("Trades not in the seed list " + action + ": " + ", ".join(unknown_trades))

    sql = [f"-- Generated by tools/import_dataset.py on {date.today().isoformat()} for source {ref}",
           "-- DUMMY / ILLUSTRATIVE DATA. Every row is is_synthetic = true, verification_status = 'pending'.",
           "begin;", "",
           "insert into public.data_sources (publisher, title, source_url, document_reference, retrieved_on)",
           f"select {q(PUBLISHER)}, {q(source_title)}, null, {q(ref)}, current_date",
           f"where not exists (select 1 from public.data_sources where document_reference = {q(ref)});", ""]
    if replace_previous:
        sql += ["-- remove earlier DUMMY imports/seed rows (never touches non-synthetic rows)",
                "delete from public.outcome_metrics where is_synthetic = true and source_id in",
                f"  (select id from public.data_sources where publisher = {q(PUBLISHER)} and document_reference <> {q(ref)});", ""]
    if create_missing_trades:
        for t in unknown_trades:
            sql += ["insert into public.trades (id, name_en, name_local, sector, nsqf_level, duration_months,",
                    "  entry_qualification, safety_notes, job_roles, description_simple)",
                    f"select (select coalesce(max(id), 0) + 1 from public.trades), {q(t)}, '{{}}'::jsonb, 'Unspecified', 4, 12,",
                    "  'Not specified', 'Not available', '[]'::jsonb, '{}'::jsonb",
                    f"where not exists (select 1 from public.trades where lower(name_en) = lower({q(t)}));", ""]
    for state, district in sorted(seen_districts):
        sql.append(f"insert into public.districts (state, name) values ({q(state)}, {q(district)}) on conflict do nothing;")
    for name, state, district in sorted(providers):
        sql += ["insert into public.providers (name, type, state, district, accreditation, fee_inr, contact, verified, is_synthetic, source_id)",
                f"select {q(name)}, 'Training provider (dummy)', {q(state)}, {q(district)}, 'Not available', 0, null, false, true, s.id",
                f"from public.data_sources s where s.document_reference = {q(ref)}",
                f"  and not exists (select 1 from public.providers p where p.name = {q(name)} and p.district = {q(district)});"]
    sql.append("")
    for m in metric_rows:
        pid = (f"(select p.id from public.providers p where p.name = {q(m['provider'])} and p.district = {q(m['district'])} limit 1)"
               if m["provider"] else "null")
        sample = "null" if m["sample"] is None else str(m["sample"])
        sql += ["insert into public.outcome_metrics (trade_id, provider_id, state, district, metric_key, metric_value, unit, year,",
                "  sample_size, source_id, verification_date, verification_status, data_quality, confidence, is_synthetic)",
                f"select t.id, {pid}, {q(m['state'])}, {q(m['district'])}, {q(m['key'])}, {m['val']!r}, {q(METRICS[m['key']])}, {m['year']},",
                f"  {sample}, s.id, null::date, 'pending', 'unknown', null, true",
                "from public.trades t cross join public.data_sources s",
                f"where lower(t.name_en) = lower({q(m['trade'])}) and s.document_reference = {q(ref)}",
                "  and not exists (select 1 from public.outcome_metrics x where x.trade_id = t.id",
                f"    and x.district = {q(m['district'])} and x.metric_key = {q(m['key'])} and x.year = {m['year']} and x.source_id = s.id",
                f"    and x.provider_id is not distinct from {pid});"]
    sql += ["", "commit;", ""]
    report = {"cols": cols, "errors": errors, "warnings": warnings, "rows": valid_rows,
              "metrics": len(metric_rows), "trades": trades_seen, "unknown_trades": unknown_trades}
    return "\n".join(sql), report


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("file", type=Path)
    ap.add_argument("--out", type=Path, default=Path("import_dataset.sql"))
    ap.add_argument("--source-title", default="Dummy placement and earnings data provided for evaluation (illustrative only)")
    ap.add_argument("--replace-previous", action="store_true", help="delete earlier dummy rows before loading")
    ap.add_argument("--create-missing-trades", action="store_true")
    args = ap.parse_args(argv)

    ref = "dummy-import-" + hashlib.sha256(args.file.read_bytes()).hexdigest()[:10]
    headers, rows = read_rows(args.file)
    sql, rep = build(headers, rows, args.source_title, ref, args.replace_previous, args.create_missing_trades)

    print(f"File: {args.file.name}   rows read: {len(rows)}   source id: {ref}")
    print("Columns understood:", ", ".join(f"{k} <- '{v}'" for k, v in rep["cols"].items()) or "none")
    for label, items in (("ERRORS", rep["errors"]), ("WARNINGS", rep["warnings"])):
        if items:
            print(f"\n{label} ({len(items)}):")
            for line in items[:25]:
                print("  -", line)
            if len(items) > 25:
                print(f"  ... {len(items) - 25} more")
    if not sql or rep["metrics"] == 0:
        print("\nNothing to import. Fix the file and run again.")
        return 2
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(sql, encoding="utf-8")
    print(f"\nOK: {rep['rows']} rows -> {rep['metrics']} metrics for {len(rep['trades'])} trades. Wrote {args.out}")
    print("Next: open Supabase -> SQL Editor, paste the file, run. All rows are labelled DUMMY / synthetic.")
    return 1 if rep["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
