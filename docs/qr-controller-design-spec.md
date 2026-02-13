# QR Controller Design + Flow Spec (Source of Truth)

Last updated: 2026-02-11
Scope: `apps/controller-web/public/*` for the phone web controller UI used by Roku flow first.

## 1) Asset Contract

Use CloudFront assets under:

- `https://d3tswg7dtbmd2x.cloudfront.net/qr/`

Required files:

- `bg.png` (all screens background, full-bleed fit/cover)
- `minilogo.png` (top logo)
- `goldbtn.png` (primary button background)
- `whitebtn.png` (secondary/alt button background)
- `mic.png` (idle mic button image)
- `micpressed.png` (pressed/listening mic button image)
- `choice.png` (default answer choice row background)
- `correct.png` (correct answer row background)
- `incorrect.png` (wrong answer row background)
- `alexa.png` (platform icon)
- `fire.png` (platform icon)
- `roku.png` (platform icon)
- `catbg.png` (category option background in web challenge mode)

## 2) Typography + Scale Rules

Reference frame: 402x874 (Figma / iPhone 17 style)

- `minilogo.png`:
  - top offset: `65pt`
  - centered
  - size: `56x22`

Text system (Play family):

- Big title: `42pt`, Play Bold, white
- Medium text: `24pt`, Play Bold, white
- Medium muted: `24pt`, Play Bold, white at 80% opacity
- Large button text / high emphasis dark text: `32pt`, Play Bold, black

All screen copy should map into these styles as closely as possible.

### Pixel constraints (added)

Based on the same 402x874 reference canvas:

- Category card background:
  - `catbg.png` visual aspect: `303x74`
  - scale with containment, preserving this aspect ratio
- Answer alternative buttons:
  - visual size: `340x65`
  - default/correct/incorrect backgrounds must remain identical size when swapped
- Platform tiles (Alexa/Fire/Roku):
  - visual size each: `156.5x116`
  - expected arrangement on phone: wrapped tiles (commonly 2 top, 1 centered below)
- Gold and white buttons:
  - visual target: `317x76`

## 3) Home / Discovery Screen (Main Domain + Disconnect Default)

Intent:

- Default action is connecting to TV by room code.
- Secondary small CTA: Create web challenge.

Visual/layout:

- Background: `bg.png` full-screen.
- Logo on top using global rule above.
- Main section:
  - "Play on:" title
  - Roku logo (`roku.png`) at ~156pt width
  - Prompt: "Enter game code or scan QR"
  - Large numeric input (spaced digits) with numeric keyboard
  - Primary gold Join button (`goldbtn.png`)
  - Footer line:
    - "Looking for something else?"
    - link-like small CTA: "Create a web challenge"

Interaction:

- Join by room code remains primary and first-focus.
- Camera scan still supported, but not visual-primary.

## 4) Sender Flow (TV-connected Host) — Roku First

### 4.1 Mic Screen (during game)

- Center status/title text area for dynamic messages (including wrong press hints).
- Bottom anchored mic image:
  - idle: `mic.png`
  - press/listening: `micpressed.png`
  - glow feedback (blue/green feel) during active hold

### 4.2 Post-game entry (Good game + leaderboard)

- Headline:
  - "Good game!"
  - subline: "You did well with strangers. How smart are your friends?"
- Leaderboard cells:
  - height: `60pt`
  - visible rows: 4
  - row #1 ("YOU"):
    - stroke: `2pt #14ff03`
    - fill: `#1e4a42`
  - other rows:
    - stroke: `1pt #979797`
    - fill: `#0c2669`
  - visual depth:
    - row 3 at ~50% opacity
    - row 4 at ~40% opacity
  - scrollable list, no visible scrollbar/elevator
- Buttons:
  - primary: Test friends (`goldbtn.png`)
  - secondary: Play again (`whitebtn.png`)

### 4.3 Name confirmation modal

- Trigger: tapping Test friends on post-game screen.
- Modal shown on top of blurred/dimmed background.
- Prefill name from known player name if available.
- Name is editable (edit applies to shared JSON challenge identity only).
- Confirm action proceeds to challenge creation.

### 4.4 Share screen(s)

- "Share the link" title.
- Dynamic leaderboard with sender at top.
- Auto-open native share sheet after confirmation if possible.
- Redundancy remains:
  - Copy link button
  - Play again button (TV replay action for sender, not web loop)

### 4.5 Platform CTA screen/modal

- "You can also play on:" with Alexa / Fire / Roku logo buttons.
- Tapping a platform opens an instruction modal:
  - Alexa: say "Alexa, play Trivia Champions"
  - Fire TV: hold mic and say "Alexa, play Trivia Champions"
  - Roku: hold mic and say "Open Trivia Champions"
  - Roku can also mention searching "Trivia Champions"

## 5) Receiver Flow (Invite Link)

### 5.1 Challenge invite screen

- CTA:
  - "Can you beat {name}?"
  - category shown
  - sender leaderboard shown
- primary action: Beat their score
- after tapping "Beat their score", receiver must be able to provide/edit their name before round start

### 5.2 Per-question sequence

For each question:

1. Dollar screen (e.g. `$100`) for ~2s with voice cue.
2. Question + alternatives screen (`choice.png` row backgrounds).
3. On answer:
   - show wrong/correct state using `incorrect.png` and `correct.png`
   - hold for ~0.5s
4. Transition to comparison/result slice for that round:
   - "CORRECT!" / "WRONG!"
   - running score comparison against opponent

### 5.3 End of round sequence

- Final result screen ("YOU WIN"/lose equivalent) + updated leaderboard.
- "Play more" opens platform CTA path (TV platforms + modal instructions).
- "Play here" enters web mini challenge.

## 6) Web Mini Challenge Path (for non-connected users too)

Entry points:

- Home small CTA: Create web challenge
- Receiver "Play here"
- Sender/platform CTA fallback

Flow:

1. Category pick screen
   - category cards use `catbg.png`
2. Dollar screen -> question/choices -> answer reveal loop
3. End screen:
   - "Good game!"
   - leaderboard
   - Test friends as primary
   - Play again:
     - visible/usable only for connected TV sender play-again action
     - de-emphasized or hidden for non-connected web-only path

Behavior intent:

- Encourage testing friends/share over infinite local replay.
- Users can still manually return home to start again.

## 7) Functional Rules To Preserve

- No auth required.
- One scored attempt per challenge participant.
- Challenge TTL: ~1 week, extend on activity.
- Expired message: "This challenge expired, create a new one."
- Name identity is lightweight (cookies/local storage acceptable).
- Sender vs receiver flows remain separate.
- For TV gameplay voice is primary and fallback safe.
- For JSON challenge flow tap interaction is sufficient.

## 8) Implementation Notes (Engineering)

- Keep existing `/join`, `/join/:sessionId`, `/challenge/:challengeId` routes.
- Home visual should be same discovery UI on main domain and disconnect state.
- Reuse current challenge/session APIs; this doc is presentation/flow behavior contract.
- Keep this file updated whenever copy/layout/token changes are made.
