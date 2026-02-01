# chat/urls.py
from django.urls import path

from . import views

urlpatterns = [
    path('join/', views.join, name='join'),
    path('host/', views.host, name='host'),
    path('client/<int:displayID>/', views.client, name='client'),
    path('clients/', views.clients, name='clients'),
    path('', views.clients, name='clients'),

    path('upload_scene_csv/', views.upload_scene_csv_file, name='upload_scene_csv'),
    path('success/', views.upload_success, name='upload_success'),  # New success URL
]

