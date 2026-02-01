from django.db import models
from django.contrib.auth.models import User
    

class NewDisplayConfig(models.Model):
    name = models.CharField(max_length=50)
    play_sound = models.BooleanField()
    display_number = models.IntegerField(unique=True)

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