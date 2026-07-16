"""add dataset version lineage columns

Revision ID: c4d5e6f7a8b9
Revises: b2c3d4e5f60
Create Date: 2026-07-16 20:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel  # provides sqlmodel.sql.sqltypes.AutoString used by SQLModel columns


# revision identifiers, used by Alembic.
revision: str = 'c4d5e6f7a8b9'
down_revision: Union[str, None] = 'b2c3d4e5f60'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Lineage columns. parent_id/root_id are nullable self-references so the
    # initial upload (a root) has no parent. origin defaults to 'upload'; recipe
    # holds the executed cleaning recipe for derived versions (NULL for uploads).
    op.add_column('datasets', sa.Column('parent_id', sa.Integer(), nullable=True))
    op.add_column('datasets', sa.Column('root_id', sa.Integer(), nullable=True))
    op.add_column(
        'datasets',
        sa.Column('origin', sqlmodel.sql.sqltypes.AutoString(), nullable=False, server_default='upload'),
    )
    op.add_column('datasets', sa.Column('recipe', sa.JSON(), nullable=True))

    op.create_foreign_key('fk_datasets_parent_id', 'datasets', 'datasets', ['parent_id'], ['id'])
    op.create_foreign_key('fk_datasets_root_id', 'datasets', 'datasets', ['root_id'], ['id'])
    op.create_index(op.f('ix_datasets_root_id'), 'datasets', ['root_id'], unique=False)

    # Backfill existing uploads: each is the root of its own lineage.
    op.execute("UPDATE datasets SET root_id = id WHERE root_id IS NULL")

    # Drop the server_default now that existing rows are backfilled; the model
    # supplies 'upload' for new rows, keeping the column NOT NULL.
    op.alter_column('datasets', 'origin', server_default=None)


def downgrade() -> None:
    op.drop_index(op.f('ix_datasets_root_id'), table_name='datasets')
    op.drop_constraint('fk_datasets_root_id', 'datasets', type_='foreignkey')
    op.drop_constraint('fk_datasets_parent_id', 'datasets', type_='foreignkey')
    op.drop_column('datasets', 'recipe')
    op.drop_column('datasets', 'origin')
    op.drop_column('datasets', 'root_id')
    op.drop_column('datasets', 'parent_id')
