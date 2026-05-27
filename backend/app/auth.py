"""JWT session helpers and auth decorators."""
from datetime import datetime, timezone, timedelta
from functools import wraps

import jwt
from flask import current_app, g, jsonify, request

from .extensions import db

COOKIE_NAME = "bolao_session"
ALGORITHM = "HS256"
EXPIRY_DAYS = 30


def _secret() -> str:
    return current_app.config["JWT_SECRET"]


def make_session_jwt(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=EXPIRY_DAYS),
    }
    return jwt.encode(payload, _secret(), algorithm=ALGORITHM)


def get_current_user():
    """Read JWT cookie and return the User, or None if missing/invalid."""
    from .models import User

    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    try:
        payload = jwt.decode(token, _secret(), algorithms=[ALGORITHM])
        return db.session.get(User, payload["sub"])
    except jwt.PyJWTError:
        return None


def set_cookie(response, token: str):
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        secure=current_app.config.get("JWT_COOKIE_SECURE", False),
        samesite="Lax",
        max_age=EXPIRY_DAYS * 24 * 3600,
        path="/",
    )
    return response


def clear_cookie(response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return response


def require_auth(f):
    """Decorator: requires a valid session cookie. Sets g.current_user."""
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user()
        if user is None:
            return jsonify({"error": "authentication required"}), 401
        g.current_user = user
        return f(*args, **kwargs)
    return decorated


def require_admin(f):
    """Decorator: requires a valid session cookie with is_admin=True."""
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user()
        if user is None:
            return jsonify({"error": "authentication required"}), 401
        if not user.is_admin:
            return jsonify({"error": "forbidden"}), 403
        g.current_user = user
        return f(*args, **kwargs)
    return decorated
