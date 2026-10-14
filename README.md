# Hayden Auditorium

Show control for the Hayden Auditorium: a host advances through the show's scenes and up to six
backstage displays show the current, next and following scene with a countdown.

- **Backend:** Django + Channels (`App/`, `main/`). JSON API under `/api/`, WebSocket at `/ws/show/`.
- **Frontend:** React + Vite (`frontend/`). Built into `frontend/dist/` and served by Django for every page URL.

## Local development

```sh
# Backend (http://127.0.0.1:8000)
python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python manage.py migrate
.venv/bin/python manage.py createsuperuser
.venv/bin/python manage.py runserver

# Frontend with hot reload (http://localhost:5173, proxies API/WebSocket calls to Django)
cd frontend && npm install && npm run dev
```

To serve everything from Django alone, run `npm run build` in `frontend/` and open http://127.0.0.1:8000.

Run the backend tests with `.venv/bin/python manage.py test main`.

## Pages

| URL | Who | What |
| --- | --- | --- |
| `/`, `/clients` | anyone | Pick which display this screen is |
| `/client/<1-6>` | anyone | Kiosk display. Press **C** and scan an RFID card for admin options |
| `/login` | — | Sign in |
| `/join` | signed in | Choose host, client or upload |
| `/host` | superuser | Advance the show, see display status, rename displays, record scene times |
| `/upload` | signed in | Upload a show CSV (`name,est_time` columns, time in seconds) |
| `/admin` | staff | Django admin (RFID cards, users, etc.) |

## API

| Method | Path | Auth | |
| --- | --- | --- | --- |
| GET | `/api/auth/me/` | | Current user; also sets the CSRF cookie |
| POST | `/api/auth/login/` | | `{username, password}` |
| POST | `/api/auth/logout/` | | |
| GET | `/api/displays/` | | All six displays |
| PUT | `/api/displays/<n>/` | superuser | `{name, play_sound}` |
| POST | `/api/rfid/verify/` | | `{code}` → `{valid}` |
| GET | `/api/scenes/` | | Scene list |
| PATCH | `/api/scenes/<index>/` | superuser | `{est_time}` |
| POST | `/api/scenes/upload/` | signed in | multipart `csv_file`; replaces the show and resets to scene 1 |

Non-GET requests need the `X-CSRFToken` header (the frontend's `api()` helper handles this).

### WebSocket `/ws/show/`

The server owns the show position, so displays stay correct even with no host connected.
Connect with `?role=host` (superusers) or `?display=<n>`; see `main/consumers.py` for the message format.

## Deploying to Heroku

The app needs both the Node and Python buildpacks, Node first so the frontend is built before
`collectstatic` runs:

```sh
heroku buildpacks:clear
heroku buildpacks:add heroku/nodejs
heroku buildpacks:add heroku/python
heroku config:set DJANGO_SECRET_KEY=<a long random string>
```

Migrations run automatically in the `release` phase (see `Procfile`). `DEBUG` is off on Heroku
unless `DJANGO_DEBUG=true` is set.
