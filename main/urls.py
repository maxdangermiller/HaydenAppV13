from django.urls import path

from . import views

urlpatterns = [
    path("auth/me/", views.me, name="api-me"),
    path("auth/login/", views.login_view, name="api-login"),
    path("auth/logout/", views.logout_view, name="api-logout"),

    path("displays/", views.display_list, name="api-displays"),
    path("displays/<int:number>/", views.display_detail, name="api-display"),
    path("rfid/verify/", views.verify_rfid, name="api-rfid-verify"),

    path("scenes/", views.scene_list, name="api-scenes"),
    path("scenes/upload/", views.upload_scenes, name="api-scenes-upload"),
    path("scenes/<int:index>/", views.scene_detail, name="api-scene"),
]
