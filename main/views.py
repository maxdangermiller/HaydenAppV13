from io import TextIOWrapper
import json
from django.http import HttpResponseRedirect
from django.shortcuts import render
from django.contrib.auth.decorators import login_required, user_passes_test
from .models import *
from .forms import UploadFileForm
import csv


@login_required
def join(request):
    return render(request, 'main/join.html')


@user_passes_test(lambda u: u.is_superuser)
def host(request):
    configs = NewDisplayConfig.objects.all().values('name', 'play_sound', 'display_number')

    context = {
        'configs': configs,
    }

    return render(request, 'main/host.html', context)


def clients(request):
    configs = NewDisplayConfig.objects.all().order_by('display_number').values('name', 'play_sound', 'display_number')

    return render(request, 'main/clients.html', { 'configs': configs})


def client(request, displayID):
    if displayID < 1 or displayID > 6:
        return render(request, 'main/404.html', status=404)
    
    config = NewDisplayConfig.objects.filter(display_number=displayID).first()

    if not config:
        return render(request, 'main/404.html', status=404)
    
    displayName = config.name
    audioEnable = config.play_sound
    
    return render(request, 'main/client.html', {'displayID': displayID, 'displayName': displayName, 'audioEnable': audioEnable})


@login_required
def upload_scene_csv_file(request):
    if request.method == "POST":
        csv_file = request.FILES.get('csv_file')

        print(csv_file)
        handle_csv_file(csv_file)

        # if request.FILES['file'].name.endswith('.csv'):
        #     handle_csv_file(request.FILES["file"])
        return HttpResponseRedirect("/success/")
        
    
    return render(request, "main/upload.html", {})


def handle_csv_file(csv_file):
    decoded_file = TextIOWrapper(csv_file.file, encoding='utf-8')
    print(decoded_file)
    reader = csv.DictReader(decoded_file)

    Scene.objects.all().delete()  # Clear existing scene
    
    i = 0
    for row in reader:
        scene = Scene(
            index = i,
            name=row['name'],
            est_time=int(row['est_time'])
        )
        print(f"Creating scene: {scene.name} with estimated time {scene.est_time}")
        scene.save()
        i += 1
        
    decoded_file.close()

def upload_success(request):
    return render(request, "main/success.html")