"""add notebooks table

Revision ID: i0j1k2l3m4n5
Revises: h9i0j1k2l3m4
Create Date: 2026-07-17 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "i0j1k2l3m4n5"
down_revision: Union[str, Sequence[str], None] = "h9i0j1k2l3m4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notebooks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("scope", sa.String(), nullable=False),
        sa.Column("dataset_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("turns", sa.JSON(), nullable=True),
        sa.Column("share_token", sa.String(), nullable=False),
        sa.Column("ai_available", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("generated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notebooks_project_id", "notebooks", ["project_id"])
    op.create_index("ix_notebooks_owner_id", "notebooks", ["owner_id"])
    op.create_index("ix_notebooks_dataset_id", "notebooks", ["dataset_id"])
    op.create_index("ix_notebooks_share_token", "notebooks", ["share_token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_notebooks_share_token", table_name="notebooks")
    op.drop_index("ix_notebooks_dataset_id", table_name="notebooks")
    op.drop_index("ix_notebooks_owner_id", table_name="notebooks")
    op.drop_index("ix_notebooks_project_id", table_name="notebooks")
    op.drop_table("notebooks")
