"""add dataset profile and understanding columns

Revision ID: b2c3d4e5f60
Revises: a1b2c3d4e5f6
Create Date: 2026-07-16 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel  # provides sqlmodel.sql.sqltypes.AutoString used by SQLModel columns


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f60'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('datasets', sa.Column('profile', sa.JSON(), nullable=True))
    op.add_column('datasets', sa.Column('understanding', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('datasets', 'understanding')
    op.drop_column('datasets', 'profile')
