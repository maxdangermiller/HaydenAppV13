import json

from asgiref.sync import sync_to_async
from channels.testing import WebsocketCommunicator
from django.contrib.auth.models import AnonymousUser, User
from django.core.files.uploadedfile import SimpleUploadedFile
from datetime import timedelta

from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from App.asgi import application
from .consumers import ShowConsumer
from .models import NewDisplayConfig, RFIDData, Scene, ShowState
from . import show


def make_scenes(*names):
    for i, name in enumerate(names):
        Scene.objects.create(index=i, name=name, est_time=60 * (i + 1))


class ApiTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser("admin", password="pw")
        self.user = User.objects.create_user("stage", password="pw")

    def put_json(self, url, data):
        return self.client.put(url, json.dumps(data), content_type="application/json")

    def test_login_and_me(self):
        self.assertEqual(self.client.get("/api/auth/me/").json(), {"authenticated": False})
        bad = self.client.post("/api/auth/login/", {"username": "admin", "password": "x"}, content_type="application/json")
        self.assertEqual(bad.status_code, 401)
        ok = self.client.post("/api/auth/login/", {"username": "admin", "password": "pw"}, content_type="application/json")
        self.assertEqual(ok.json(), {"authenticated": True, "username": "admin", "is_superuser": True})
        self.client.post("/api/auth/logout/")
        self.assertFalse(self.client.get("/api/auth/me/").json()["authenticated"])

    def test_displays_fill_in_defaults(self):
        NewDisplayConfig.objects.create(display_number=2, name="Fitzgerald", play_sound=True)
        displays = self.client.get("/api/displays/").json()["displays"]
        self.assertEqual(len(displays), 6)
        self.assertEqual(displays[0], {"display_number": 1, "name": "Display 1", "play_sound": False, "max_video_fps": 30, "video_layout": "overlay"})
        self.assertEqual(displays[1], {"display_number": 2, "name": "Fitzgerald", "play_sound": True, "max_video_fps": 30, "video_layout": "overlay"})

    def test_update_display_requires_superuser(self):
        url = "/api/displays/3/"
        self.assertEqual(self.put_json(url, {"name": "Lobby", "play_sound": True}).status_code, 401)
        self.client.force_login(self.user)
        self.assertEqual(self.put_json(url, {"name": "Lobby", "play_sound": True}).status_code, 403)
        self.client.force_login(self.admin)
        self.assertEqual(self.put_json(url, {"name": "", "play_sound": True}).status_code, 400)
        self.assertEqual(self.put_json(url, {"name": "Lobby", "play_sound": "True"}).status_code, 400)
        self.assertEqual(self.put_json("/api/displays/7/", {"name": "x", "play_sound": True}).status_code, 404)
        self.assertEqual(self.put_json(url, {"name": "Lobby", "play_sound": True, "max_video_fps": 12}).status_code, 400)
        self.assertEqual(self.put_json(url, {"name": "Lobby", "play_sound": True}).status_code, 200)
        self.assertEqual(NewDisplayConfig.objects.get(display_number=3).name, "Lobby")
        self.assertEqual(self.put_json(url, {"name": "Lobby", "play_sound": True, "max_video_fps": 5}).status_code, 200)
        self.assertEqual(NewDisplayConfig.objects.get(display_number=3).max_video_fps, 5)
        self.assertEqual(self.put_json(url, {"name": "Lobby", "play_sound": True, "video_layout": "sideways"}).status_code, 400)
        self.assertEqual(self.put_json(url, {"name": "Lobby", "play_sound": True, "video_layout": "split"}).status_code, 200)
        self.assertEqual(NewDisplayConfig.objects.get(display_number=3).video_layout, "split")
        self.assertEqual(self.put_json(url, {"name": "Lobby", "play_sound": True, "video_layout": "none"}).status_code, 200)
        self.assertEqual(NewDisplayConfig.objects.get(display_number=3).video_layout, "none")

    def test_verify_rfid(self):
        RFIDData.objects.create(RFID="12345")
        post = lambda code: self.client.post("/api/rfid/verify/", {"code": code}, content_type="application/json")
        self.assertTrue(post("12345").json()["valid"])
        self.assertFalse(post("99999").json()["valid"])
        self.assertFalse(post("").json()["valid"])

    def test_upload_replaces_scenes_and_resets_show(self):
        make_scenes("Old 1", "Old 2", "Old 3")
        show.set_index(2)
        self.client.force_login(self.user)
        csv_file = SimpleUploadedFile("show.csv", "﻿name,est_time\nPreshow,0\nAct 1,300\n,\n".encode())
        response = self.client.post("/api/scenes/upload/", {"csv_file": csv_file})
        self.assertEqual(response.json(), {"count": 2})
        self.assertEqual(list(Scene.objects.order_by("index").values_list("name", "est_time")),
                         [("Preshow", 0), ("Act 1", 300)])
        self.assertEqual(ShowState.load().current_index, 0)

    def test_upload_rejects_bad_csv_without_touching_scenes(self):
        make_scenes("Keep me")
        self.client.force_login(self.user)
        for content, message in [
            (b"title,time\nA,1\n", "missing column"),
            (b"name,est_time\nA,soon\n", "Line 2"),
            (b"name,est_time\n", "no scenes"),
        ]:
            response = self.client.post("/api/scenes/upload/", {"csv_file": SimpleUploadedFile("s.csv", content)})
            self.assertEqual(response.status_code, 400)
            self.assertIn(message, response.json()["error"])
        self.assertEqual(Scene.objects.get().name, "Keep me")

    def test_upload_requires_login(self):
        response = self.client.post("/api/scenes/upload/", {"csv_file": SimpleUploadedFile("s.csv", b"name,est_time\nA,1\n")})
        self.assertEqual(response.status_code, 401)

    def test_update_scene_time(self):
        make_scenes("A")
        self.client.force_login(self.admin)
        response = self.client.patch("/api/scenes/0/", {"est_time": 95}, content_type="application/json")
        self.assertEqual(response.json()["est_time"], 95)
        self.assertEqual(self.client.patch("/api/scenes/0/", {"est_time": -1}, content_type="application/json").status_code, 400)
        self.assertEqual(self.client.patch("/api/scenes/5/", {"est_time": 1}, content_type="application/json").status_code, 404)

    def test_state_clamps_index(self):
        make_scenes("A", "B", "C")
        self.assertEqual(show.step(-1)["index"], 0)
        state = show.set_index(1)
        self.assertEqual((state["current"], state["next"], state["after"], state["est"]), ("B", "C", "", 120))
        self.assertEqual(show.set_index(10)["index"], 2)

    def test_preshow_detection(self):
        for name in ["Preshow", "Pre-show", "PRE SHOW", "pre_show"]:
            self.assertTrue(show.is_preshow(name), name)
        for name in ["Act 1", "Preshow music", "Show", ""]:
            self.assertFalse(show.is_preshow(name), name)
        make_scenes("Pre-show", "Act 1")
        self.assertTrue(show.get_state()["preshow"])
        self.assertFalse(show.set_index(1)["preshow"])

    def test_restart_resets_scene_and_timer(self):
        make_scenes("Preshow", "Act 1")
        show.set_index(1)
        ShowState.objects.update(changed_at=timezone.now() - timedelta(hours=3))
        state = show.restart()
        self.assertEqual((state["index"], state["current"], state["elapsed"]), (0, "Preshow", 0))
        # Also resets the timer when already on the first scene.
        ShowState.objects.update(changed_at=timezone.now() - timedelta(hours=3))
        self.assertEqual(show.restart()["elapsed"], 0)

    def test_state_with_no_scenes(self):
        state = show.get_state()
        self.assertEqual((state["total"], state["current"], state["est"]), (0, "", -1))


