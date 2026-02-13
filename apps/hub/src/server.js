"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");
const QRCode = require("qrcode");

const PORT = parseInt(process.env.PORT || "8080", 10);
const API_PREFIX = "/api/v1";
const PROTOCOL_VERSION = "1.0";
const SESSION_TTL_MS = parseInt(process.env.SESSION_TTL_MS || String(2 * 60 * 60 * 1000), 10);
const EVENT_HISTORY_LIMIT = parseInt(process.env.EVENT_HISTORY_LIMIT || "300", 10);
const MAX_POLL_LIMIT = 200;
const SESSION_STORE_FILE = process.env.SESSION_STORE_FILE || "";
const CHALLENGE_STORE_FILE =
  process.env.CHALLENGE_STORE_FILE || (SESSION_STORE_FILE ? `${SESSION_STORE_FILE}.challenges` : "");
const CHALLENGE_TTL_MS = parseInt(
  process.env.CHALLENGE_TTL_MS || String(7 * 24 * 60 * 60 * 1000),
  10
);
const CHALLENGE_MAX_QUESTIONS = clampInt(process.env.CHALLENGE_MAX_QUESTIONS || "25", 1, 100);
const ROOM_CODE_SIZE = 4;
const HOST_STALE_MS = parseInt(process.env.HOST_STALE_MS || "12000", 10);
const MAX_CONTROLLERS_PER_SESSION = clampInt(process.env.MAX_CONTROLLERS_PER_SESSION || "1", 1, 10);
const CODE_JOIN_WINDOW_MS = parseInt(process.env.CODE_JOIN_WINDOW_MS || "60000", 10);
const CODE_JOIN_MAX_ATTEMPTS = parseInt(process.env.CODE_JOIN_MAX_ATTEMPTS || "30", 10);

const CONTROLLER_BASE_URL = stripTrailingSlash(process.env.CONTROLLER_BASE_URL || "http://localhost:3000");
const HUB_PUBLIC_BASE_URL = stripTrailingSlash(process.env.HUB_PUBLIC_BASE_URL || `http://localhost:${PORT}`);
const GA_MEASUREMENT_ID = sanitizeGaMeasurementId(
  process.env.QR_GA_MEASUREMENT_ID || process.env.GA_MEASUREMENT_ID || ""
);
const GA_DEBUG_ENABLED = parseBooleanFlag(process.env.QR_GA_DEBUG || process.env.GA_DEBUG || "");
const TRIVIA_CONTENT_BASE_URL = stripTrailingSlash(
  process.env.TRIVIA_CONTENT_BASE_URL ||
    process.env.TRIVIA_API_BASE_URL ||
    "https://ff64iccveag5dlj26gr55qy7ii0igdvc.lambda-url.us-east-1.on.aws"
);
const TRIVIA_CONTENT_API_KEY = process.env.TRIVIA_CONTENT_API_KEY || process.env.TRIVIA_API_KEY || "";
const TRIVIA_FETCH_TIMEOUT_MS = clampInt(process.env.TRIVIA_FETCH_TIMEOUT_MS || "7000", 1000, 30000);
const TRIVIA_MAX_QUESTIONS = clampInt(process.env.TRIVIA_MAX_QUESTIONS || "60", 1, 300);
const CHALLENGE_LOOP_GAMEPLAY_URL = sanitizeMediaUrl(
  process.env.CHALLENGE_LOOP_GAMEPLAY_URL || "https://sotw-assets.s3.us-east-1.amazonaws.com/bgloop.mp3"
);
const CHALLENGE_LOOP_MENU_URL = sanitizeMediaUrl(
  process.env.CHALLENGE_LOOP_MENU_URL || "https://sotw-assets.s3.us-east-1.amazonaws.com/loop.mp3"
);
const AUDIO_PROXY_TIMEOUT_MS = clampInt(process.env.AUDIO_PROXY_TIMEOUT_MS || "12000", 1000, 60000);
const AUDIO_PROXY_ALLOWED_HOSTS = parseHostList(
  process.env.AUDIO_PROXY_ALLOWED_HOSTS ||
    "sotw-assets.s3.us-east-1.amazonaws.com,d3tswg7dtbmd2x.cloudfront.net"
);
const CORS_ORIGINS = parseOriginList(process.env.CORS_ORIGINS || "*");
const CONTROLLER_PUBLIC_DIR = path.resolve(__dirname, "..", "..", "controller-web", "public");
const CONTROLLER_JOIN_HTML = path.join(CONTROLLER_PUBLIC_DIR, "join.html");
const CONTROLLER_INDEX_HTML = path.join(CONTROLLER_PUBLIC_DIR, "index.html");

const app = express();
const sessions = new Map();
const challenges = new Map();
const sessionCodes = new Map();
const codeJoinAttempts = new Map();
const persistState = { timer: null };

const corsOptions = CORS_ORIGINS.has("*")
  ? { origin: true }
  : {
      origin(origin, callback) {
        if (!origin || CORS_ORIGINS.has(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("origin_not_allowed"));
      },
    };

app.use(cors(corsOptions));
app.use(express.json({ limit: "200kb" }));

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "qrcontroller-hub", protocolVersion: PROTOCOL_VERSION });
});

app.get(`${API_PREFIX}/meta`, (req, res) => {
  res.json({
    ok: true,
    protocolVersion: PROTOCOL_VERSION,
    controllerBaseUrl: CONTROLLER_BASE_URL,
    hubBaseUrl: HUB_PUBLIC_BASE_URL,
    gaMeasurementId: GA_MEASUREMENT_ID || "",
    gaDebug: GA_DEBUG_ENABLED,
  });
});

app.get(`${API_PREFIX}/audio/loop/:kind`, async (req, res) => {
  const kind = req.params.kind === "gameplay" ? "gameplay" : req.params.kind === "menu" ? "menu" : "";
  if (!kind) {
    res.status(400).json({ ok: false, error: "invalid_loop_kind" });
    return;
  }

  const src = sanitizeMediaUrl(typeof req.query.src === "string" ? req.query.src : "");
  let targetUrl = src;
  if (!targetUrl) {
    targetUrl = kind === "gameplay" ? CHALLENGE_LOOP_GAMEPLAY_URL : CHALLENGE_LOOP_MENU_URL;
  }

  if (!targetUrl) {
    res.status(503).json({ ok: false, error: "loop_source_missing" });
    return;
  }

  if (!isAllowedAudioProxyUrl(targetUrl)) {
    res.status(400).json({ ok: false, error: "loop_source_not_allowed" });
    return;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AUDIO_PROXY_TIMEOUT_MS);
    timer.unref?.();

    const upstream = await fetch(targetUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!upstream.ok) {
      res.status(502).json({ ok: false, error: "audio_upstream_failed" });
      return;
    }

    const data = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get("content-type") || "audio/mpeg";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(data.length));
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=300");
    res.setHeader("X-Loop-Kind", kind);
    res.send(data);
  } catch (err) {
    res.status(502).json({ ok: false, error: "audio_proxy_failed" });
  }
});

app.get(`${API_PREFIX}/trivia/categories`, async (req, res) => {
  try {
    const data = await fetchTriviaPayload([
      "/categories",
      "/content/categories",
    ]);
    const categories = normalizeTriviaCategories(data);
    res.json({
      ok: true,
      categories,
      count: categories.length,
    });
  } catch (err) {
    res.status(502).json({
      ok: false,
      error: "trivia_categories_unavailable",
      message: String(err.message || err),
    });
  }
});

app.get(`${API_PREFIX}/trivia/questions`, async (req, res) => {
  const category = sanitizeCategoryId(req.query.category);
  if (!category) {
    res.status(400).json({ ok: false, error: "invalid_category" });
    return;
  }

  try {
    const encoded = encodeURIComponent(category);
    const data = await fetchTriviaPayload([
      `/questions?category=${encoded}`,
      `/content/questions?category=${encoded}`,
    ]);
    const questions = normalizeTriviaQuestions(data).slice(0, TRIVIA_MAX_QUESTIONS);
    res.json({
      ok: true,
      category,
      questions,
      count: questions.length,
    });
  } catch (err) {
    res.status(502).json({
      ok: false,
      error: "trivia_questions_unavailable",
      message: String(err.message || err),
    });
  }
});

