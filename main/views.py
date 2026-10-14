import csv
import json
from functools import wraps
from io import TextIOWrapper

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.db import transaction
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from . import show
from .models import DISPLAY_COUNT, NewDisplayConfig, RFIDData, Scene


def error(message, status=400):
    return JsonResponse({"error": message}, status=status)


def parse_json(request):
    try:
        data = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def login_required_json(view):
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return error("Login required.", status=401)
        return view(request, *args, **kwargs)
    return wrapper


def superuser_required_json(view):
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return error("Login required.", status=401)
        if not request.user.is_superuser:
            return error("Admin access required.", status=403)
        return view(request, *args, **kwargs)
    return wrapper


def user_payload(user):
    if not user.is_authenticated:
        return {"authenticated": False}
    return {"authenticated": True, "username": user.get_username(), "is_superuser": user.is_superuser}


# Auth

@require_GET
@ensure_csrf_cookie
def me(request):
    return JsonResponse(user_payload(request.user))


@require_POST
def login_view(request):
    data = parse_json(request)
    if data is None:
        return error("Invalid JSON body.")
    user = authenticate(request, username=data.get("username", ""), password=data.get("password", ""))
    if user is None:
        return error("Incorrect username or password.", status=401)
    login(request, user)
    return JsonResponse(user_payload(user))


@require_POST
def logout_view(request):
    logout(request)
    return JsonResponse(user_payload(request.user))


# Displays

@require_GET
def display_list(request):
    return JsonResponse({"displays": show.get_displays()})


@require_http_methods(["PUT"])
@superuser_required_json
def display_detail(request, number):
    if not 1 <= number <= DISPLAY_COUNT:
        return error("Display not found.", status=404)
    data = parse_json(request)
    if data is None:
        return error("Invalid JSON body.")

    name = str(data.get("name", "")).strip()
    if not name or len(name) > 50:
        return error("Name must be between 1 and 50 characters.")
    if not isinstance(data.get("play_sound"), bool):
        return error("play_sound must be true or false.")

    NewDisplayConfig.objects.update_or_create(
        display_number=number, defaults={"name": name, "play_sound": data["play_sound"]},
    )
    show.broadcast_displays()
    return JsonResponse({"displays": show.get_displays()})


@require_POST
def verify_rfid(request):
    data = parse_json(request)
    if data is None:
        return error("Invalid JSON body.")
    code = str(data.get("code", "")).strip()
    return JsonResponse({"valid": bool(code) and RFIDData.objects.filter(RFID=code).exists()})


# Scenes

@require_GET
def scene_list(request):
    scenes = Scene.objects.order_by("index").values("index", "name", "est_time")
    return JsonResponse({"scenes": list(scenes)})


@require_http_methods(["PATCH"])
@superuser_required_json
def scene_detail(request, index):
    scene = Scene.objects.filter(index=index).first()
    if scene is None:
        return error("Scene not found.", status=404)
    data = parse_json(request)
    if data is None:
        return error("Invalid JSON body.")

    est_time = data.get("est_time")
    if not isinstance(est_time, int) or isinstance(est_time, bool) or est_time < 0:
        return error("est_time must be a non-negative whole number of seconds.")
    scene.est_time = est_time
    scene.save()
    return JsonResponse({"index": scene.index, "name": scene.name, "est_time": scene.est_time})


@require_POST
@login_required_json
def upload_scenes(request):
    """Replace the whole show with the rows of an uploaded `name,est_time` CSV."""
    csv_file = request.FILES.get("csv_file")
    if csv_file is None:
        return error("No file uploaded.")

    try:
        # utf-8-sig strips the byte-order mark Excel adds to CSV exports.
        reader = csv.DictReader(TextIOWrapper(csv_file.file, encoding="utf-8-sig"))
        missing = {"name", "est_time"} - set(reader.fieldnames or [])
        if missing:
            return error(f"CSV is missing column(s): {', '.join(sorted(missing))}.")

        scenes = []
        for line, row in enumerate(reader, start=2):
            name = (row["name"] or "").strip()
            if not name:
                continue
            try:
                est_time = int((row["est_time"] or "0").strip())
            except ValueError:
                return error(f"Line {line}: est_time {row['est_time']!r} is not a whole number.")
            scenes.append(Scene(index=len(scenes), name=name[:100], est_time=est_time))
    except UnicodeDecodeError:
        return error("File must be UTF-8 encoded text.")

    if not scenes:
        return error("CSV contains no scenes.")

    with transaction.atomic():
        Scene.objects.all().delete()
        Scene.objects.bulk_create(scenes)
    show.set_index(0)
    show.broadcast_state()
    return JsonResponse({"count": len(scenes)})


# Frontend

def spa(request):
    """Serve the built React app for every non-API URL; React Router takes it from there."""
    index_file = settings.FRONTEND_DIST_DIR / "index.html"
    if not index_file.exists():
        return HttpResponse(
            "Frontend not built. Run `npm run build` in frontend/, or use the Vite dev server (`npm run dev`).",
            status=503, content_type="text/plain",
        )
    return HttpResponse(index_file.read_text(encoding="utf-8"))
