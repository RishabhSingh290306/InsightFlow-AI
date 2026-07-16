import pandas as pd
import numpy as np
from app.schemas.understanding import DatasetProfile
from app.services.eda.engine import build_candidates


def _profile(numeric, categorical, missing=None, target=None):
    return DatasetProfile(
        file_name="t.csv", file_size=10, row_count=100, column_count=len(numeric) + len(categorical),
        column_names=numeric + categorical,
        inferred_types={c: "numeric" for c in numeric} | {c: "categorical" for c in categorical},
        numeric_columns=list(numeric), categorical_columns=list(categorical), date_columns=[],
        missing_values=missing or {c: 0 for c in numeric + categorical},
        duplicate_row_count=0, null_percentage=0.0,
        unique_values={c: 10 for c in numeric + categorical},
        basic_statistics={}, potential_target_column=target, data_quality_issues=[], preview=[],
    )


def test_histogram_bins_sum_to_row_count():
    df = pd.DataFrame({"age": np.random.default_rng(0).integers(0, 100, 100)})
    charts = build_candidates(df, _profile(["age"], []))
    hist = [c for c in charts if c.chart_type == "histogram"]
    assert hist, "expected a histogram"
    assert sum(d["count"] for d in hist[0].data) == 100


def test_correlation_heatmap_is_symmetric_and_diagonal_one():
    rng = np.random.default_rng(1)
    df = pd.DataFrame({"a": rng.normal(size=50), "b": rng.normal(size=50)})
    df["b"] = df["a"] + rng.normal(scale=0.1, size=50)  # strong positive corr
    charts = build_candidates(df, _profile(["a", "b"], []))
    heat = [c for c in charts if c.chart_type == "heatmap"]
    assert heat, "expected a heatmap"
    cells = {(d["x"], d["y"]): d["value"] for d in heat[0].data}
    assert cells[("a", "a")] == 1.0 and cells[("b", "b")] == 1.0
    assert abs(cells[("a", "b")] - cells[("b", "a")]) < 1e-9
    assert cells[("a", "b")] > 0.9


def test_missingness_bar_matches_profile():
    df = pd.DataFrame({"x": [1, 2, None, 4], "y": [1, 2, 3, 4]})
    charts = build_candidates(df, _profile(["x", "y"], [], missing={"x": 1, "y": 0}))
    miss = [c for c in charts if c.metadata.get("aggregation") == "missing"]
    assert miss, "expected a missingness chart"
    assert {d["category"]: d["count"] for d in miss[0].data} == {"x": 1}


def test_box_stats_ordered():
    df = pd.DataFrame({"v": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]})
    charts = build_candidates(df, _profile(["v"], []))
    box = [c for c in charts if c.chart_type == "box" and c.metadata.get("aggregation") == "box"]
    assert box
    s = box[0].data[0]
    assert s["min"] <= s["q1"] <= s["median"] <= s["q3"] <= s["max"]


def test_categorical_bar_uses_top_counts():
    df = pd.DataFrame({"cat": ["a"] * 3 + ["b"] * 2 + ["c"] * 1})
    charts = build_candidates(df, _profile([], ["cat"]))
    bar = [c for c in charts if c.chart_type == "bar" and c.metadata.get("aggregation") == "value_counts"]
    assert bar
    assert {d["category"]: d["count"] for d in bar[0].data} == {"a": 3, "b": 2, "c": 1}
