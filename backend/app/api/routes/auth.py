"""Authentication routes: email/password (JWT) + Google OAuth stub.

The credential flow is fully implemented. Google OAuth is scaffolded behind a
clear interface — we finalize the provider/config when we decide the backend.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.core.security import create_access_token, hash_password, verify_password
from app.db import Repository
from app.models.user import User
from app.schemas.auth import Token
from app.schemas.user import UserCreate, UserRead

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, session: SessionDep) -> User:
    existing = session.exec(select(User).where(User.email == payload.email)).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
    )
    return Repository(User, session).create(user)


@router.post("/login", response_model=Token)
def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: SessionDep,
) -> Token:
    user = session.exec(select(User).where(User.email == form_data.username)).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return Token(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserRead)
def read_me(current_user: CurrentUser) -> User:
    return current_user


@router.get("/google/login")
def google_login() -> dict:
    """Initiate Google OAuth.

    Placeholder: once the auth backend is finalized (Supabase Auth or a direct
    Google OAuth client), this redirects to Google's consent screen and the
    callback at `/auth/google/callback` mints a local JWT.
    """
    # TODO: implement once backend decision is made.
    return {
        "status": "not_implemented",
        "detail": "Google OAuth will be wired when the auth backend is finalized.",
    }