app.post(`${API_PREFIX}/challenges`, (req, res) => {
  const body = req.body || {};
  const senderName = sanitizeDisplayName(body.senderName || body.name || "Player");
  const source = sanitizeSimple(body.source || "shared") || "shared";
  const bgAudioUrl = sanitizeMediaUrl(body.bgAudioUrl || body.backgroundAudioUrl || "");
  const category = normalizeCategory(body.category || {
    id: body.categoryId,
    name: body.categoryName || body.category,
  });
  const rules = normalizeRules(body.rules || {});
  const title = sanitizeTitle(body.title);
  const questions = normalizeChallengeQuestions(body.questions || []);

  if (questions.length === 0) {
    logInvalidChallengePayload(body);
    res.status(400).json({ ok: false, error: "invalid_questions" });
    return;
  }

  const senderAttempt = normalizeSenderAttempt(body.senderAttempt || body.senderRun || {}, questions);
  const nowMs = Date.now();
  const challengeId = makeId(10);
  const createdAt = new Date(nowMs).toISOString();

  const challenge = {
    id: challengeId,
    source,
    bgAudioUrl,
    title,
    senderName,
    category,
    rules,
    questions,
    senderAttempt,
    attempts: [],
    createdAt,
    updatedAt: createdAt,
    expiresAt: new Date(nowMs + CHALLENGE_TTL_MS).toISOString(),
  };

  challenges.set(challenge.id, challenge);
  schedulePersist();
  console.log(
    `[challenge] created id=${challenge.id} sender=${challenge.senderName} category=${challenge.category.id} questions=${challenge.questions.length}`
  );

  res.status(201).json({
    ok: true,
    challenge: serializeChallenge(challenge, { includeCorrectAnswers: false }),
    shareUrl: buildChallengeUrl(challenge),
  });
});

app.get(`${API_PREFIX}/challenges/:challengeId`, (req, res) => {
  const resolved = getChallenge(req.params.challengeId, { touch: true, withError: true });
  if (!resolved.challenge) {
    const status = resolved.error === "challenge_expired" ? 410 : 404;
    res.status(status).json({ ok: false, error: resolved.error || "challenge_not_found" });
    return;
  }
  const challenge = resolved.challenge;

  const participantId = sanitizeParticipantId(req.query.participantId);
  const existingAttempt = participantId
    ? challenge.attempts.find((attempt) => attempt.participantId === participantId) || null
    : null;

  res.json({
    ok: true,
    challenge: serializeChallenge(challenge, { includeCorrectAnswers: true }),
    viewer: {
      participantId: participantId || "",
      hasAttempted: !!existingAttempt,
      attempt: existingAttempt ? serializeAttempt(existingAttempt, { includeCorrectAnswers: true }) : null,
    },
  });
});

app.get(`${API_PREFIX}/challenges/:challengeId/qr`, async (req, res) => {
  const resolved = getChallenge(req.params.challengeId, { touch: true, withError: true });
  if (!resolved.challenge) {
    const status = resolved.error === "challenge_expired" ? 410 : 404;
    res.status(status).json({ ok: false, error: resolved.error || "challenge_not_found" });
    return;
  }

  const challenge = resolved.challenge;
  const width = clampInt(req.query.width, 128, 900);
  const format = String(req.query.format || "png").toLowerCase();
  const challengeUrl = buildChallengeUrl(challenge);

  try {
    if (format === "svg") {
      const svg = await QRCode.toString(challengeUrl, {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 2,
        width,
      });
      res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
      res.send(svg);
      return;
    }

    const png = await QRCode.toBuffer(challengeUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width,
    });
    res.setHeader("Content-Type", "image/png");
    res.send(png);
  } catch (err) {
    res.status(500).json({ ok: false, error: "qr_generation_failed" });
  }
});

app.post(`${API_PREFIX}/challenges/:challengeId/attempts`, (req, res) => {
  const resolved = getChallenge(req.params.challengeId, { touch: true, withError: true });
  if (!resolved.challenge) {
    const status = resolved.error === "challenge_expired" ? 410 : 404;
    res.status(status).json({ ok: false, error: resolved.error || "challenge_not_found" });
    return;
  }
  const challenge = resolved.challenge;

  const body = req.body || {};
  const participantId = sanitizeParticipantId(readField(body, ["participantId", "participantid"])) || makeId(12);
  const participantName = sanitizeDisplayName(
    readField(body, ["participantName", "participantname", "name"]) || "Player"
  );

  const existingAttempt = challenge.attempts.find((attempt) => attempt.participantId === participantId);
  if (existingAttempt) {
    res.json({
      ok: true,
      alreadyAttempted: true,
      attempt: serializeAttempt(existingAttempt, { includeCorrectAnswers: true }),
      challenge: serializeChallenge(challenge, { includeCorrectAnswers: false }),
    });
    return;
  }

  const answerMap = new Map();
  const submittedAnswers = Array.isArray(body.answers) ? body.answers : [];
  for (const item of submittedAnswers) {
    if (!isRecord(item)) continue;
    const questionId = sanitizeQuestionId(readField(item, ["questionId", "questionid", "id"]));
    if (!questionId) continue;
    const selectedRaw = readField(item, ["selectedIndex", "selectedindex", "answerIndex", "answerindex"]);
    const selectedIndex = Number.isFinite(selectedRaw) ? Math.floor(Number(selectedRaw)) : -1;
    answerMap.set(questionId, selectedIndex);
  }

  let score = 0;
  let correctCount = 0;
  const breakdown = [];

  for (const question of challenge.questions) {
    const selectedIndex = answerMap.has(question.questionId) ? answerMap.get(question.questionId) : -1;
    const isCorrect = selectedIndex === question.correctIndex;
    if (isCorrect) {
      correctCount += 1;
      score += question.points;
    }

    breakdown.push({
      questionId: question.questionId,
      questionText: question.questionText,
      choices: question.choices,
      selectedIndex,
      correctIndex: question.correctIndex,
      isCorrect,
      pointsAwarded: isCorrect ? question.points : 0,
      pointsPossible: question.points,
    });
  }

  const attempt = {
    id: makeId(12),
    participantId,
    participantName,
    score,
    correctCount,
    totalQuestions: challenge.questions.length,
    createdAt: nowIso(),
    answers: breakdown,
  };

  challenge.attempts.push(attempt);
  touchChallenge(challenge);
  schedulePersist();

  res.status(201).json({
    ok: true,
    alreadyAttempted: false,
    participantId,
    attempt: serializeAttempt(attempt, { includeCorrectAnswers: true }),
    challenge: serializeChallenge(challenge, { includeCorrectAnswers: false }),
  });
});

app.post(`${API_PREFIX}/sessions`, (req, res) => {
  const body = req.body || {};
  const session = createSession(body);
  sessions.set(session.id, session);
  schedulePersist();

  res.status(201).json({
    ok: true,
    session: serializeSession(session, true),
  });
});

app.get(`${API_PREFIX}/sessions/:sessionId`, (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ ok: false, error: "session_not_found" });
    return;
  }

  const role = req.query.role === "controller" ? "controller" : "host";
  const token = getToken(req.query.token);
  if (!authorize(session, role, token)) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  touchRoleHeartbeat(session, role);
  res.json({ ok: true, session: serializeSession(session, false) });
});

