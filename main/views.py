from django.shortcuts import render
from django.contrib.auth.decorators import login_required, user_passes_test
from .models import *


@login_required
def join(request):
    return render(request, 'main/join.html')


@user_passes_test(lambda u: u.is_superuser)
def host(request):
    config = DisplayConfig.objects.get(id=1)
    return render(request, 'main/host.html', {'config': config})


def clients(request):
    config = DisplayConfig.objects.get(id=1)
    return render(request, 'main/clients.html', {'config': config})


def client(request, displayID):
    config = DisplayConfig.objects.get(id=1)
    if displayID == 1:
        displayName = config.display_one_name
        audioEnable = config.display_one_play_sound
    elif displayID == 2:
        displayName = config.display_two_name
        audioEnable = config.display_two_play_sound
    elif displayID == 3:
        displayName = config.display_three_name
        audioEnable = config.display_three_play_sound
    elif displayID == 4:
        displayName = config.display_four_name
        audioEnable = config.display_four_play_sound
    elif displayID == 5:
        displayName = config.display_five_name
        audioEnable = config.display_five_play_sound
    elif displayID == 6:
        displayName = config.display_six_name
        audioEnable = config.display_six_play_sound
    else:
        displayName = ""
        audioEnable = False
    return render(request, 'main/client.html', {'displayID': displayID, 'displayName': displayName, 'audioEnable': audioEnable})
