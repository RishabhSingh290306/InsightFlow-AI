"""add sql_queries table

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-07-17 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel  # provides AutoString used by SQLModel columns


revision: str = 'e6f7a8b9c0d1'
down_revision: Union[str, Sequence[str], None] = 'd5e6f7a8b9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'sql_queries',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('dataset_id', sa.Integer(), nullable=False),
        sa.Column('owner_id', sa.Integer(), nullable=False),
        sa.Column('business_question', sa.Text(), nullable=False),
        sa.Column('sql', sa.Text(), nullable=False),
        sa.Column('edited', sa.Boolean(), nullable=False),
        sa.Column('explanation', sa.Text(), nullable=False),
        sa.Column('suggested_visualization', sa.JSON(), nullable=True),
        sa.Column('insights', sa.JSON(), nullable=True),
        sa.Column('columns', sa.JSON(), nullable=True),
        sa.Column('row_count', sa.Integer(), nullable=True),
        sa.Column('truncated', sa.Boolean(), nullable=True),
        sa.Column('duration_ms', sa.Float(), nullable=True),
        sa.Column('executed_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id']),
        sa.ForeignKeyConstraint(['dataset_id'], ['datasets.id']),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_sql_queries_project_id', 'sql_queries', ['project_id'])
    op.create_index('ix_sql_queries_dataset_id', 'sql_queries', ['dataset_id'])
    op.create_index('ix_sql_queries_owner_id', 'sql_queries', ['owner_id'])


def downgrade() -> None:
    op.drop_index('ix_sql_queries_owner_id', table_name='sql_queries')
    op.drop_index('ix_sql_queries_dataset_id', table_name='sql_queries')
    op.drop_index('ix_sql_queries_project_id', table_name='sql_queries')
    op.drop_table('sql_queries')