app.post(`${API_PREFIX}/sessions/:sessionId/join`, (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ ok: false, error: "session_not_found" });
    return;
  }

  const joinToken = getToken((req.body || {}).joinToken);
  if (!authorize(session, "controller", joinToken)) {
    res.status(401).json({ ok: false, error: "invalid_join_token" });
    return;
  }

  if (!isSessionOpen(session)) {
    res.status(410).json({ ok: false, error: "session_closed" });
    return;
  }

  touchRoleHeartbeat(session, "controller");

  res.json({
    ok: true,
    protocolVersion: PROTOCOL_VERSION,
    controllerToken: session.joinToken,
    wsUrl: `${HUB_PUBLIC_BASE_URL}/ws`,
    session: serializeSession(session, false),
  });
});

app.post(`${API_PREFIX}/sessions/join-by-code`, (req, res) => {
  const body = req.body || {};
  const code = sanitizeRoomCode(body.code);

  if (!code || code.length !== ROOM_CODE_SIZE) {
    res.status(400).json({ ok: false, error: "invalid_code" });
    return;
  }

  if (!allowCodeJoinAttempt(req.ip || "unknown")) {
    res.status(429).json({ ok: false, error: "too_many_attempts" });
    return;
  }

  const sessionId = sessionCodes.get(code);
  if (!sessionId) {
    res.status(404).json({ ok: false, error: "room_not_found" });
    return;
  }

  const session = getSession(sessionId);
  if (!session || !isSessionOpen(session)) {
    sessionCodes.delete(code);
    res.status(404).json({ ok: false, error: "room_not_found" });
    return;
  }

  touchRoleHeartbeat(session, "controller");

  res.json({
    ok: true,
    protocolVersion: PROTOCOL_VERSION,
    controllerToken: session.joinToken,
    joinToken: session.joinToken,
    wsUrl: `${HUB_PUBLIC_BASE_URL}/ws`,
    hubBase: HUB_PUBLIC_BASE_URL,
    session: serializeSession(session, false),
  });
});

app.post(`${API_PREFIX}/sessions/:sessionId/events`, (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ ok: false, error: "session_not_found" });
    return;
  }

  if (!isSessionOpen(session)) {
    res.status(410).json({ ok: false, error: "session_closed" });
    return;
  }

  const body = req.body || {};
  const role = body.role === "host" ? "host" : "controller";
  const token = getToken(body.token);

  if (!authorize(session, role, token)) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  touchRoleHeartbeat(session, role);

  const envelope = buildEnvelope(session, role, body.message || {}, "http");
  const saved = appendEvent(session, envelope);
  if (saved.fromRole === "host" && saved.action) {
    console.log(`[events] host action=${saved.action} session=${session.id} to=${saved.toRole}`);
  }
  routeEvent(session, saved);

  res.status(201).json({
    ok: true,
    event: {
      id: saved.id,
      seq: saved.seq,
      toRole: saved.toRole,
    },
  });
});

app.get(`${API_PREFIX}/sessions/:sessionId/events/poll`, (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ ok: false, error: "session_not_found" });
    return;
  }

  if (!isSessionOpen(session)) {
    res.status(410).json({ ok: false, error: "session_closed" });
    return;
  }

  const role = req.query.role === "controller" ? "controller" : "host";
  const token = getToken(req.query.token);
  if (!authorize(session, role, token)) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  touchRoleHeartbeat(session, role);

  const after = parseCursor(req.query.after);
  const limit = Math.min(clampInt(req.query.limit, 1, 50), MAX_POLL_LIMIT);

  const events = [];
  for (let i = 0; i < session.events.length; i += 1) {
    const event = session.events[i];
    if (event.seq <= after) continue;
    if (event.toRole !== role) continue;
    events.push(event);
    if (events.length >= limit) break;
  }

  const cursor = events.length > 0 ? events[events.length - 1].seq : after;
  res.json({ ok: true, events, cursor, serverTime: nowIso() });
});

app.get(`${API_PREFIX}/sessions/:sessionId/qr`, async (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ ok: false, error: "session_not_found" });
    return;
  }

  const hostToken = getToken(req.query.hostToken);
  if (!authorize(session, "host", hostToken)) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  const width = clampInt(req.query.width, 128, 900);
  const format = String(req.query.format || "svg").toLowerCase();

  try {
    if (format === "png") {
      const png = await QRCode.toBuffer(buildJoinUrl(session), {
        errorCorrectionLevel: "M",
        margin: 2,
        width,
      });
      res.setHeader("Content-Type", "image/png");
      res.send(png);
      return;
    }

    const svg = await QRCode.toString(buildJoinUrl(session), {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      width,
    });
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.send(svg);
  } catch (err) {
    res.status(500).json({ ok: false, error: "qr_generation_failed" });
  }
});

app.post(`${API_PREFIX}/sessions/:sessionId/close`, (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ ok: false, error: "session_not_found" });
    return;
  }

  const hostToken = getToken((req.body || {}).hostToken);
  if (!authorize(session, "host", hostToken)) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  closeSession(session, "closed_by_host");
  res.json({ ok: true });
});


if (fs.existsSync(CONTROLLER_PUBLIC_DIR)) {
  app.use(express.static(CONTROLLER_PUBLIC_DIR, { index: false }));

  app.get("/join/:sessionId", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(CONTROLLER_JOIN_HTML);
  });

  app.get("/join", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(CONTROLLER_JOIN_HTML);
  });

  app.get("/challenge/:challengeId", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(CONTROLLER_JOIN_HTML);
  });

  app.get("/challenge", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(CONTROLLER_JOIN_HTML);
  });

  app.get("/", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(CONTROLLER_JOIN_HTML);
  });
}

const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "/ws", HUB_PUBLIC_BASE_URL);
  const sessionId = sanitizeId(url.searchParams.get("sessionId"));
  const role = url.searchParams.get("role") === "host" ? "host" : "controller";
  const token = getToken(url.searchParams.get("token"));

  if (!sessionId) {
    closeSocket(ws, 1008, "missing_session");
    return;
  }

  const session = getSession(sessionId);
  if (!session) {
    closeSocket(ws, 1008, "session_not_found");
    return;
  }

  if (!isSessionOpen(session)) {
    closeSocket(ws, 1008, "session_closed");
    return;
  }

  if (!authorize(session, role, token)) {
    closeSocket(ws, 1008, "unauthorized");
    return;
  }

  if (role === "controller") {
    while (countByRole(session, "controller") >= MAX_CONTROLLERS_PER_SESSION) {
      const evicted = evictOldestControllerConnection(session);
      if (!evicted) break;
    }
  }

  const connection = {
    id: sanitizeId(url.searchParams.get("clientId")) || makeId(16),
    role,
    ws,
    connectedAt: nowIso(),
    connectedAtMs: Date.now(),
    userAgent: (req.headers["user-agent"] || "").toString().slice(0, 200),
  };

  session.connections.set(connection.id, connection);
  touchRoleHeartbeat(session, role);

  sendJson(ws, {
    type: "hello",
    protocolVersion: PROTOCOL_VERSION,
    role,
    clientId: connection.id,
    session: serializeSession(session, false),
  });

  broadcastPresence(session, connection, "joined");

  ws.on("message", (raw) => {
    const text = toUtf8(raw);
    if (!text) return;

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      sendJson(ws, { type: "error", code: "invalid_json" });
      return;
    }

    touchRoleHeartbeat(session, role);

    if (parsed && parsed.type === "ping") {
      sendJson(ws, { type: "pong", ts: nowIso() });
      return;
    }

    const envelope = buildEnvelope(session, role, parsed || {}, "ws");
    const saved = appendEvent(session, envelope);
    routeEvent(session, saved);

    sendJson(ws, {
      type: "ack",
      id: saved.id,
      seq: saved.seq,
      receivedAt: saved.receivedAt,
    });
  });

  ws.on("close", () => {
    session.connections.delete(connection.id);
    touchRoleHeartbeat(session, role);
    broadcastPresence(session, connection, "left");
  });

  ws.on("error", () => {
    session.connections.delete(connection.id);
  });
});

