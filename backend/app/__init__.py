import logging
import sys

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_migrate import Migrate

from .config import Config
from .extensions import db
from .routes import api

migrate = Migrate()


def _configure_logging(app: Flask) -> None:
    """Stream JSON-friendly logs to stdout so Railway captures them."""
    if not app.debug:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(logging.INFO)
        formatter = logging.Formatter(
            "[%(asctime)s] %(levelname)s %(name)s: %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%SZ",
        )
        handler.setFormatter(formatter)
        app.logger.handlers = [handler]
        app.logger.setLevel(logging.INFO)
        # Also capture werkzeug request logs at INFO
        logging.getLogger("werkzeug").setLevel(logging.WARNING)


def create_app(config_object=Config):
    app = Flask(__name__)
    app.config.from_object(config_object)

    _configure_logging(app)

    db.init_app(app)
    migrate.init_app(app, db)
    CORS(
        app,
        resources={r"/api/*": {"origins": app.config["FRONTEND_ORIGIN"]}},
        supports_credentials=True,
    )

    app.register_blueprint(api)

    @app.errorhandler(400)
    @app.errorhandler(401)
    @app.errorhandler(403)
    @app.errorhandler(404)
    @app.errorhandler(409)
    @app.errorhandler(422)
    @app.errorhandler(502)
    def handle_error(error):
        return jsonify({"error": error.description}), error.code

    @app.errorhandler(500)
    def handle_server_error(error):
        app.logger.exception(
            "500 on %s %s", request.method, request.path
        )
        return jsonify({"error": "internal server error"}), 500

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

    @app.cli.command("send-reminders")
    def send_reminders():
        """Notify participants who have pending predictions for today's games."""
        from .reminders import send_pending_prediction_reminders

        count = send_pending_prediction_reminders()
        print(f"sent {count} reminders")

    @app.cli.command("link-external-ids")
    def link_external_ids_cmd():
        """One-shot: populate Team.external_id and Match.external_id from football-data.org.

        Idempotent — safe to re-run; only fills NULL values.
        Run once after applying the external-ids migration in production.
        """
        from .sync_service import link_external_ids

        summary = link_external_ids()
        print(f"link-external-ids done: {summary}")

    @app.cli.command("sync-results")
    def sync_results_cmd():
        """Hourly cron: sync match results from football-data.org.

        Checks tournaments with an external_competition_code set and applies
        scores for matches that started >=2h ago and are not yet finished.
        """
        from .models import Tournament
        from .sync_service import sync_tournament_results

        tournaments = (
            Tournament.active()
            .filter(Tournament.external_competition_code.isnot(None))
            .all()
        )
        if not tournaments:
            print("sync-results: no tournaments with external_competition_code configured")
            return

        for tournament in tournaments:
            print(f"sync-results: processing tournament '{tournament.name}'")
            summary = sync_tournament_results(tournament)
            print(f"sync-results: {summary}")

    return app
