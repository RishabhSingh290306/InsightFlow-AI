"""Generic repository providing CRUD over a SQLModel table.

Example:
    users = Repository(User, session)
    user = users.get_by_id(1)
    user = users.create(User(email="a@b.co", hashed_password="..."))
"""
from __future__ import annotations

from typing import Generic, TypeVar

from sqlmodel import Session, SQLModel, select

ModelType = TypeVar("ModelType", bound=SQLModel)

CreateSchemaType = TypeVar("CreateSchemaType", bound=SQLModel)


class Repository(Generic[ModelType]):
    def __init__(self, model: type[ModelType], session: Session) -> None:
        self.model = model
        self.session = session

    def get_by_id(self, item_id: int) -> ModelType | None:
        return self.session.get(self.model, item_id)

    def list(self, *, limit: int = 100, offset: int = 0) -> list[ModelType]:
        stmt = select(self.model).offset(offset).limit(limit)
        return list(self.session.exec(stmt).all())

    def create(self, obj: ModelType) -> ModelType:
        self.session.add(obj)
        self.session.commit()
        self.session.refresh(obj)
        return obj

    def update(self, obj: ModelType, **changes: object) -> ModelType:
        for key, value in changes.items():
            setattr(obj, key, value)
        self.session.add(obj)
        self.session.commit()
        self.session.refresh(obj)
        return obj

    def delete(self, obj: ModelType) -> None:
        self.session.delete(obj)
        self.session.commit()