class ConsumerTests(TransactionTestCase):
    def setUp(self):
        show.video_state.update(live=False, network="local")
        show.connected_hosts = 0

    async def connect(self, query="", user=None):
        communicator = WebsocketCommunicator(ShowConsumer.as_asgi(), f"/ws/show/?{query}")
        communicator.scope["user"] = user or AnonymousUser()
        connected, code = await communicator.connect()
        return communicator, connected, code

    async def test_viewer_gets_state_and_cannot_control(self):
        await sync_to_async(make_scenes)("A", "B")
        viewer, connected, _ = await self.connect()
        self.assertTrue(connected)
        self.assertEqual((await viewer.receive_json_from())["current"], "A")
        self.assertEqual(await viewer.receive_json_from(), show.video_message())
        await viewer.send_json_to({"action": "next"})
        self.assertEqual((await viewer.receive_json_from())["type"], "error")
        await viewer.disconnect()

    async def test_host_requires_superuser(self):
        user = await sync_to_async(User.objects.create_user)("stage", password="pw")
        communicator, _, _ = await self.connect("role=host", user)
        self.assertEqual(await communicator.receive_output(), {"type": "websocket.close", "code": 4403})

    async def test_invalid_display_rejected(self):
        for query in ["display=9", "display=x", "display=-1"]:
            communicator, _, _ = await self.connect(query)
            self.assertEqual(await communicator.receive_output(), {"type": "websocket.close", "code": 4404})

    async def test_host_advances_show_for_everyone(self):
        await sync_to_async(make_scenes)("A", "B", "C")
        admin = await sync_to_async(User.objects.create_superuser)("admin", password="pw")
        host, connected, _ = await self.connect("role=host", admin)
        self.assertTrue(connected)
        display, _, _ = await self.connect("display=1")
        for communicator in (host, display):
            await communicator.receive_json_from()  # state
            await communicator.receive_json_from()  # video

        await host.send_json_to({"action": "next"})
        self.assertEqual((await display.receive_json_from())["current"], "B")
        self.assertEqual((await host.receive_json_from())["current"], "B")

        await host.send_json_to({"action": "go_to", "index": 2})
        self.assertEqual((await display.receive_json_from())["current"], "C")
        await host.receive_json_from()

        await display.send_json_to({"action": "heartbeat", "protected": True})
        self.assertEqual(await display.receive_json_from(), {"type": "pong"})
        self.assertEqual(await host.receive_json_from(),
                         {"type": "display_status", "display": 1, "online": True, "protected": True})

        await display.send_json_to({"action": "tamper"})
        self.assertEqual(await host.receive_json_from(), {"type": "tamper", "display": 1})

        await display.disconnect()
        self.assertEqual(await host.receive_json_from(),
                         {"type": "display_status", "display": 1, "online": False, "protected": False})
        self.assertEqual((await host.receive_json_from())["type"], "video_leave")
        await host.disconnect()

    async def test_video_signaling_is_relayed_between_host_and_one_display(self):
        admin = await sync_to_async(User.objects.create_superuser)("admin", password="pw")
        host, _, _ = await self.connect("role=host", admin)
        display, _, _ = await self.connect("display=2")
        other, _, _ = await self.connect("display=3")
        for communicator in (host, display, other):
            await communicator.receive_json_from()
            await communicator.receive_json_from()

        await host.send_json_to({"action": "video_state", "live": True})
        for communicator in (host, display, other):
            self.assertEqual(await communicator.receive_json_from(), {
                "type": "video", "live": True, "network": "local", "ice_servers": [],
            })

        await display.send_json_to({"action": "video_join"})
        join = await host.receive_json_from()
        self.assertEqual((join["type"], join["display"]), ("video_join", 2))
        peer = join["peer"]

        await host.send_json_to({"action": "signal", "peer": peer, "data": {"sdp": "offer"}})
        self.assertEqual(await display.receive_json_from(), {"type": "signal", "data": {"sdp": "offer"}})
        self.assertTrue(await other.receive_nothing())

        await display.send_json_to({"action": "signal", "data": {"sdp": "answer"}})
        self.assertEqual(await host.receive_json_from(), {"type": "signal", "peer": peer, "data": {"sdp": "answer"}})

        await display.send_json_to({"action": "video_leave"})
        self.assertEqual(await host.receive_json_from(), {"type": "video_leave", "peer": peer})

        await host.send_json_to({"action": "signal", "peer": "../evil", "data": {}})
        self.assertEqual((await host.receive_json_from())["type"], "error")

        # Losing the streaming host takes the video down for everyone.
        await host.disconnect()
        self.assertEqual(await display.receive_json_from(), {
            "type": "video", "live": False, "network": "local", "ice_servers": [],
        })
        await display.disconnect()
        await other.disconnect()

    @override_settings(WEBRTC_STUN_URLS=["stun:stun.example:3478"], WEBRTC_TURN_URLS=[])
    async def test_host_can_switch_video_to_internet_mode(self):
        admin = await sync_to_async(User.objects.create_superuser)("admin", password="pw")
        host, _, _ = await self.connect("role=host", admin)
        await host.receive_json_from()
        await host.receive_json_from()

        await host.send_json_to({"action": "video_state", "live": True, "network": "internet"})
        message = await host.receive_json_from()
        self.assertEqual((message["network"], message["ice_servers"]), ("internet", [{"urls": ["stun:stun.example:3478"]}]))

        await host.send_json_to({"action": "video_state", "live": True, "network": "satellite"})
        self.assertEqual((await host.receive_json_from())["type"], "error")
        await host.disconnect()

    async def test_opening_host_restarts_show_unless_another_host_is_connected(self):
        await sync_to_async(make_scenes)("Preshow", "Act 1", "Act 2")
        await sync_to_async(show.set_index)(2)
        admin = await sync_to_async(User.objects.create_superuser)("admin", password="pw")

        first, _, _ = await self.connect("role=host", admin)
        self.assertEqual((await first.receive_json_from())["current"], "Act 2")  # state as it was
        await first.receive_json_from()
        await first.send_json_to({"action": "open_show"})
        self.assertEqual((await first.receive_json_from())["current"], "Preshow")

        await first.send_json_to({"action": "next"})
        await first.receive_json_from()
        second, _, _ = await self.connect("role=host", admin)
        await second.receive_json_from()
        await second.receive_json_from()
        await second.send_json_to({"action": "open_show"})
        self.assertTrue(await second.receive_nothing())  # mid-show on another device: no reset
        self.assertEqual(await sync_to_async(lambda: ShowState.load().current_index)(), 1)
        await first.disconnect()
        await second.disconnect()

    async def test_displays_cannot_start_video(self):
        display, _, _ = await self.connect("display=1")
        await display.receive_json_from()
        await display.receive_json_from()
        await display.send_json_to({"action": "video_state", "live": True})
        self.assertEqual((await display.receive_json_from())["type"], "error")
        await display.disconnect()


