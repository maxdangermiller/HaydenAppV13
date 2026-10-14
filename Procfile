release: python manage.py migrate --noinput
web: daphne App.asgi:application --port $PORT --bind 0.0.0.0 -v2
