"""
WebSocket endpoint at /ws/show/.

Connect with `?role=host` (superusers only) to control the show and receive display status,
or `?display=<n>` to act as display n. Anything else is a read-only viewer.

Client -> server:
    {"action": "next"} / {"action": "previous"} / {"action": "go_to", "index": n}   host only
    {"action": "heartbeat", "protected": bool}                                      displays
    {"action": "tamper"}                                                             displays

Server -> client:
    {"type": "state", index, total, current, next, after, est, elapsed}   everyone, on connect and on change
    {"type": "displays", "displays": [...]}                               everyone, when configs change
    {"type": "display_status", display, online, protected}                hosts
    {"type": "tamper", display}                                           hosts
    {"type": "pong"}                                                      reply to heartbeat
    {"type": "error", message}
"""
from urllib.parse import parse_qs

from asgiref.sync import async_to_sync
from channels.generic.websocket import JsonWebsocketConsumer

from . import show
from .models import DISPLAY_COUNT


class ShowConsumer(JsonWebsocketConsumer):

    def connect(self):
        params = parse_qs(self.scope["query_string"].decode())
        user = self.scope.get("user")
        self.is_host = False
        self.display = None

        if params.get("role") == ["host"]:
            if not (user and user.is_superuser):
                self.reject(4403)
                return
            self.is_host = True

        if "display" in params:
            display = params["display"][0]
            if not display.isdigit() or not 1 <= int(display) <= DISPLAY_COUNT:
                self.reject(4404)
                return
            self.display = int(display)

        async_to_sync(self.channel_layer.group_add)(show.SHOW_GROUP, self.channel_name)
        if self.is_host:
            async_to_sync(self.channel_layer.group_add)(show.HOSTS_GROUP, self.channel_name)
        self.accept()

        self.send_json({"type": "state", **show.get_state()})

    def reject(self, code):
        # Accept before closing: a socket refused during the handshake reaches the browser as a
        # generic 1006, and the frontend needs the code to know not to retry.
        self.accept()
        self.close(code=code)

    def disconnect(self, code):
        async_to_sync(self.channel_layer.group_discard)(show.SHOW_GROUP, self.channel_name)
        if self.is_host:
            async_to_sync(self.channel_layer.group_discard)(show.HOSTS_GROUP, self.channel_name)
        if self.display:
            show.broadcast(show.HOSTS_GROUP, {
                "type": "display_status", "display": self.display, "online": False, "protected": False,
            })

    def receive_json(self, content, **kwargs):
        action = content.get("action") if isinstance(content, dict) else None
        handler = self.host_actions.get(action) if self.is_host else None
        handler = handler or (self.display_actions.get(action) if self.display else None)
        if handler is None:
            self.send_json({"type": "error", "message": f"Unknown or forbidden action: {action!r}"})
            return
        handler(self, content)

    # Host actions

    def next(self, content):
        show.step(1)
        show.broadcast_state()

    def previous(self, content):
        show.step(-1)
        show.broadcast_state()

    def go_to(self, content):
        try:
            index = int(content["index"])
        except (KeyError, TypeError, ValueError):
            self.send_json({"type": "error", "message": "go_to requires an integer index"})
            return
        show.set_index(index)
        show.broadcast_state()

    # Display actions

    def heartbeat(self, content):
        show.broadcast(show.HOSTS_GROUP, {
            "type": "display_status",
            "display": self.display,
            "online": True,
            "protected": bool(content.get("protected")),
        })
        self.send_json({"type": "pong"})

    def tamper(self, content):
        show.broadcast(show.HOSTS_GROUP, {"type": "tamper", "display": self.display})

    host_actions = {"next": next, "previous": previous, "go_to": go_to}
    display_actions = {"heartbeat": heartbeat, "tamper": tamper}

    # Channel layer events

    def relay(self, event):
        self.send_json(event["message"])
