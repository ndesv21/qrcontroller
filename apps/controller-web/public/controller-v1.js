(() => {
  "use strict";

  const statusEl = document.getElementById("status");
  const sessionIdEl = document.getElementById("session-id");
  const reconnectBtn = document.getElementById("reconnect-btn");
  const voiceForm = document.getElementById("voice-form");
  const voiceInput = document.getElementById("voice-input");

  const state = {
    hubBase: "",
    sessionId: "",
    joinToken: "",
    controllerToken: "",
    clientVersion: "1",
    clientId: makeClientId(),
    ws: null,
    reconnectAttempts: 0,
    reconnectTimer: null,
  };

  function init() {
    const config = parseConfigFromUrl();
    state.hubBase = config.hubBase;
    state.sessionId = config.sessionId;
    state.joinToken = config.joinToken;
    state.clientVersion = config.clientVersion;

    if (sessionIdEl) {
      sessionIdEl.textContent = state.sessionId || "missing";
    }

    bindUiEvents();

    if (!state.sessionId || !state.joinToken || !state.hubBase) {
      setStatus("Missing session/token/hub in URL", true);
      return;
    }

    joinSession();
  }

  function bindUiEvents() {
    const buttons = document.querySelectorAll("[data-action]");
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.getAttribute("data-action") || "";
        sendAction(action, {});
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.target && event.target.tagName === "INPUT") return;

      const keyMap = {
        ArrowUp: "NAV_UP",
        ArrowDown: "NAV_DOWN",
        ArrowLeft: "NAV_LEFT",
        ArrowRight: "NAV_RIGHT",
        Enter: "SELECT",
        Escape: "BACK",
      };

      const action = keyMap[event.key];
      if (!action) return;

      event.preventDefault();
      sendAction(action, { source: "keyboard" });
    });

    if (reconnectBtn) {
      reconnectBtn.addEventListener("click", () => {
        clearReconnectTimer();
        reconnectNow();
      });
    }

    if (voiceForm && voiceInput) {
      voiceForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const text = (voiceInput.value || "").trim();
        if (!text) return;
        sendAction("VOICE_TEXT", { text });
        voiceInput.value = "";
      });
    }
  }

  async function joinSession() {
    setStatus("Joining session...");

    try {
      const response = await fetch(hubUrl(`/api/v1/sessions/${encodeURIComponent(state.sessionId)}/join`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          joinToken: state.joinToken,
          clientVersion: state.clientVersion,
          clientInfo: {
            userAgent: navigator.userAgent,
            language: navigator.language,
          },
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "join_failed");
      }

      state.controllerToken = data.controllerToken || state.joinToken;
      setStatus("Connected. Opening live control channel...");
      openSocket(data.wsUrl || `${state.hubBase}/ws`);
    } catch (err) {
      setStatus(`Join failed: ${String(err.message || err)}`, true);
      scheduleReconnect();
    }
  }

  function openSocket(wsBase) {
    const wsUrl = buildWsUrl(wsBase, {
      sessionId: state.sessionId,
      role: "controller",
      token: state.controllerToken,
      clientId: state.clientId,
    });

    try {
      const ws = new WebSocket(wsUrl);
      state.ws = ws;

      ws.addEventListener("open", () => {
        state.reconnectAttempts = 0;
        setStatus("Live. Ready to control.");
      });

      ws.addEventListener("message", (event) => {
        handleSocketMessage(event.data);
      });

      ws.addEventListener("close", () => {
        setStatus("Connection closed. Reconnecting...");
        scheduleReconnect();
      });

      ws.addEventListener("error", () => {
        setStatus("Connection error. Reconnecting...");
        scheduleReconnect();
      });
    } catch (err) {
      setStatus(`Socket error: ${String(err.message || err)}`, true);
      scheduleReconnect();
    }
  }

  function handleSocketMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (!message) return;

    if (message.type === "hello") {
      setStatus("Paired with game session.");
      return;
    }

    if (message.type === "presence") {
      const actor = message.actor || {};
      setStatus(`Peer ${actor.role || "client"} ${actor.state || "updated"}.`);
      return;
    }

    if (message.type === "ack") {
      return;
    }

    if (message.type === "event" && message.event && message.event.fromRole === "host") {
      const action = message.event.action || "EVENT";
      setStatus(`Host event: ${action}`);
    }
  }

  function sendAction(action, payload) {
    if (!action) return;

    const ws = state.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setStatus("Not connected yet. Trying to reconnect...");
      scheduleReconnect();
      return;
    }

    const msg = {
      v: "1.0",
      type: "action",
      id: makeClientId(),
      action,
      payload: payload || {},
      sentAt: new Date().toISOString(),
    };

    ws.send(JSON.stringify(msg));

    if (navigator.vibrate) {
      navigator.vibrate(15);
    }
  }

  function reconnectNow() {
    if (!state.sessionId || !state.joinToken || !state.hubBase) return;

    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      try {
        state.ws.close();
      } catch {
        // no-op
      }
    }

    joinSession();
  }

  function scheduleReconnect() {
    clearReconnectTimer();

    const waitMs = Math.min(8000, 800 + state.reconnectAttempts * 700);
    state.reconnectAttempts += 1;

    state.reconnectTimer = setTimeout(() => {
      reconnectNow();
    }, waitMs);
  }

  function clearReconnectTimer() {
    if (!state.reconnectTimer) return;
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }

  function parseConfigFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const pathParts = window.location.pathname.split("/").filter(Boolean);

    const sessionId = pathParts[0] === "join" && pathParts[1]
      ? decodeURIComponent(pathParts[1])
      : params.get("session") || "";

    const joinToken = params.get("t") || "";
    const clientVersion = params.get("cv") || "1";
    const hubBase = sanitizeHubBase(params.get("hub") || window.location.origin);

    return {
      sessionId,
      joinToken,
      hubBase,
      clientVersion,
    };
  }

  function sanitizeHubBase(value) {
    try {
      const u = new URL(value);
      return `${u.protocol}//${u.host}`;
    } catch {
      return "";
    }
  }

  function hubUrl(path) {
    return `${state.hubBase.replace(/\/$/, "")}${path}`;
  }

  function buildWsUrl(base, query) {
    const normalized = sanitizeHubBase(base) || state.hubBase;
    const url = new URL(`${normalized.replace(/\/$/, "")}/ws`);

    if (url.protocol === "https:") {
      url.protocol = "wss:";
    } else {
      url.protocol = "ws:";
    }

    Object.keys(query).forEach((key) => {
      if (query[key] !== undefined && query[key] !== null) {
        url.searchParams.set(key, String(query[key]));
      }
    });

    return url.toString();
  }

  function setStatus(text, isError) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.style.color = isError ? "var(--danger)" : "var(--muted)";
  }

  function makeClientId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    return `c_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  }

  window.addEventListener("beforeunload", () => {
    clearReconnectTimer();
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      try {
        state.ws.close();
      } catch {
        // no-op
      }
    }
  });

  init();
})();
