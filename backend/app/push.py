"""Web Push delivery via VAPID."""
from __future__ import annotations

import json

from flask import current_app

from .extensions import db
from .models import PushSubscription


def _vapid_claims() -> dict:
    return {"sub": current_app.config["VAPID_SUBJECT"]}


def send_to_subscription(subscription: PushSubscription, payload: dict) -> bool:
    """Send a push payload to a single subscription.

    Returns True on success. On a 404/410 (the subscription is gone), the
    subscription is soft-deleted and False is returned. Other errors are
    logged and swallowed so one bad device never aborts a batch.
    """
    private_key = current_app.config.get("VAPID_PRIVATE_KEY")
    if not private_key:
        current_app.logger.warning("VAPID_PRIVATE_KEY not configured; skipping push")
        return False

    from pywebpush import WebPushException, webpush

    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
            },
            data=json.dumps(payload),
            vapid_private_key=private_key,
            vapid_claims=_vapid_claims(),
        )
        return True
    except WebPushException as exc:
        status = getattr(exc.response, "status_code", None)
        if status in (404, 410):
            subscription.soft_delete()
            db.session.commit()
        else:
            current_app.logger.warning("web push failed (%s): %s", status, exc)
        return False


def send_to_user(user_id: str, payload: dict) -> int:
    """Send a payload to all active subscriptions of a user. Returns count delivered."""
    subscriptions = PushSubscription.active().filter_by(user_id=user_id).all()
    delivered = 0
    for subscription in subscriptions:
        if send_to_subscription(subscription, payload):
            delivered += 1
    return delivered
