import json

from asgiref.sync import sync_to_async
from channels.testing import WebsocketCommunicator
from django.contrib.auth.models import AnonymousUser, User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, TransactionTestCase

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
        self.assertEqual(displays[0], {"display_number": 1, "name": "Display 1", "play_sound": False})
        self.assertEqual(displays[1], {"display_number": 2, "name": "Fitzgerald", "play_sound": True})

    def test_update_display_requires_superuser(self):
        url = "/api/displays/3/"
        self.assertEqual(self.put_json(url, {"name": "Lobby", "play_sound": True}).status_code, 401)
        self.client.force_login(self.user)
        self.assertEqual(self.put_json(url, {"name": "Lobby", "play_sound": True}).status_code, 403)
        self.client.force_login(self.admin)
        self.assertEqual(self.put_json(url, {"name": "", "play_sound": True}).status_code, 400)
        self.assertEqual(self.put_json(url, {"name": "Lobby", "play_sound": "True"}).status_code, 400)
        self.assertEqual(self.put_json("/api/displays/7/", {"name": "x", "play_sound": True}).status_code, 404)
        self.assertEqual(self.put_json(url, {"name": "Lobby", "play_sound": True}).status_code, 200)
        self.assertEqual(NewDisplayConfig.objects.get(display_number=3).name, "Lobby")

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

    def test_state_with_no_scenes(self):
        state = show.get_state()
        self.assertEqual((state["total"], state["current"], state["est"]), (0, "", -1))


class ConsumerTests(TransactionTestCase):
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
        await host.receive_json_from()
        await display.receive_json_from()

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
        await host.disconnect()


class RoutingTests(TestCase):
    def test_asgi_application_imports(self):
        self.assertIsNotNone(application)

    def test_spa_served_for_frontend_routes(self):
        for path in ["/", "/host/", "/client/3/"]:
            self.assertIn(self.client.get(path).status_code, (200, 503))
        self.assertEqual(self.client.get("/api/nope/").status_code, 404)
