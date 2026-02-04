# Purpose and Precautions

## Purpose

This repository is for one specific objective:

**A universal QR-based phone controller platform that can control Roku and non-Roku game clients through one shared protocol.**

The goal is to avoid rebuilding controller logic for each TV/runtime.

## Precautions

1. **Protocol first, platform adapters second**
   - Keep controller actions canonical (`NAV_UP`, `SELECT`, `ANSWER_A`, etc.).
   - Translate per platform in adapters, not in shared UI.

2. **Backward compatibility first**
   - Existing QR links and active platform integrations must keep working.
   - Preserve v1 routes/assets/actions as long as integrations depend on them.

3. **Versioning discipline**
   - Keep v1 stable (`/api/v1`, `controller-v1.js`).
   - Add v2 in parallel for any incompatible change.

4. **Hosting split**
   - Use Vercel for static controller frontend.
   - Use a stateful host for session hub/WebSocket routing.

5. **Do not couple to one game**
   - This is a control transport layer, not a game rules engine.
   - Game-specific behavior belongs in adapters.

## AI Agent Reminder

If you are an AI agent modifying this project: preserve compatibility and universality first. Do not optimize for one platform at the expense of the shared protocol.
