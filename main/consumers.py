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

Video (WebRTC). Media goes straight from the host's browser to each display; the server only
relays the small setup messages, addressing each display socket by a random `peer` id.
    host -> server:    {"action": "video_state", "live": bool, "network": "local"|"internet"}
                       {"action": "signal", "peer": id, "data": {...}}
    display -> server: {"action": "video_join"}            ask the streaming host for an offer
                       {"action": "video_leave"}           stop receiving (e.g. layout set to "No video")
                       {"action": "signal", "data": {...}}
    server -> all:     {"type": "video", live, network, ice_servers}   on connect and on change
                       (each display's layout is part of its display config)
    server -> hosts:   {"type": "video_join", peer, display} / {"type": "video_leave", peer}
                       {"type": "signal", peer, data}
    server -> display: {"type": "signal", data}
"""
import re
from urllib.parse import parse_qs
from uuid import uuid4

from asgiref.sync import async_to_sync
from channels.generic.websocket import JsonWebsocketConsumer

from . import show
from .models import DISPLAY_COUNT


PEER_ID = re.compile(r"[0-9a-f]{32}")


class ShowConsumer(JsonWebsocketConsumer):

    def connect(self):
        params = parse_qs(self.scope["query_string"].decode())
        user = self.scope.get("user")
        self.is_host = False
        self.display = None
        self.peer = None
        self.streaming = False

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
            self.peer = uuid4().hex

        async_to_sync(self.channel_layer.group_add)(show.SHOW_GROUP, self.channel_name)
        if self.is_host:
            async_to_sync(self.channel_layer.group_add)(show.HOSTS_GROUP, self.channel_name)
        if self.peer:
            async_to_sync(self.channel_layer.group_add)(show.peer_group(self.peer), self.channel_name)
        self.accept()

        self.send_json({"type": "state", **show.get_state()})
        self.send_json(show.video_message())

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
            async_to_sync(self.channel_layer.group_discard)(show.peer_group(self.peer), self.channel_name)
            show.broadcast(show.HOSTS_GROUP, {
                "type": "display_status", "display": self.display, "online": False, "protected": False,
            })
            show.broadcast(show.HOSTS_GROUP, {"type": "video_leave", "peer": self.peer})
        if self.streaming:
            show.video_state["live"] = False
            show.broadcast_video()

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

    def video_state(self, content):
        live = content.get("live")
        network = content.get("network", show.video_state["network"])
        if not isinstance(live, bool) or network not in show.VIDEO_NETWORKS:
            self.send_json({"type": "error", "message": "video_state requires live (bool) and a valid network"})
            return
        self.streaming = live
        show.video_state.update(live=live, network=network)
        show.broadcast_video()

    def host_signal(self, content):
        peer, data = content.get("peer"), content.get("data")
        if not isinstance(peer, str) or not PEER_ID.fullmatch(peer) or not isinstance(data, dict):
            self.send_json({"type": "error", "message": "signal requires a peer id and a data object"})
            return
        show.broadcast(show.peer_group(peer), {"type": "signal", "data": data})

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

    def video_join(self, content):
        show.broadcast(show.HOSTS_GROUP, {"type": "video_join", "peer": self.peer, "display": self.display})

    def video_leave(self, content):
        show.broadcast(show.HOSTS_GROUP, {"type": "video_leave", "peer": self.peer})

    def display_signal(self, content):
        if not isinstance(content.get("data"), dict):
            self.send_json({"type": "error", "message": "signal requires a data object"})
            return
        show.broadcast(show.HOSTS_GROUP, {"type": "signal", "peer": self.peer, "data": content["data"]})

    host_actions = {
        "next": next, "previous": previous, "go_to": go_to,
        "video_state": video_state, "signal": host_signal,
    }
    display_actions = {
        "heartbeat": heartbeat, "tamper": tamper,
        "video_join": video_join, "video_leave": video_leave, "signal": display_signal,
    }

    # Channel layer events

    def relay(self, event):
        self.send_json(event["message"])