loadSessionsFromDisk();
loadChallengesFromDisk();

server.listen(PORT, () => {
  console.log(`[hub] listening on ${PORT}`);
  console.log(`[hub] controller base ${CONTROLLER_BASE_URL}`);
  console.log(`[hub] public hub base ${HUB_PUBLIC_BASE_URL}`);
  if (GA_MEASUREMENT_ID) {
    console.log(`[hub] ga measurement ${GA_MEASUREMENT_ID}`);
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    const expired = Date.parse(session.expiresAt) <= now;
    const hostStale =
      !session.closedAt &&
      session.hostLastSeenAt &&
      Date.parse(session.hostLastSeenAt) + HOST_STALE_MS <= now;

    if (expired) {
      closeSession(session, "expired");
      sessions.delete(id);
      schedulePersist();
      continue;
    }

    if (hostStale) {
      closeSession(session, "host_disconnected");
    }

    const closedTooLong = session.closedAt && Date.parse(session.closedAt) + 5 * 60 * 1000 <= now;
    if (closedTooLong) {
      closeSession(session, "closed");
      sessions.delete(id);
      schedulePersist();
    }
  }

  pruneCodeJoinAttempts(now);
  pruneChallenges(now);
}, 5 * 1000).unref();

let shutdownStarted = false;
function handleShutdown(signal) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  flushPersist();
  if (signal) {
    console.log(`[hub] shutdown via ${signal}`);
  }
  process.exit(0);
}

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("beforeExit", () => flushPersist());

function createSession(body) {
  const capabilities = Array.isArray(body.capabilities)
    ? body.capabilities.filter((value) => typeof value === "string" && value.length > 0).slice(0, 50)
    : [];

  const metadata = isRecord(body.metadata) ? body.metadata : {};
  const id = makeId(12);
  const createdAt = nowIso();

  return {
    id,
    roomCode: reserveRoomCode(id),
    platform: sanitizeSimple(body.platform) || "unknown",
    capabilities,
    metadata,
    protocolVersion: PROTOCOL_VERSION,
    clientVersion: sanitizeClientVersion(body.clientVersion) || "1",
    hostToken: makeId(32),
    joinToken: makeId(24),
    createdAt,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    closedAt: null,
    closeReason: "",
    hostLastSeenAt: createdAt,
    controllerLastSeenAt: null,
    connections: new Map(),
    eventSeq: 0,
    events: [],
  };
}

function serializeSession(session, includeSecrets) {
  const out = {
    id: session.id,
    roomCode: session.roomCode,
    platform: session.platform,
    capabilities: session.capabilities,
    metadata: session.metadata,
    protocolVersion: session.protocolVersion,
    clientVersion: session.clientVersion,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    closedAt: session.closedAt,
    closeReason: session.closeReason || "",
    links: {
      joinUrl: buildJoinUrl(session),
      wsUrl: `${HUB_PUBLIC_BASE_URL}/ws`,
      pollUrl: `${HUB_PUBLIC_BASE_URL}${API_PREFIX}/sessions/${encodeURIComponent(session.id)}/events/poll`,
    },
    peers: {
      host: countByRole(session, "host"),
      controller: countByRole(session, "controller"),
    },
  };

  if (includeSecrets) {
    out.tokens = {
      hostToken: session.hostToken,
      joinToken: session.joinToken,
    };
  }

  return out;
}

function buildJoinUrl(session) {
  const hub = encodeURIComponent(HUB_PUBLIC_BASE_URL);
  const rc = encodeURIComponent(session.roomCode || "");
  const url = `${CONTROLLER_BASE_URL}/join/${encodeURIComponent(session.id)}?t=${encodeURIComponent(session.joinToken)}&hub=${hub}&cv=${encodeURIComponent(session.clientVersion)}&rc=${rc}`;
  return withControllerAnalytics(url);
}

function buildEnvelope(session, fromRole, incoming, source) {
  const now = nowIso();
  const requestedToRole = incoming && incoming.toRole === "host" ? "host" : incoming && incoming.toRole === "controller" ? "controller" : null;
  const fallbackToRole = fromRole === "host" ? "controller" : "host";

  let toRole = requestedToRole || fallbackToRole;
  if (toRole === fromRole) {
    toRole = fallbackToRole;
  }

  return {
    v: typeof incoming.v === "string" ? incoming.v : PROTOCOL_VERSION,
    type: sanitizeType(incoming.type),
    id: sanitizeId(incoming.id) || makeId(16),
    sessionId: session.id,
    action: sanitizeAction(incoming.action),
    payload: isRecord(incoming.payload) ? incoming.payload : {},
    fromRole,
    toRole,
    source,
    sentAt: typeof incoming.sentAt === "string" && incoming.sentAt ? incoming.sentAt : now,
    receivedAt: now,
  };
}

function appendEvent(session, envelope) {
  const withSeq = {
    ...envelope,
    seq: ++session.eventSeq,
  };

  session.events.push(withSeq);
  if (session.events.length > EVENT_HISTORY_LIMIT) {
    session.events.splice(0, session.events.length - EVENT_HISTORY_LIMIT);
  }

  schedulePersist();
  return withSeq;
}

function routeEvent(session, event) {
  for (const connection of session.connections.values()) {
    if (connection.role !== event.toRole) continue;
    sendJson(connection.ws, { type: "event", event });
  }
}

function broadcastPresence(session, actor, state) {
  const payload = {
    type: "presence",
    sessionId: session.id,
    actor: {
      id: actor.id,
      role: actor.role,
      state,
      at: nowIso(),
    },
  };

  for (const connection of session.connections.values()) {
    if (connection.id === actor.id) continue;
    sendJson(connection.ws, payload);
  }
}

function closeSession(session, reason) {
  if (!session.closedAt) {
    session.closedAt = nowIso();
    session.closeReason = String(reason || "closed");
    releaseRoomCode(session.roomCode, session.id);
  }

  for (const connection of session.connections.values()) {
    closeSocket(connection.ws, 1001, reason);
  }

  session.connections.clear();
  schedulePersist();
}

function getSession(rawSessionId) {
  const sessionId = sanitizeId(rawSessionId);
  if (!sessionId) return null;

  const session = sessions.get(sessionId);
  if (!session) return null;

  if (Date.parse(session.expiresAt) <= Date.now()) {
    closeSession(session, "expired");
    sessions.delete(sessionId);
    schedulePersist();
    return null;
  }

  return session;
}

function isSessionOpen(session) {
  return !!session && !session.closedAt && Date.parse(session.expiresAt) > Date.now();
}

function authorize(session, role, token) {
  if (!session || !token) return false;
  if (role === "host") {
    return timingSafeEqual(token, session.hostToken);
  }
  return timingSafeEqual(token, session.joinToken);
}

function countByRole(session, role) {
  let count = 0;
  for (const connection of session.connections.values()) {
    if (connection.role === role) count += 1;
  }
  return count;
}

function sendJson(ws, payload) {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify(payload));
}

function closeSocket(ws, code, reason) {
  if (!ws || ws.readyState !== 1) return;
  try {
    ws.close(code, String(reason || "closed").slice(0, 120));
  } catch {
    ws.terminate();
  }
}

