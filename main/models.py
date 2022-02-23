from django.db import models
from django.contrib.auth.models import User


class DisplayConfig(models.Model):
    display_one_name = models.CharField(max_length=50)
    display_one_play_sound = models.BooleanField()

    display_two_name = models.CharField(max_length=50)
    display_two_play_sound = models.BooleanField()

    display_three_name = models.CharField(max_length=50)
    display_three_play_sound = models.BooleanField()

    display_four_name = models.CharField(max_length=50)
    display_four_play_sound = models.BooleanField()

    display_five_name = models.CharField(max_length=50)
    display_five_play_sound = models.BooleanField()

    display_six_name = models.CharField(max_length=50)
    display_six_play_sound = models.BooleanField()


class RFIDData(models.Model):
    RFID = models.CharField(max_length=50)
    IsSuperUserKey = models.BooleanField(default=False)


class SceneList(models.Model):
    sceneList = models.CharField(max_length=600)

    def getList(self):
        out = []
        test = self.sceneList
        for word in test.strip("[", "").strip("]", "").split(","):
            out.append(word)
        return out
