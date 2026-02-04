# Platform Adapter Notes

Universal protocol events should be translated by each platform adapter.

## Roku Adapter (Polling)

Roku can consume hub events with HTTP polling:
- `GET /api/v1/sessions/:id/events/poll?role=host&token=HOST_TOKEN&after=SEQ`

For TV pairing UX, Roku can render QR as PNG:
- `GET /api/v1/sessions/:id/qr?hostToken=HOST_TOKEN&width=320&format=png`

Then map canonical actions into Roku logic.

Example mappings:
- `NAV_UP` -> move focus up
- `SELECT` -> `onKeyEvent("OK", true)` equivalent
- `ANSWER_A` -> select index 0
- `VOICE_TEXT` -> forward payload text to existing `/voice/command` endpoint

## Web/Samsung/LG Adapter (WebSocket)

These clients can connect directly:
- `wss://hub.yourdomain.com/ws?sessionId=...&role=host&token=...`

Handle incoming `event` envelopes and apply actions directly in frontend code.

## Important

Keep adapters thin. The hub and controller protocol stay shared; adapters only map actions to runtime-specific behavior.
