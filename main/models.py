from django.db import models
from django.utils import timezone


DISPLAY_COUNT = 6

# Frame rates a display's live video can be limited to (see the host's camera controls).
VIDEO_FPS_CHOICES = (30, 15, 10, 5, 2)
VIDEO_LAYOUT_CHOICES = (
    ("overlay", "Scene info over the video"),
    ("split", "Video above the scene info"),
    ("none", "No video"),
)


class NewDisplayConfig(models.Model):
    name = models.CharField(max_length=50)
    play_sound = models.BooleanField()
    display_number = models.IntegerField(unique=True)
    max_video_fps = models.IntegerField(
        default=30, choices=[(fps, f"{fps} fps") for fps in VIDEO_FPS_CHOICES],
        help_text="Upper limit for live video on this display, e.g. lower for displays on Wi-Fi",
    )
    video_layout = models.CharField(max_length=10, default="overlay", choices=VIDEO_LAYOUT_CHOICES)

    def __str__(self) -> str:
        return f"Display {self.display_number} - {self.name}"

    def __repr__(self) -> str:
        return self.__str__()


class RFIDData(models.Model):
    RFID = models.CharField(max_length=50)
    IsSuperUserKey = models.BooleanField(default=False)

    def __str__(self) -> str:
        return f"RFID Data - {self.RFID}"


class Scene(models.Model):
    index = models.IntegerField(primary_key=True)
    name = models.CharField(max_length=100)
    est_time = models.IntegerField(default=120, help_text="Estimated time in seconds")

    def __str__(self):
        return self.name


class ShowState(models.Model):
    """Single-row table holding the live position in the show."""

    current_index = models.IntegerField(default=0)
    changed_at = models.DateTimeField(default=timezone.now)

    @classmethod
    def load(cls):
        state, _ = cls.objects.get_or_create(pk=1)
        return state

    def __str__(self):
        return f"Show at scene {self.current_index}"
