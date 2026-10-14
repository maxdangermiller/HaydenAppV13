# Hayden Auditorium

Show control for the Hayden Auditorium: a host advances through the show's scenes and up to six
backstage displays show the current, next and following scene with a countdown.

- **Backend:** Django + Channels (`App/`, `main/`). JSON API under `/api/`, WebSocket at `/ws/show/`.
- **Frontend:** React + Vite (`frontend/`). Built into `frontend/dist/` and served by Django for every page URL.

## Running a show (local network, no internet needed)

Run the server on the host computer, the one with the webcam:

```sh
./serve.sh --setup   # first time, or after pulling changes (needs internet)
./serve.sh           # every show after that
```

It prints two addresses: open the **host page on this computer** (`http://localhost:8000/host`), and
open the displays address on each display computer. Browsers only allow camera access on
`localhost` or HTTPS pages, which is why the host page has to run on the server computer. On macOS,
allow incoming connections for Python if the firewall asks.

Create an admin login once with `.venv/bin/python manage.py createsuperuser`.

### Live video

On the host page, **Camera → Start video** streams the webcam to every open display. Video goes
directly from the host's browser to each display over the local network (WebRTC); the server only
relays a few small setup messages. The host computer uploads one copy per display: about
2.5 Mbps each at 720p, 4.5 Mbps at 1080p. Use a wired connection for 1080p to several displays.

While live, a preview floats in the bottom-left corner of the host page; click its bar to minimize
it. Camera, resolution, network and frame rate options are under **Video settings**.

Each display has its own video layout (scene info over the video, video above the info, or no
video) and frame rate limit: click the display on the host page to change them. "No video" displays
never connect to the stream, so they cost the host no bandwidth.

**Frame rate.** Video is an extra; the scene info uses its own connection and never waits on it.
To keep weaker displays smooth:

- **Automatic** (on by default): the host watches each display's connection separately. Sustained
  packet loss, high latency, too little bandwidth, or this computer struggling to encode steps that
  display down 30 → 15 → 10 → 5 fps, and only to 2 fps if it is still struggling at 5. After about
  20 seconds of a clean connection it tries the next step up. Lower steps also cut the bitrate, and at
  5 fps and below the picture is downscaled too.
- **Per display:** click a display on the host page and set a frame rate limit, e.g. 5 fps for a
  display on Wi-Fi. Saved on the server.
- **Overall:** "Max frame rate" in Video settings caps every display.

Video settings shows each display's actual frame rate, bitrate, and why it is limited.

The network setting (change it while video is stopped) picks how displays reach the host:

- **Local only** (default): video stays on the venue network and no outside servers are involved.
  Works with `serve.sh` or the Heroku site, as long as the displays are on the same network as the host.
- **Internet**: for displays on other networks. Browsers use public STUN servers to find a direct
  route, so video still doesn't pass through our server. Some networks (mobile hotspots, strict
  firewalls) block direct connections; for those, add a TURN server from a provider such as
  Metered or Cloudflare, which relays the video:

  ```sh
  heroku config:set WEBRTC_TURN_URLS=turn:turn.example.com:3478 \
    WEBRTC_TURN_USERNAME=<username> WEBRTC_TURN_CREDENTIAL=<password>
  ```

  `WEBRTC_STUN_URLS` overrides the default Google STUN servers. TURN bandwidth is billed by the
  provider; each relayed display uses the same upload as above.

## Installing as an app (PWA)

On the https:// website, Chrome and Edge show an **Install app** button on the Join and display
picker pages (or use the install icon in the address bar). On iPhone and iPad, use Share → Add to
Home Screen. The installed app has shortcuts to Host and Displays.

The service worker (`frontend/public/sw.js`, served at `/sw.js`) caches the app's code so it loads
quickly, and so a display that reloads while the server is unreachable shows its Offline screen and
reconnects on its own instead of a browser error. Live data (`/api/`, `/admin/`, the WebSocket) is
never cached, and pages are always fetched fresh first, so deploys show up on the next load.

Browsers only allow this on secure pages: the Heroku site, or `localhost`. Displays opening a local
`serve.sh` server by IP address work as before, just without install or offline caching.

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

## Deploying to Heroku (optional)

This is how people reach the website. Live video works here too: the site is HTTPS, so the
camera works on any host computer, and the network setting above decides who can receive video.

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
