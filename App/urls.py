from django.contrib import admin
from django.urls import include, path, re_path

from main.views import service_worker, spa

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("main.urls")),
    path("sw.js", service_worker, name="service-worker"),
    # Everything else is a page of the React app.
    re_path(r"^(?!api/|admin/|static/|ws/).*$", spa, name="spa"),
]
