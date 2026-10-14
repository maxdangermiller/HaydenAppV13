#!/usr/bin/env bash
# Run the show server on this computer for the local network. No internet needed once set up.
#
#   ./serve.sh            start the server
#   ./serve.sh --setup    install dependencies and build the frontend first (needs internet)
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8000}"

if [[ "${1:-}" == "--setup" || ! -d .venv || ! -d frontend/dist ]]; then
  echo "Installing dependencies and building the frontend..."
  [[ -d .venv ]] || python3 -m venv .venv
  .venv/bin/pip install --quiet -r requirements.txt
  npm --prefix frontend ci --silent
  npm --prefix frontend run build --silent
fi

export DJANGO_DEBUG=false
.venv/bin/python manage.py migrate --noinput
.venv/bin/python manage.py collectstatic --noinput > /dev/null

IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || true)"
echo
echo "  Host page (open on THIS computer so the camera works): http://localhost:$PORT/host"
echo "  Displays (on other computers):                         http://${IP:-<this-computer-ip>}:$PORT/clients"
echo

exec .venv/bin/daphne App.asgi:application --bind 0.0.0.0 --port "$PORT"