function loadSessionsFromDisk() {
  if (!SESSION_STORE_FILE) return;

  try {
    if (!fs.existsSync(SESSION_STORE_FILE)) return;

    const raw = fs.readFileSync(SESSION_STORE_FILE, "utf8");
    if (!raw) return;

    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return;

    const now = Date.now();
    let restored = 0;

    for (const item of list) {
      if (!isRecord(item)) continue;

      const id = sanitizeId(item.id);
      if (!id) continue;

      const expiresAt = typeof item.expiresAt === "string" ? item.expiresAt : nowIso();
      if (Date.parse(expiresAt) <= now) continue;

      const createdAt = typeof item.createdAt === "string" ? item.createdAt : nowIso();
      const session = {
        id,
        roomCode: reserveRoomCode(id, item.roomCode),
        platform: sanitizeSimple(item.platform) || "unknown",
        capabilities: Array.isArray(item.capabilities)
          ? item.capabilities.filter((v) => typeof v === "string" && v.length > 0).slice(0, 50)
          : [],
        metadata: isRecord(item.metadata) ? item.metadata : {},
        protocolVersion: PROTOCOL_VERSION,
        clientVersion: sanitizeClientVersion(item.clientVersion) || "1",
        hostToken: getToken(item.hostToken),
        joinToken: getToken(item.joinToken),
        createdAt,
        expiresAt,
        closedAt: typeof item.closedAt === "string" ? item.closedAt : null,
        closeReason: typeof item.closeReason === "string" ? item.closeReason : "",
        hostLastSeenAt: typeof item.hostLastSeenAt === "string" ? item.hostLastSeenAt : createdAt,
        controllerLastSeenAt:
          typeof item.controllerLastSeenAt === "string" ? item.controllerLastSeenAt : null,
        connections: new Map(),
        eventSeq: Number.isFinite(item.eventSeq) ? Math.max(0, Math.floor(item.eventSeq)) : 0,
        events: [],
      };

      if (!session.hostToken || !session.joinToken) continue;

      const eventList = Array.isArray(item.events) ? item.events : [];
      for (const event of eventList) {
        if (!isRecord(event)) continue;
        if (!Number.isFinite(event.seq) || event.seq <= 0) continue;
        if (event.toRole !== "host" && event.toRole !== "controller") continue;
        session.events.push(event);
      }

      session.events.sort((a, b) => a.seq - b.seq);
      if (session.events.length > EVENT_HISTORY_LIMIT) {
        session.events = session.events.slice(session.events.length - EVENT_HISTORY_LIMIT);
      }

      if (session.events.length > 0) {
        const maxSeq = session.events[session.events.length - 1].seq;
        session.eventSeq = Math.max(session.eventSeq, maxSeq);
      }

      sessions.set(session.id, session);
      restored += 1;
    }

    if (restored > 0) {
      console.log(`[hub] restored ${restored} session(s) from disk`);
    }
  } catch (err) {
    console.warn(`[hub] failed to load session store: ${String(err.message || err)}`);
  }
}

function loadChallengesFromDisk() {
  if (!CHALLENGE_STORE_FILE) return;

  try {
    if (!fs.existsSync(CHALLENGE_STORE_FILE)) return;

    const raw = fs.readFileSync(CHALLENGE_STORE_FILE, "utf8");
    if (!raw) return;

    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return;

    const now = Date.now();
    let restored = 0;

    for (const item of list) {
      const challenge = normalizeChallengeRecord(item);
      if (!challenge) continue;
      if (Date.parse(challenge.expiresAt) <= now) continue;
      challenges.set(challenge.id, challenge);
      restored += 1;
    }

    if (restored > 0) {
      console.log(`[hub] restored ${restored} challenge(s) from disk`);
    }
  } catch (err) {
    console.warn(`[hub] failed to load challenge store: ${String(err.message || err)}`);
  }
}

function schedulePersist() {
  if (!SESSION_STORE_FILE && !CHALLENGE_STORE_FILE) return;

  if (persistState.timer) {
    clearTimeout(persistState.timer);
  }

  persistState.timer = setTimeout(() => {
    persistState.timer = null;
    flushPersist();
  }, 150);
}

function flushPersist() {
  if (SESSION_STORE_FILE) {
    const serializedSessions = [];
    for (const session of sessions.values()) {
      serializedSessions.push({
        id: session.id,
        roomCode: session.roomCode,
        platform: session.platform,
        capabilities: session.capabilities,
        metadata: session.metadata,
        clientVersion: session.clientVersion,
        hostToken: session.hostToken,
        joinToken: session.joinToken,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        closedAt: session.closedAt,
        closeReason: session.closeReason,
        hostLastSeenAt: session.hostLastSeenAt,
        controllerLastSeenAt: session.controllerLastSeenAt,
        eventSeq: session.eventSeq,
        events: session.events,
      });
    }

    try {
      writeJsonAtomically(SESSION_STORE_FILE, serializedSessions);
    } catch (err) {
      console.warn(`[hub] failed to persist sessions: ${String(err.message || err)}`);
    }
  }

  if (CHALLENGE_STORE_FILE) {
    const serializedChallenges = [];
    for (const challenge of challenges.values()) {
      serializedChallenges.push({
        id: challenge.id,
        source: challenge.source,
        title: challenge.title,
        senderName: challenge.senderName,
        category: challenge.category,
        rules: challenge.rules,
        createdAt: challenge.createdAt,
        updatedAt: challenge.updatedAt,
        expiresAt: challenge.expiresAt,
        questions: challenge.questions,
        senderAttempt: challenge.senderAttempt,
        attempts: challenge.attempts,
      });
    }

    try {
      writeJsonAtomically(CHALLENGE_STORE_FILE, serializedChallenges);
    } catch (err) {
      console.warn(`[hub] failed to persist challenges: ${String(err.message || err)}`);
    }
  }
}

function touchRoleHeartbeat(session, role) {
  if (!session) return;
  const ts = nowIso();
  if (role === "host") {
    session.hostLastSeenAt = ts;
  } else if (role === "controller") {
    session.controllerLastSeenAt = ts;
  }
}

function evictOldestControllerConnection(session) {
  let oldest = null;
  for (const connection of session.connections.values()) {
    if (connection.role !== "controller") continue;
    if (!oldest || connection.connectedAtMs < oldest.connectedAtMs) {
      oldest = connection;
    }
  }

  if (!oldest) return false;

  session.connections.delete(oldest.id);
  closeSocket(oldest.ws, 1001, "replaced_by_new_controller");
  broadcastPresence(session, oldest, "left");
  return true;
}

function reserveRoomCode(sessionId, preferredCode) {
  const preferred = sanitizeRoomCode(preferredCode);
  if (preferred) {
    const owner = sessionCodes.get(preferred);
    if (!owner || owner === sessionId) {
      sessionCodes.set(preferred, sessionId);
      return preferred;
    }
  }

  for (let i = 0; i < 1500; i += 1) {
    const code = makeRoomCode();
    if (!sessionCodes.has(code)) {
      sessionCodes.set(code, sessionId);
      return code;
    }
  }

  throw new Error("room_code_space_exhausted");
}

function releaseRoomCode(code, sessionId) {
  const normalized = sanitizeRoomCode(code);
  if (!normalized) return;
  const owner = sessionCodes.get(normalized);
  if (!owner || owner === sessionId) {
    sessionCodes.delete(normalized);
  }
}

function makeRoomCode() {
  const alphabet = "0123456789";
  let out = "";
  for (let i = 0; i < ROOM_CODE_SIZE; i += 1) {
    const idx = crypto.randomInt(0, alphabet.length);
    out += alphabet[idx];
  }
  return out;
}

function sanitizeRoomCode(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[^0-9]/g, "").slice(0, ROOM_CODE_SIZE);
}

function allowCodeJoinAttempt(ipRaw) {
  const now = Date.now();
  const ip = String(ipRaw || "unknown").slice(0, 120);
  const entry = codeJoinAttempts.get(ip);

  if (!entry || now - entry.windowStart >= CODE_JOIN_WINDOW_MS) {
    codeJoinAttempts.set(ip, { windowStart: now, count: 1 });
    return true;
  }

  if (entry.count >= CODE_JOIN_MAX_ATTEMPTS) {
    return false;
  }

  entry.count += 1;
  return true;
}

function pruneCodeJoinAttempts(now = Date.now()) {
  for (const [ip, entry] of codeJoinAttempts.entries()) {
    if (!entry || now - entry.windowStart >= CODE_JOIN_WINDOW_MS * 2) {
      codeJoinAttempts.delete(ip);
    }
  }
}

