# chat/urls.py
from django.urls import path

from . import views

urlpatterns = [
    path('join/', views.join, name='join'),
    path('host/', views.host, name='host'),
    path('client/<int:displayID>/', views.client, name='client'),
    path('clients/', views.clients, name='clients'),
    path('', views.clients, name='clients'),
]

