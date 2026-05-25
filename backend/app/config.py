import os


class Config:
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://bolao:bolao@localhost:5432/bolao",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JSON_SORT_KEYS = False
    FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
    GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
    JWT_SECRET = os.getenv("JWT_SECRET", "dev-insecure-secret-change-in-prod")
    JWT_COOKIE_SECURE = os.getenv("FLASK_ENV") == "production"
