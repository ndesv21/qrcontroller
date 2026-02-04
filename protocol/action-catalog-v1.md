# Universal Action Catalog v1

Core navigation:
- `NAV_UP`
- `NAV_DOWN`
- `NAV_LEFT`
- `NAV_RIGHT`
- `SELECT`
- `BACK`
- `PLAY_PAUSE`

Trivia/game helpers:
- `ANSWER_A`
- `ANSWER_B`
- `ANSWER_C`
- `VOICE_TEXT` (`payload.text`)

Compatibility rule:
- New actions can be added in v1.
- Existing action names/meanings must not change.
- If meaning must change, add a new action name and preserve old behavior in adapters.
