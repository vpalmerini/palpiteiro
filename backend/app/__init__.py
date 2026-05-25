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
    def handle_error(error):
        return jsonify({"error": error.description}), error.code

    @app.cli.command("init-db")
    def init_db():
        db.create_all()
        print("database initialized")

    @app.cli.command("seed-db")
    def seed_db():
        from .routes import seed_database

        print(seed_database())

    return app