function pruneChallenges(now = Date.now()) {
  for (const [id, challenge] of challenges.entries()) {
    if (!challenge || Date.parse(challenge.expiresAt) <= now) {
      challenges.delete(id);
      schedulePersist();
    }
  }
}

function getChallenge(rawChallengeId, options = {}) {
  const challengeId = sanitizeId(rawChallengeId);
  if (!challengeId) {
    return options.withError ? { challenge: null, error: "challenge_not_found" } : null;
  }

  const challenge = challenges.get(challengeId);
  if (!challenge) {
    return options.withError ? { challenge: null, error: "challenge_not_found" } : null;
  }

  if (!isChallengeOpen(challenge)) {
    challenges.delete(challengeId);
    schedulePersist();
    return options.withError ? { challenge: null, error: "challenge_expired" } : null;
  }

  if (options.touch === true) {
    touchChallenge(challenge);
  }

  return options.withError ? { challenge, error: "" } : challenge;
}

function isChallengeOpen(challenge) {
  return !!challenge && Date.parse(challenge.expiresAt) > Date.now();
}

function touchChallenge(challenge) {
  if (!challenge) return;
  const now = Date.now();
  challenge.updatedAt = new Date(now).toISOString();
  challenge.expiresAt = new Date(now + CHALLENGE_TTL_MS).toISOString();
  schedulePersist();
}

function buildChallengeUrl(challenge) {
  const challengeId = encodeURIComponent(challenge.id);
  const hub = encodeURIComponent(HUB_PUBLIC_BASE_URL);
  return withControllerAnalytics(`${CONTROLLER_BASE_URL}/challenge/${challengeId}?hub=${hub}`);
}

