"""Tests for tools/import_dataset.py (the evaluation-dataset importer)."""
import importlib.util
from pathlib import Path

TOOL = Path(__file__).resolve().parents[3] / "tools" / "import_dataset.py"
spec = importlib.util.spec_from_file_location("import_dataset", TOOL)
imp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(imp)


def run(tmp_path, text, name="d.csv", **kw):
    f = tmp_path / name
    f.write_text(text, encoding="utf-8")
    headers, rows = imp.read_rows(f)
    return imp.build(headers, rows, "t", "dummy-import-test", kw.get("replace", False), kw.get("create", False))


def test_loose_headers_are_matched(tmp_path):
    sql, rep = run(tmp_path, "Course,District,Batch,Placement (%),Avg Starting Salary (INR/month),Salary after 3 years\n"
                             "Electrician,warangal,2024,78%,\"Rs. 16,500\",26000\n")
    assert rep["cols"]["trade"] == "Course" and rep["cols"]["year"] == "Batch"
    assert rep["cols"]["starting_earnings"].startswith("Avg Starting")
    assert rep["cols"]["earnings_after_period"] == "Salary after 3 years"  # not mistaken for starting pay
    assert rep["metrics"] == 3 and "16500.0" in sql and "'Warangal'" in sql


def test_everything_is_labelled_dummy_never_verified(tmp_path):
    sql, _ = run(tmp_path, "trade,district,placement_rate\nElectrician,Warangal,70\n")
    assert "is_synthetic" in sql and "true" in sql and "'pending'" in sql
    assert "'verified'" not in sql and "Hackathon evaluation dataset (dummy)" in sql


def test_fractions_converted_only_when_all_in_0_1(tmp_path):
    sql, rep = run(tmp_path, "trade,district,placement\nElectrician,Warangal,0.78\nPlumber,Warangal,0.5\n")
    assert "78.0" in sql and any("fractions" in w for w in rep["warnings"])
    sql2, rep2 = run(tmp_path, "trade,district,placement\nElectrician,Warangal,0.78\nPlumber,Warangal,64\n", name="e.csv")
    assert "0.78" in sql2 and not any("fractions" in w for w in rep2["warnings"])


def test_bad_values_are_skipped_not_fixed(tmp_path):
    sql, rep = run(tmp_path, "trade,district,placement_rate,starting_salary\n"
                             "Electrician,Warangal,140,15000\nPlumber,Warangal,50,-5\nWelder,Warangal,60,900000\n")
    # skipping is per metric: the valid salary / placement in each row is kept, the bad one is reported
    assert rep["metrics"] == 3
    assert len([e for e in rep["errors"] if "skipped" in e]) == 3
    assert "140" not in sql and "-5" not in sql and "900000" not in sql


def test_unreadable_number_reports_row(tmp_path):
    _, rep = run(tmp_path, "trade,district,placement_rate\nElectrician,Warangal,seventy\n")
    assert rep["metrics"] == 0 and any("row 2" in e for e in rep["errors"])


def test_sql_injection_is_escaped(tmp_path):
    sql, _ = run(tmp_path, "trade,district,placement_rate\nO'Brien'; drop table trades;--,Warangal,50\n")
    assert "O''Brien''; drop table trades;--" in sql
    assert "'O'Brien" not in sql.replace("O''Brien", "")


def test_district_typo_corrected_with_warning(tmp_path):
    sql, rep = run(tmp_path, "trade,district,placement_rate\nElectrician,Warrangal,50\n")
    assert "'Warangal'" in sql and any("read as 'Warangal'" in w for w in rep["warnings"])


def test_long_format(tmp_path):
    sql, rep = run(tmp_path, "trade,district,year,metric,value\nElectrician,Warangal,2024,placement rate,70\n"
                             "Electrician,Warangal,2024,starting_salary,15000\n")
    assert rep["metrics"] == 2 and "'starting_earnings'" in sql


def test_missing_required_columns_is_an_error(tmp_path):
    sql, rep = run(tmp_path, "foo,bar\n1,2\n")
    assert sql == "" and rep["errors"]


def test_replace_previous_only_deletes_synthetic(tmp_path):
    sql, _ = run(tmp_path, "trade,district,placement_rate\nElectrician,Warangal,70\n", replace=True)
    assert "delete from public.outcome_metrics where is_synthetic = true" in sql


def test_sample_file_is_valid():
    out = TOOL.parent / "sample_dataset.csv"
    headers, rows = imp.read_rows(out)
    sql, rep = imp.build(headers, rows, "t", "dummy-import-x", False, False)
    assert rep["metrics"] == 8 and not rep["errors"]


def test_earnings_ranges_are_imported_and_not_mixed_up(tmp_path):
    sql, rep = run(tmp_path, "trade,district,starting_salary_min,starting_salary_max,starting_salary\n"
                             "Electrician,Warangal,14000,18000,16000\n")
    assert rep["cols"]["starting_earnings_min"] == "starting_salary_min"
    assert rep["cols"]["starting_earnings"] == "starting_salary"
    assert rep["metrics"] == 3 and "'starting_earnings_min'" in sql and "'starting_earnings_max'" in sql


def test_min_greater_than_max_is_rejected(tmp_path):
    sql, rep = run(tmp_path, "trade,district,salary_min,salary_max\nElectrician,Warangal,20000,15000\n")
    assert rep["metrics"] == 0 and any("greater than max" in e for e in rep["errors"])
