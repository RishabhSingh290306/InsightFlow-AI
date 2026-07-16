"""add eda column to datasets

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-07-17 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel  # provides AutoString used by SQLModel columns


revision: str = 'd5e6f7a8b9c0'
down_revision: Union[str, None] = 'c4d5e6f7a8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable JSON holding the EdaResult (list of ChartSpec) for a dataset
    # version. NULL until EDA is generated.
    op.add_column('datasets', sa.Column('eda', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('datasets', 'eda')
