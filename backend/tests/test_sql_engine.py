import pandas as pd

from app.services.sql.engine import validate_sql, execute_query, suggest_chart

COLS = ["age", "region", "score"]


def test_rejects_drop():
    ok, err = validate_sql("DROP TABLE dataset", COLS)
    assert not ok and err


def test_rejects_dml():
    for sql in ["DELETE FROM dataset", "UPDATE dataset SET age=1", "INSERT INTO dataset VALUES (1)", "CREATE TABLE x (a INT)"]:
        ok, _ = validate_sql(sql, COLS)
        assert not ok, sql


def test_rejects_other_table():
    ok, _ = validate_sql("SELECT * FROM other", COLS)
    assert not ok


def test_rejects_unknown_column():
    ok, err = validate_sql("SELECT missing FROM dataset", COLS)
    assert not ok and "missing" in err


def test_rejects_multi_statement():
    ok, _ = validate_sql("SELECT 1; SELECT 2", COLS)
    assert not ok


def test_allows_valid_select():
    ok, err = validate_sql("SELECT age, region FROM dataset WHERE age > 10", COLS)
    assert ok, err


def test_allows_subquery():
    ok, err = validate_sql(
        "SELECT * FROM (SELECT * FROM dataset) sub WHERE sub.age > 1", COLS
    )
    assert ok, err


def test_execute_returns_rows_and_columns():
    df = pd.DataFrame({"age": [10, 20, 30], "region": ["n", "s", "n"]})
    res = execute_query(df, "SELECT region, COUNT(*) AS c FROM dataset GROUP BY region")
    assert res["columns"] == ["region", "c"]
    assert res["row_count"] == 2
    assert res["truncated"] is False
    assert res["duration_ms"] >= 0


def test_execute_truncates():
    df = pd.DataFrame({"x": list(range(50))})
    res = execute_query(df, "SELECT x FROM dataset", max_rows=10)
    assert res["row_count"] == 50
    assert res["truncated"] is True
    assert len(res["rows"]) == 10


def test_suggest_chart_two_numeric():
    v = suggest_chart(["a", "b"], [{"a": 1, "b": 2}])
    assert v is not None and v.chart_type == "scatter"


def test_suggest_chart_one_numeric_one_cat():
    v = suggest_chart(["region", "score"], [{"region": "n", "score": 1}])
    assert v is not None and v.chart_type == "bar"


def test_suggest_chart_single_numeric():
    v = suggest_chart(["age"], [{"age": 1}])
    assert v is not None and v.chart_type == "histogram"