class IceServerTests(TestCase):
    def test_local_uses_no_outside_servers(self):
        self.assertEqual(show.ice_servers("local"), [])

    @override_settings(WEBRTC_STUN_URLS=["stun:stun.example:3478"], WEBRTC_TURN_URLS=[])
    def test_internet_uses_stun(self):
        self.assertEqual(show.ice_servers("internet"), [{"urls": ["stun:stun.example:3478"]}])

    @override_settings(WEBRTC_STUN_URLS=["stun:s.example"], WEBRTC_TURN_URLS=["turn:t.example:3478"],
                       WEBRTC_TURN_USERNAME="u", WEBRTC_TURN_CREDENTIAL="p")
    def test_internet_adds_turn_when_configured(self):
        self.assertEqual(show.ice_servers("internet")[1],
                         {"urls": ["turn:t.example:3478"], "username": "u", "credential": "p"})


class RoutingTests(TestCase):
    def test_service_worker_served_from_root(self):
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as dist, self.settings(FRONTEND_DIST_DIR=Path(dist)):
            self.assertEqual(self.client.get("/sw.js").status_code, 404)
            (Path(dist) / "sw.js").write_text("self.addEventListener('fetch', () => {})")
            response = self.client.get("/sw.js")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response["Content-Type"], "text/javascript")
            self.assertEqual(response["Cache-Control"], "no-cache")

    def test_asgi_application_imports(self):
        self.assertIsNotNone(application)

    def test_spa_served_for_frontend_routes(self):
        for path in ["/", "/host/", "/client/3/"]:
            self.assertIn(self.client.get(path).status_code, (200, 503))
        self.assertEqual(self.client.get("/api/nope/").status_code, 404)

    def test_admin_and_api_without_trailing_slash_redirect(self):
        self.assertRedirects(self.client.get("/admin"), "/admin/", status_code=301, fetch_redirect_response=False)
        self.assertEqual(self.client.get("/api").status_code, 404)
        self.assertIn(self.client.get("/administrator-notes").status_code, (200, 503))  # still a React page