function withControllerAnalytics(url) {
  if (typeof url !== "string" || !url) return "";
  if (!GA_MEASUREMENT_ID && !GA_DEBUG_ENABLED) return url;
  try {
    const parsed = new URL(url);
    if (GA_MEASUREMENT_ID && !parsed.searchParams.has("gaid") && !parsed.searchParams.has("ga")) {
      parsed.searchParams.set("gaid", GA_MEASUREMENT_ID);
    }
    if (GA_DEBUG_ENABLED && !parsed.searchParams.has("gadebug")) {
      parsed.searchParams.set("gadebug", "1");
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function serializeChallenge(challenge, options = {}) {
  const includeCorrectAnswers = options.includeCorrectAnswers === true;
  const questions = challenge.questions.map((question) => {
    const out = {
      questionId: question.questionId,
      questionText: question.questionText,
      choices: question.choices,
      points: question.points,
    };
    if (question.tts) {
      out.tts = question.tts;
    }
    if (includeCorrectAnswers) {
      out.correctIndex = question.correctIndex;
    }
    return out;
  });

  return {
    id: challenge.id,
    source: challenge.source,
    bgAudioUrl: challenge.bgAudioUrl || "",
    title: challenge.title,
    senderName: challenge.senderName,
    category: challenge.category,
    rules: challenge.rules,
    createdAt: challenge.createdAt,
    updatedAt: challenge.updatedAt,
    expiresAt: challenge.expiresAt,
    questionCount: challenge.questions.length,
    senderAttempt: challenge.senderAttempt
      ? serializeAttempt(challenge.senderAttempt, {
          includeCorrectAnswers: false,
          includeParticipantId: false,
        })
      : null,
    attempts: challenge.attempts.map((attempt) =>
      serializeAttempt(attempt, { includeCorrectAnswers: false, includeParticipantId: false })
    ),
    leaderboard: buildChallengeLeaderboard(challenge),
    questions,
    shareUrl: buildChallengeUrl(challenge),
  };
}

function serializeAttempt(attempt, options = {}) {
  const includeCorrectAnswers = options.includeCorrectAnswers === true;
  const includeParticipantId = options.includeParticipantId !== false;

  const out = {
    id: attempt.id,
    participantName: attempt.participantName,
    score: attempt.score,
    correctCount: attempt.correctCount,
    totalQuestions: attempt.totalQuestions,
    createdAt: attempt.createdAt,
    answers: Array.isArray(attempt.answers)
      ? attempt.answers.map((item) => {
          const entry = {
            questionId: item.questionId,
            questionText: item.questionText,
            choices: item.choices,
            selectedIndex: item.selectedIndex,
            isCorrect: !!item.isCorrect,
            pointsAwarded: item.pointsAwarded,
            pointsPossible: item.pointsPossible,
          };
          if (includeCorrectAnswers) {
            entry.correctIndex = item.correctIndex;
          }
          return entry;
        })
      : [],
  };

  if (includeParticipantId) {
    out.participantId = attempt.participantId;
  }

  return out;
}

function buildChallengeLeaderboard(challenge) {
  const rows = [];

  if (challenge.senderAttempt) {
    rows.push({
      rank: 0,
      id: challenge.senderAttempt.id,
      participantName: challenge.senderAttempt.participantName || challenge.senderName,
      score: challenge.senderAttempt.score || 0,
      isSender: true,
      createdAt: challenge.senderAttempt.createdAt || challenge.createdAt,
    });
  } else {
    rows.push({
      rank: 0,
      id: "sender",
      participantName: challenge.senderName,
      score: 0,
      isSender: true,
      createdAt: challenge.createdAt,
    });
  }

  for (const attempt of challenge.attempts) {
    rows.push({
      rank: 0,
      id: attempt.id,
      participantName: attempt.participantName,
      score: attempt.score,
      isSender: false,
      createdAt: attempt.createdAt,
    });
  }

  rows.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return Date.parse(left.createdAt) - Date.parse(right.createdAt);
  });

  for (let i = 0; i < rows.length; i += 1) {
    rows[i].rank = i + 1;
  }

  return rows.slice(0, 20);
}

function normalizeChallengeRecord(record) {
  if (!isRecord(record)) return null;

  const id = sanitizeId(record.id);
  if (!id) return null;

  const source = sanitizeSimple(record.source || "shared") || "shared";
  const bgAudioUrl = sanitizeMediaUrl(record.bgAudioUrl || record.backgroundAudioUrl || "");
  const title = sanitizeTitle(record.title);
  const senderName = sanitizeDisplayName(record.senderName || "Player");
  const category = normalizeCategory(record.category || {});
  const rules = normalizeRules(record.rules || {});
  const questions = normalizeChallengeQuestions(record.questions || []);
  if (questions.length === 0) return null;

  const createdAt = typeof record.createdAt === "string" && record.createdAt ? record.createdAt : nowIso();
  const updatedAt = typeof record.updatedAt === "string" && record.updatedAt ? record.updatedAt : createdAt;
  const expiresAt =
    typeof record.expiresAt === "string" && record.expiresAt
      ? record.expiresAt
      : new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();

  const senderAttempt = normalizeSenderAttempt(record.senderAttempt || {}, questions, senderName);
  const attempts = [];
  const inputAttempts = Array.isArray(record.attempts) ? record.attempts : [];
  for (const item of inputAttempts) {
    const attempt = normalizeStoredAttempt(item, questions);
    if (!attempt) continue;
    attempts.push(attempt);
  }

  return {
    id,
    source,
    bgAudioUrl,
    title,
    senderName,
    category,
    rules,
    createdAt,
    updatedAt,
    expiresAt,
    questions,
    senderAttempt,
    attempts,
  };
}

function normalizeStoredAttempt(item, questions) {
  if (!isRecord(item)) return null;

  const id = sanitizeId(item.id) || makeId(12);
  const participantId = sanitizeParticipantId(item.participantId);
  if (!participantId) return null;

  const participantName = sanitizeDisplayName(item.participantName || "Player");
  const score = asFiniteInt(item.score, 0);
  const createdAt = typeof item.createdAt === "string" && item.createdAt ? item.createdAt : nowIso();
  const normalizedAnswers = normalizeAnswerBreakdown(item.answers || [], questions);
  const correctCount = normalizedAnswers.filter((entry) => entry.isCorrect).length;

  return {
    id,
    participantId,
    participantName,
    score,
    correctCount,
    totalQuestions: questions.length,
    createdAt,
    answers: normalizedAnswers,
  };
}

function normalizeSenderAttempt(raw, questions, fallbackName) {
  if (!isRecord(raw)) return null;
  const hasAnswers = Array.isArray(raw.answers) && raw.answers.length > 0;
  const hasScore =
    Number.isFinite(readField(raw, ["score"])) ||
    Number.isFinite(readField(raw, ["correctCount", "correctcount"]));
  if (!hasAnswers && !hasScore) return null;

  const participantName = sanitizeDisplayName(
    readField(raw, ["participantName", "participantname", "name"]) || fallbackName || "You"
  );
  const createdAtValue = readField(raw, ["createdAt", "createdat"]);
  const createdAt = typeof createdAtValue === "string" && createdAtValue ? createdAtValue : nowIso();
  const answers = normalizeAnswerBreakdown(hasAnswers ? raw.answers : [], questions, {
    includeMissing: false,
  });

  let score = asFiniteInt(readField(raw, ["score"]), 0);
  let correctCount = 0;
  if (answers.length > 0) {
    score = 0;
    for (const answer of answers) {
      if (answer.isCorrect) {
        score += answer.pointsPossible;
        correctCount += 1;
      }
    }
  } else {
    correctCount = asFiniteInt(readField(raw, ["correctCount", "correctcount"]), 0);
  }

  return {
    id: sanitizeId(readField(raw, ["id"])) || "sender",
    participantId: "sender",
    participantName,
    score,
    correctCount,
    totalQuestions: questions.length,
    createdAt,
    answers,
  };
}

function normalizeAnswerBreakdown(rawAnswers, questions, options = {}) {
  const includeMissing = options.includeMissing !== false;
  const map = new Map();
  const answers = Array.isArray(rawAnswers) ? rawAnswers : [];
  for (const item of answers) {
    if (!isRecord(item)) continue;
    const questionId = sanitizeQuestionId(readField(item, ["questionId", "questionid", "id"]));
    if (!questionId) continue;
    const selectedIndex = asFiniteInt(
      readField(item, ["selectedIndex", "selectedindex", "answerIndex", "answerindex"]),
      -1
    );
    map.set(questionId, selectedIndex);
  }

  if (!includeMissing && map.size === 0) {
    return [];
  }

  const out = [];
  for (const question of questions) {
    if (!includeMissing && !map.has(question.questionId)) {
      continue;
    }
    const selectedIndex = map.has(question.questionId) ? map.get(question.questionId) : -1;
    out.push({
      questionId: question.questionId,
      questionText: question.questionText,
      choices: question.choices,
      selectedIndex,
      correctIndex: question.correctIndex,
      isCorrect: selectedIndex === question.correctIndex,
      pointsAwarded: selectedIndex === question.correctIndex ? question.points : 0,
      pointsPossible: question.points,
    });
  }

  return out;
}

function normalizeCategory(raw) {
  if (!isRecord(raw)) {
    return {
      id: "general",
      name: "General Knowledge",
    };
  }

  const id = sanitizeCategoryId(raw.id || raw.categoryId || raw.category || "general");
  const name = sanitizeCategoryName(raw.name || raw.displayName || raw.title || id || "General Knowledge");
  return {
    id: id || "general",
    name: name || "General Knowledge",
  };
}

function normalizeRules(raw) {
  const defaults = {
    scoringVersion: "v1",
    pointsPerCorrect: 100,
    questionsPerRound: 5,
    challengeType: "trivia_snapshot",
  };

  if (!isRecord(raw)) return defaults;

  return {
    scoringVersion: sanitizeSimple(raw.scoringVersion || defaults.scoringVersion) || defaults.scoringVersion,
    pointsPerCorrect: asFiniteInt(raw.pointsPerCorrect, defaults.pointsPerCorrect),
    questionsPerRound: asFiniteInt(raw.questionsPerRound, defaults.questionsPerRound),
    challengeType: sanitizeSimple(raw.challengeType || defaults.challengeType) || defaults.challengeType,
  };
}

function normalizeChallengeQuestions(rawQuestions) {
  const out = [];
  if (!Array.isArray(rawQuestions)) return out;

  for (const item of rawQuestions) {
    if (!isRecord(item)) continue;
    const questionId =
      sanitizeQuestionId(readField(item, ["questionId", "questionid", "question_id", "id", "qid"])) ||
      `q_${out.length + 1}`;
    const questionText = sanitizeQuestionText(
      readField(item, ["questionText", "questiontext", "question_text", "question", "text", "prompt"]) || ""
    );
    if (!questionText) continue;

    const rawChoices = readChoicesField(item);
    const choices = rawChoices
      .map((choice) => sanitizeChoiceText(choice))
      .filter(Boolean)
      .slice(0, 8);

    if (choices.length < 2) continue;

    const correctIndex = asFiniteInt(
      readField(item, [
        "correctIndex",
        "correctindex",
        "correct_answer_index",
        "correctAnswerIndex",
        "answerIndex",
        "answerindex",
      ]),
      -1
    );
    if (correctIndex < 0 || correctIndex >= choices.length) continue;

    const tts = normalizeQuestionTtsMetadata(item, choices.length);

    out.push({
      questionId,
      questionText,
      choices,
      correctIndex,
      points: Math.max(0, asFiniteInt(item.points, 100)),
      tts,
    });

    if (out.length >= CHALLENGE_MAX_QUESTIONS) break;
  }

  return out;
}

function logInvalidChallengePayload(body) {
  try {
    const questions = Array.isArray(body.questions) ? body.questions : [];
    const first = questions.length > 0 ? questions[0] : null;
    const summary = {
      senderNameType: typeof body.senderName,
      categoryType: typeof body.category,
      questionsCount: questions.length,
      firstQuestionType: first ? typeof first : "none",
      firstQuestionKeys: first && isRecord(first) ? Object.keys(first).slice(0, 12) : [],
      firstQuestionTextType:
        first && isRecord(first)
          ? typeof readField(first, [
              "questionText",
              "questiontext",
              "question_text",
              "question",
              "text",
              "prompt",
            ])
          : "none",
      firstChoicesType:
        first && isRecord(first)
          ? Array.isArray(readChoicesField(first))
            ? "array"
            : "none"
          : "none",
      firstChoiceValueType:
        first && isRecord(first) && Array.isArray(readChoicesField(first)) && readChoicesField(first).length > 0
          ? typeof readChoicesField(first)[0]
          : "none",
      firstCorrectIndexType:
        first && isRecord(first)
          ? typeof readField(first, [
              "correctIndex",
              "correctindex",
              "correct_answer_index",
              "correctAnswerIndex",
              "answerIndex",
              "answerindex",
            ])
          : "none",
    };
    console.warn(`[challenge] invalid_questions payload summary ${JSON.stringify(summary)}`);
  } catch (err) {
    console.warn("[challenge] invalid_questions payload summary unavailable");
  }
}

function normalizeTriviaCategories(data) {
  const list = extractArrayField(data, ["categories", "data", "items", "results"]);
  const out = [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    const id = sanitizeCategoryId(item.id || item.categoryId || item.category);
    const name = sanitizeCategoryName(item.displayName || item.name || item.title || id);
    if (!id || !name) continue;
    out.push({
      id,
      name,
      displayName: name,
      isPremium: !!item.isPremium,
      order: Number.isFinite(item.order) ? Math.floor(item.order) : out.length + 1,
    });
  }

  out.sort((left, right) => left.order - right.order);
  return out;
}

function normalizeTriviaQuestions(data) {
  const list = extractArrayField(data, ["questions", "data", "items", "results"]);
  const out = [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    const questionId =
      sanitizeQuestionId(readField(item, ["questionId", "questionid", "question_id", "id", "qid"])) ||
      `q_${out.length + 1}`;
    const questionText = sanitizeQuestionText(
      readField(item, ["questionText", "questiontext", "question_text", "question", "text", "prompt"])
    );
    if (!questionText) continue;

    const rawChoices = readChoicesField(item);
    const choices = rawChoices
      .map((choice) => sanitizeChoiceText(choice))
      .filter(Boolean)
      .slice(0, 8);
    if (choices.length < 2) continue;

    const correctIndex = asFiniteInt(
      readField(item, [
        "correctIndex",
        "correctindex",
        "correct_answer_index",
        "correctAnswerIndex",
        "answerIndex",
        "answerindex",
      ]),
      -1
    );
    if (correctIndex < 0 || correctIndex >= choices.length) continue;

    const tts = normalizeQuestionTtsMetadata(item, choices.length);

    out.push({
      questionId,
      questionText,
      choices,
      correctIndex,
      points: 100,
      tts,
    });
  }

  return out;
}

function readField(record, keys) {
  if (!isRecord(record)) return undefined;
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }
  return undefined;
}

