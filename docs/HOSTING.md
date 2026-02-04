# Hosting Plan (Vercel + Realtime Hub)

## Recommended Production Topology

- `controller.yourdomain.com` (Vercel)
  - Hosts `apps/controller-web/public`
  - Serves stable `/join/:sessionId` links globally

- `hub.yourdomain.com` (stateful Node host)
  - Runs `apps/hub/src/server.js`
  - Owns sessions, WS routing, polling fallback, QR SVG endpoint

## Why This Split

- Vercel is ideal for static edge delivery.
- Realtime session hubs need stateful runtime behavior.

## No-Break Upgrade Strategy

1. Keep old static controller assets deployed (`controller-v1.js/css`).
2. Keep `/api/v1/*` stable while introducing `/api/v2/*` only for breakage.
3. Use rolling/blue-green deploy with graceful drain.
4. Use session persistence:
   - Single instance: set `SESSION_STORE_FILE`.
   - Multi instance: use shared Redis/session store.

## Environment Variables (Hub)

- `PORT` (default: `8080`)
- `CONTROLLER_BASE_URL` (example: `https://controller.yourdomain.com`)
- `HUB_PUBLIC_BASE_URL` (example: `https://hub.yourdomain.com`)
- `CORS_ORIGINS` (comma-separated origins or `*`)
- `SESSION_TTL_MS` (default: `7200000`)
- `EVENT_HISTORY_LIMIT` (default: `300`)
- `SESSION_STORE_FILE` (optional JSON store path for restart continuity)
