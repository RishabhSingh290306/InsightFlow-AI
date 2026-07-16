"""Deterministic EDA engine: candidate chart generation + AI proposer."""
from app.services.eda.engine import build_candidates
from app.services.eda.proposer import propose_charts

__all__ = ["build_candidates", "propose_charts"]
