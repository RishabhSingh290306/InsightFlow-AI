"""create datasets

Revision ID: a1b2c3d4e5f6
Revises: 3becd21601fb
Create Date: 2026-07-16 19:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel  # provides sqlmodel.sql.sqltypes.AutoString used by SQLModel columns


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '3becd21601fb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'datasets',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('owner_id', sa.Integer(), nullable=False),
        sa.Column('filename', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('original_filename', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('name_stem', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('storage_path', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=False),
        sa.Column('mime_type', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('file_format', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('row_count', sa.Integer(), nullable=True),
        sa.Column('column_count', sa.Integer(), nullable=True),
        sa.Column('status', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id']),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_datasets_project_id'), 'datasets', ['project_id'], unique=False)
    op.create_index(op.f('ix_datasets_owner_id'), 'datasets', ['owner_id'], unique=False)
    op.create_index(op.f('ix_datasets_name_stem'), 'datasets', ['name_stem'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_datasets_name_stem'), table_name='datasets')
    op.drop_index(op.f('ix_datasets_owner_id'), table_name='datasets')
    op.drop_index(op.f('ix_datasets_project_id'), table_name='datasets')
    op.drop_table('datasets')
