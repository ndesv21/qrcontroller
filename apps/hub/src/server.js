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
const ROOM_CODE_SIZE = 4;
const HOST_STALE_MS = parseInt(process.env.HOST_STALE_MS || "12000", 10);
const MAX_CONTROLLERS_PER_SESSION = clampInt(process.env.MAX_CONTROLLERS_PER_SESSION || "1", 1, 10);
const CODE_JOIN_WINDOW_MS = parseInt(process.env.CODE_JOIN_WINDOW_MS || "60000", 10);
const CODE_JOIN_MAX_ATTEMPTS = parseInt(process.env.CODE_JOIN_MAX_ATTEMPTS || "30", 10);

const CONTROLLER_BASE_URL = stripTrailingSlash(process.env.CONTROLLER_BASE_URL || "http://localhost:3000");
const HUB_PUBLIC_BASE_URL = stripTrailingSlash(process.env.HUB_PUBLIC_BASE_URL || `http://localhost:${PORT}`);
const CORS_ORIGINS = parseOriginList(process.env.CORS_ORIGINS || "*");
const CONTROLLER_PUBLIC_DIR = path.resolve(__dirname, "..", "..", "controller-web", "public");
const CONTROLLER_JOIN_HTML = path.join(CONTROLLER_PUBLIC_DIR, "join.html");
const CONTROLLER_INDEX_HTML = path.join(CONTROLLER_PUBLIC_DIR, "index.html");

const app = express();
const sessions = new Map();
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

  app.get("/", (req, res) => {
    res.sendFile(CONTROLLER_INDEX_HTML);
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

server.listen(PORT, () => {
  console.log(`[hub] listening on ${PORT}`);
  console.log(`[hub] controller base ${CONTROLLER_BASE_URL}`);
  console.log(`[hub] public hub base ${HUB_PUBLIC_BASE_URL}`);
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
  return `${CONTROLLER_BASE_URL}/join/${encodeURIComponent(session.id)}?t=${encodeURIComponent(session.joinToken)}&hub=${hub}&cv=${encodeURIComponent(session.clientVersion)}&rc=${rc}`;
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

function schedulePersist() {
  if (!SESSION_STORE_FILE) return;

  if (persistState.timer) {
    clearTimeout(persistState.timer);
  }

  persistState.timer = setTimeout(() => {
    persistState.timer = null;
    flushPersist();
  }, 150);
}

function flushPersist() {
  if (!SESSION_STORE_FILE) return;

  const serialized = [];
  for (const session of sessions.values()) {
    serialized.push({
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
    fs.mkdirSync(path.dirname(SESSION_STORE_FILE), { recursive: true });
    const tmp = `${SESSION_STORE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(serialized), "utf8");
    fs.renameSync(tmp, SESSION_STORE_FILE);
  } catch (err) {
    console.warn(`[hub] failed to persist sessions: ${String(err.message || err)}`);
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
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let out = "";
  for (let i = 0; i < ROOM_CODE_SIZE; i += 1) {
    const idx = crypto.randomInt(0, alphabet.length);
    out += alphabet[idx];
  }
  return out;
}

function sanitizeRoomCode(value) {
  if (typeof value !== "string") return "";
  return value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, ROOM_CODE_SIZE);
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