function readChoicesField(record) {
  const raw = readField(record, ["choices", "choices", "options", "answers", "alternatives"]);
  if (Array.isArray(raw)) return raw;
  if (isRecord(raw)) return Object.values(raw);
  return [];
}

function normalizeQuestionTtsMetadata(record, choiceCount) {
  if (!isRecord(record)) return null;
  const tts = isRecord(record.tts) ? record.tts : {};
  const questionUrl = sanitizeMediaUrl(
    readField(record, ["questionTtsUrl", "question_tts_url", "questionTts"]) ||
      tts.questionUrl ||
      extractTtsUrlFromValue(tts.question)
  );

  let sourceChoiceUrls = [];
  const directChoiceUrls = readField(record, [
    "choiceTtsUrls",
    "choice_tts_urls",
    "choiceTts",
    "choicesTts",
  ]);
  if (Array.isArray(directChoiceUrls)) {
    sourceChoiceUrls = directChoiceUrls;
  } else if (Array.isArray(tts.choiceUrls)) {
    sourceChoiceUrls = tts.choiceUrls;
  } else if (Array.isArray(tts.choices)) {
    sourceChoiceUrls = tts.choices;
  } else if (isRecord(tts.choices)) {
    sourceChoiceUrls = Object.values(tts.choices);
  }

  const totalChoices = Math.max(0, asFiniteInt(choiceCount, 0));
  const choiceUrls = [];
  for (let i = 0; i < totalChoices; i += 1) {
    choiceUrls.push(sanitizeMediaUrl(extractTtsUrlFromValue(sourceChoiceUrls[i])));
  }

  const hasQuestion = !!questionUrl;
  const hasChoice = choiceUrls.some((value) => !!value);
  if (!hasQuestion && !hasChoice) return null;

  return {
    questionUrl,
    choiceUrls,
  };
}

function extractTtsUrlFromValue(value) {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return "";
  return (
    value.url ||
    value.audioUrl ||
    value.ttsUrl ||
    value.src ||
    value.file ||
    value.pregenUrl ||
    ""
  );
}

function extractArrayField(data, keys) {
  if (Array.isArray(data)) return data;
  if (!isRecord(data)) return [];

  for (const key of keys) {
    if (Array.isArray(data[key])) {
      return data[key];
    }
  }

  return [];
}

async function fetchTriviaPayload(paths) {
  if (!TRIVIA_CONTENT_BASE_URL) {
    throw new Error("missing_trivia_base_url");
  }

  const headers = {};
  if (TRIVIA_CONTENT_API_KEY) {
    headers["x-api-key"] = TRIVIA_CONTENT_API_KEY;
  }

  let lastError = null;
  for (const route of paths) {
    const url = `${TRIVIA_CONTENT_BASE_URL}${route.startsWith("/") ? route : `/${route}`}`;
    try {
      const data = await fetchJsonWithTimeout(url, {
        headers,
        timeoutMs: TRIVIA_FETCH_TIMEOUT_MS,
      });
      return data;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("trivia_fetch_failed");
}

async function fetchJsonWithTimeout(url, options = {}) {
  const timeoutMs = clampInt(options.timeoutMs || 5000, 500, 30000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();

  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: options.headers || {},
      body: options.body,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `http_${response.status}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function parseOriginList(value) {
  const set = new Set();
  String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => set.add(item));

  if (set.size === 0) {
    set.add("*");
  }

  return set;
}

function parseBooleanFlag(value) {
  if (value === true || value === 1) return true;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function parseHostList(value) {
  const set = new Set();
  String(value)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .forEach((item) => set.add(item));
  return set;
}

function isAllowedAudioProxyUrl(value) {
  if (typeof value !== "string" || !value) return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    return AUDIO_PROXY_ALLOWED_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function getToken(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function parseCursor(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function sanitizeType(value) {
  if (value === "state" || value === "event") return value;
  return "action";
}

function sanitizeAction(value) {
  if (typeof value !== "string" || value.trim() === "") return "UNKNOWN_ACTION";
  return value.trim().toUpperCase().replace(/[^A-Z0-9_:\-.]/g, "_").slice(0, 64);
}

function sanitizeId(value) {
  if (typeof value !== "string") return "";
  const cleaned = value.trim().replace(/[^a-zA-Z0-9_:\-.]/g, "");
  return cleaned.slice(0, 64);
}

function sanitizeSimple(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/[^a-z0-9_:\-.]/g, "").slice(0, 32);
}

function sanitizeGaMeasurementId(value) {
  if (typeof value !== "string") return "";
  const cleaned = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 32);
  if (!/^G-[A-Z0-9]{4,30}$/.test(cleaned)) return "";
  return cleaned;
}

function sanitizeCategoryId(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/[^a-z0-9_:\-.]/g, "").slice(0, 64);
}

function sanitizeCategoryName(value) {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function sanitizeDisplayName(value) {
  if (typeof value !== "string") return "Player";
  const cleaned = value
    .trim()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 32);
  return cleaned || "Player";
}

function sanitizeTitle(value) {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function sanitizeQuestionId(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/[^a-zA-Z0-9_:\-.]/g, "").slice(0, 64);
}

function sanitizeQuestionText(value) {
  const text = coerceText(value);
  if (!text) return "";
  return text
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 280);
}

function sanitizeChoiceText(value) {
  const text = coerceText(value);
  if (!text) return "";
  return text
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function sanitizeMediaUrl(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) return "";
  return trimmed.slice(0, 2048);
}

function coerceText(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (isRecord(value)) {
    const picked =
      value.text ??
      value.label ??
      value.title ??
      value.name ??
      value.value ??
      value.answer ??
      value.choice ??
      "";
    if (picked !== value) return coerceText(picked);
  }
  return "";
}

function sanitizeParticipantId(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/[^a-zA-Z0-9_:\-.]/g, "").slice(0, 64);
}

function sanitizeClientVersion(value) {
  if (typeof value !== "string") return "";
  const cleaned = value.trim().replace(/[^0-9]/g, "");
  if (!cleaned) return "";
  return cleaned.slice(0, 4);
}

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function nowIso() {
  return new Date().toISOString();
}

function clampInt(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(Math.max(Math.floor(n), min), max);
}

function asFiniteInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function makeId(size) {
  const needed = Math.ceil(size * 0.75) + 2;
  return crypto.randomBytes(needed).toString("base64url").slice(0, size);
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a), "utf8");
  const right = Buffer.from(String(b), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function toUtf8(raw) {
  if (typeof raw === "string") return raw;
  if (Buffer.isBuffer(raw)) return raw.toString("utf8");
  if (Array.isArray(raw)) return Buffer.concat(raw).toString("utf8");
  return "";
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function writeJsonAtomically(filepath, value) {
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  const tmp = `${filepath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value), "utf8");
  fs.renameSync(tmp, filepath);
}
