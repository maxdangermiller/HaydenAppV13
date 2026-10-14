"""Django settings for the Hayden Auditorium show control app."""
import os
from pathlib import Path

import dj_database_url


IS_HEROKU_APP = "DYNO" in os.environ and "CI" not in os.environ

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIST_DIR = BASE_DIR / "frontend" / "dist"

# Set DJANGO_SECRET_KEY in production; the fallback is only fit for local development.
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "ap*z1i+bk@wv-1_^m4c)7nsazm$du49@umno8u4!=6^nl_$2-x")

DEBUG = os.environ.get("DJANGO_DEBUG", "false" if IS_HEROKU_APP else "true").lower() == "true"

if IS_HEROKU_APP:
    ALLOWED_HOSTS = ["*"]
    CSRF_TRUSTED_ORIGINS = [
        "https://hayden-auditorium-8834454dae91.herokuapp.com",
        "https://www.hayden-auditorium-8834454dae91.herokuapp.com",
    ]
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
else:
    # Run on the venue's local network (see serve.sh): displays reach this computer by whatever
    # IP or hostname it has there, so accept any host name.
    ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "*").split(",")
    # Browsers ignore this header on plain-HTTP network addresses and log a warning on every page.
    SECURE_CROSS_ORIGIN_OPENER_POLICY = None
    # The Vite dev server proxies to Django from a different port.
    CSRF_TRUSTED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

INSTALLED_APPS = [
    "daphne",
    "channels",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "main",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "App.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "App.wsgi.application"
ASGI_APPLICATION = "App.asgi.application"

# In-memory works for a single dyno. To run more than one web process, switch to Redis:
# {"BACKEND": "channels_redis.core.RedisChannelLayer", "CONFIG": {"hosts": [os.environ["REDIS_URL"]]}}
CHANNEL_LAYERS = {
    "default": {"BACKEND": "channels.layers.InMemoryChannelLayer"},
}

if IS_HEROKU_APP:
    DATABASES = {
        "default": dj_database_url.config(
            env="DATABASE_URL",
            conn_max_age=600,
            conn_health_checks=True,
            ssl_require=True,
        ),
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# The React build is served as static files; its index.html is returned by main.views.spa.
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [FRONTEND_DIST_DIR] if FRONTEND_DIST_DIR.exists() else []
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# Live video in "internet" mode. STUN lets browsers on different networks find a direct route to
# each other (the video still never touches this server). Some networks block direct connections;
# for those, set a TURN server from a provider, which relays the video instead.
WEBRTC_STUN_URLS = [
    url for url in os.environ.get(
        "WEBRTC_STUN_URLS", "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302"
    ).split(",") if url
]
WEBRTC_TURN_URLS = [url for url in os.environ.get("WEBRTC_TURN_URLS", "").split(",") if url]
WEBRTC_TURN_USERNAME = os.environ.get("WEBRTC_TURN_USERNAME", "")
WEBRTC_TURN_CREDENTIAL = os.environ.get("WEBRTC_TURN_CREDENTIAL", "")
