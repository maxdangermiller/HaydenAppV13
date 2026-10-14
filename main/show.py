"""Show state and display config helpers shared by the HTTP API and the WebSocket consumer."""
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
from django.utils import timezone

from .models import DISPLAY_COUNT, NewDisplayConfig, Scene, ShowState


SHOW_GROUP = "show"
HOSTS_GROUP = "hosts"


def get_displays():
    """All display slots in order, with defaults filled in for unconfigured ones."""
    configs = {c.display_number: c for c in NewDisplayConfig.objects.all()}
    displays = []
    for number in range(1, DISPLAY_COUNT + 1):
        config = configs.get(number)
        displays.append({
            "display_number": number,
            "name": config.name if config else f"Display {number}",
            "play_sound": config.play_sound if config else False,
        })
    return displays


def get_state():
    """Snapshot of the show sent to every client: the current/next/after scenes and timing."""
    state = ShowState.load()
    scenes = list(Scene.objects.order_by("index"))
    total = len(scenes)
    index = min(max(state.current_index, 0), max(total - 1, 0))

    def scene_name(i):
        return scenes[i].name if i < total else ""

    return {
        "index": index,
        "total": total,
        "current": scene_name(index),
        "next": scene_name(index + 1),
        "after": scene_name(index + 2),
        "est": scenes[index].est_time if index < total else -1,
        # Elapsed rather than a timestamp so clients don't depend on their clock matching the server's.
        "elapsed": int((timezone.now() - state.changed_at).total_seconds()),
    }


def set_index(index):
    """Move the show to `index` (clamped to the scene list). Returns the new state."""
    with transaction.atomic():
        state = ShowState.objects.select_for_update().get(pk=ShowState.load().pk)
        total = Scene.objects.count()
        index = min(max(index, 0), max(total - 1, 0))
        if index != state.current_index:
            state.current_index = index
            state.changed_at = timezone.now()
            state.save()
    return get_state()


def step(delta):
    return set_index(ShowState.load().current_index + delta)


def broadcast(group, message):
    async_to_sync(get_channel_layer().group_send)(group, {"type": "relay", "message": message})


def broadcast_state():
    broadcast(SHOW_GROUP, {"type": "state", **get_state()})


def broadcast_displays():
    broadcast(SHOW_GROUP, {"type": "displays", "displays": get_displays()})
