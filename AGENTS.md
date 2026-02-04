# AGENTS: Mission and Guardrails

## Mission
Build and evolve a **universal QR phone controller** that works across Roku, web, Samsung, and LG clients without per-platform controller rewrites.

## Non-Negotiables

1. Keep the canonical action protocol platform-agnostic.
2. Keep the stable join path: `/join/:sessionId`.
3. Keep API v1 stable at `/api/v1/*`.
4. Do not hardcode Roku-only behavior into the shared controller UI.
5. Keep old controller assets (`controller-v1.js`, `controller-v1.css`) available after upgrades.

## Upgrade Discipline

- For breaking protocol/API changes, add v2 side-by-side.
- Never repurpose an existing action name with new meaning.
- Add fields only as optional in v1 payloads.
- Preserve current query params in join links (`t`, `hub`, `cv`).

## Deployment Discipline

- Static controller can live on Vercel.
- Realtime hub must run on a stateful service.
- Use rolling/blue-green with connection draining.
- If introducing Redis/session store, keep the current wire protocol unchanged.

## What To Avoid

- Tying action names to one platform language/runtime.
- Embedding game-specific business rules in the controller.
- Removing v1 endpoints/assets without a migration window.
