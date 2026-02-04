# QR Controller (Universal)

This project creates a universal phone controller that pairs through QR and sends canonical actions to game clients.

One controller flow works across:
- Roku (polling adapter)
- Web apps (WebSocket adapter)
- Samsung/LG TV web runtimes (WebSocket adapter)

## Recommended Hosting (Production)

Use a split deployment:
- `apps/controller-web/public` -> Vercel (static CDN delivery)
- `apps/hub` -> stateful Node host (Railway/Fly/Render/ECS)

Why split:
- Vercel is great for static pages.
- Realtime session routing needs a stateful process.

## Project Layout

- `apps/hub/src/server.js` - session hub (REST + WebSocket + QR SVG)
- `apps/controller-web/public/join.html` - phone controller page
- `apps/controller-web/public/controller-v1.js` - controller runtime
- `protocol/` - protocol and action contracts
- `AGENTS.md` - guardrails for future AI agents

## Local Run

1) Start the hub:

```bash
cd apps/hub
npm install
npm run dev
```

2) Serve controller static files (any static server), for example:

```bash
cd apps/controller-web/public
python3 -m http.server 3000
```

3) Optional hub env vars:

```bash
export CONTROLLER_BASE_URL="http://localhost:3000"
export HUB_PUBLIC_BASE_URL="http://localhost:8080"
export SESSION_STORE_FILE="/tmp/qrcontroller-sessions.json"
```

`SESSION_STORE_FILE` keeps sessions on disk so restart/upgrade reconnects are less disruptive.

## Session Flow

1) TV/game client creates a session:

```bash
curl -s http://localhost:8080/api/v1/sessions   -H 'content-type: application/json'   -d '{"platform":"roku","capabilities":["polling","voice_text"]}'
```

2) Response includes:
- `session.links.joinUrl` (render this as QR)
- `session.tokens.hostToken` (host auth)
- `session.links.wsUrl` and `session.links.pollUrl`

3) Phone opens the QR link and joins.

4) Controller actions flow phone -> hub -> platform adapter.

## Backward Compatibility Rules

- Keep `/join/:sessionId` route stable.
- Keep `controller-v1.js` and `controller-v1.css` available once links exist.
- Add actions as new optional additions; do not rename/remove v1 actions.
- Keep `/api/v1/*` stable; introduce `/api/v2/*` for breaking changes.

Read `AGENTS.md` and `docs/PURPOSE_AND_PRECAUTIONS.md` before major changes.
