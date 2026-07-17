"""add parent_query_id to sql_queries

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-07-17 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel  # provides AutoString used by SQLModel columns


revision: str = 'f7a8b9c0d1e2'
down_revision: Union[str, Sequence[str], None] = 'e6f7a8b9c0d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sql_queries', sa.Column('parent_query_id', sa.Integer(), nullable=True))
    op.create_index('ix_sql_queries_parent_query_id', 'sql_queries', ['parent_query_id'])
    op.create_foreign_key(
        'fk_sql_queries_parent_query_id', 'sql_queries', 'sql_queries',
        ['parent_query_id'], ['id'],
    )


def downgrade() -> None:
    op.drop_constraint('fk_sql_queries_parent_query_id', 'sql_queries', type_='foreignkey')
    op.drop_index('ix_sql_queries_parent_query_id', table_name='sql_queries')
    op.drop_column('sql_queries', 'parent_query_id')
