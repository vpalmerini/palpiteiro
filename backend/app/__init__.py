from flask import Flask, jsonify
from flask_cors import CORS
from flask_migrate import Migrate

from .config import Config
from .extensions import db
from .routes import api

migrate = Migrate()


def create_app(config_object=Config):
    app = Flask(__name__)
    app.config.from_object(config_object)

    db.init_app(app)
    migrate.init_app(app, db)
    CORS(
        app,
        resources={r"/api/*": {"origins": app.config["FRONTEND_ORIGIN"]}},
        supports_credentials=True,
    )

    app.register_blueprint(api)

    @app.errorhandler(400)
    @app.errorhandler(403)
    @app.errorhandler(404)
    @app.errorhandler(409)
    @app.errorhandler(422)
    def handle_error(error):
        return jsonify({"error": error.description}), error.code

    @app.cli.command("init-db")
    def init_db():
        """Apply all pending Alembic migrations (alias for `flask db upgrade`)."""
        from flask_migrate import upgrade

        upgrade()
        print("database migrated to head")

    @app.cli.command("stamp-db")
    def stamp_db():
        """Mark an existing schema as revision d129c90f03ee (before the index migration).

        Prerequisites: tables users, teams, pools, … already exist (plural names).
        Then run `flask --app run db upgrade` to apply f8a1b2c3d4e5 (teams name index).

        Do NOT use on an empty database — use `flask --app run db upgrade` instead.
        """
        from flask_migrate import stamp

        stamp(revision="d129c90f03ee")
        print("database stamped at d129c90f03ee — run db upgrade next")

    @app.cli.command("seed-db")
    def seed_db():
        from .seed_data import seed_database

        print(seed_database())

    return app
