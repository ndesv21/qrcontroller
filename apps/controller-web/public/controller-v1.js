(() => {
  "use strict";

  const statusEl = document.getElementById("status");
  const sessionIdEl = document.getElementById("session-id");
  const transcriptEl = document.getElementById("transcript");
  const micButtonEl = document.getElementById("mic-button");

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
    speechApiBase: "",
    speechApiKey: "",
    sttLanguageCode: "en-US",
    sttBusy: false,
    recording: false,
    recordStartedAt: 0,
    activePointerId: null,
    holdRequested: false,
    capture: {
      stream: null,
      audioContext: null,
      source: null,
      processor: null,
      sink: null,
      chunks: [],
      sampleRate: 16000,
    },
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
    if (!micButtonEl) return;

    if (window.PointerEvent) {
      micButtonEl.addEventListener("pointerdown", onPressStart);
      micButtonEl.addEventListener("pointerup", onPressEnd);
      micButtonEl.addEventListener("pointercancel", onPressEnd);
      micButtonEl.addEventListener("lostpointercapture", onPressEnd);
    } else {
      micButtonEl.addEventListener("mousedown", onPressStart);
      micButtonEl.addEventListener("mouseup", onPressEnd);
      micButtonEl.addEventListener("mouseleave", onPressEnd);
      micButtonEl.addEventListener(
        "touchstart",
        (event) => {
          event.preventDefault();
          onPressStart(event);
        },
        { passive: false }
      );
      micButtonEl.addEventListener("touchend", onPressEnd, { passive: false });
      micButtonEl.addEventListener("touchcancel", onPressEnd, { passive: false });
    }

    micButtonEl.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });
  }

  async function joinSession() {
    setStatus("Joining session...");

    try {
      const response = await fetch(
        hubUrl(`/api/v1/sessions/${encodeURIComponent(state.sessionId)}/join`),
        {
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
        }
      );

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "join_failed");
      }

      applySpeechConfig(data.session);

      state.controllerToken = data.controllerToken || state.joinToken;
      setStatus("Connected. Opening live channel...");
      openSocket(data.wsUrl || `${state.hubBase}/ws`);
    } catch (err) {
      setStatus(`Join failed: ${String(err.message || err)}`, true);
      scheduleReconnect();
    }
  }

  function applySpeechConfig(session) {
    const metadata = session && session.metadata ? session.metadata : {};
    const speechApiBase = sanitizeSpeechBase(metadata.speechApiBase || "");

    state.speechApiBase = speechApiBase;
    state.speechApiKey = typeof metadata.speechApiKey === "string" ? metadata.speechApiKey : "";
    state.sttLanguageCode = typeof metadata.sttLanguageCode === "string" && metadata.sttLanguageCode
      ? metadata.sttLanguageCode
      : "en-US";

    if (!state.speechApiBase) {
      setStatus("Connected, but speech API metadata is missing.", true);
      return;
    }

    setStatus("Ready. Hold the button to speak.");
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
        if (state.speechApiBase) {
          setStatus("Ready. Hold the button to speak.");
        }
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
      applySpeechConfig(message.session || {});
      return;
    }

    if (message.type === "event" && message.event && message.event.fromRole === "host") {
      const payload = message.event.payload || {};
      if (typeof payload.status === "string" && payload.status) {
        setStatus(payload.status);
      }
    }
  }

  async function onPressStart(event) {
    event.preventDefault();

    if (state.sttBusy || state.recording) return;

    if (!state.speechApiBase) {
      setStatus("Speech API is not configured for this session.", true);
      return;
    }

    const ws = state.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setStatus("Not connected yet. Reconnecting...");
      scheduleReconnect();
      return;
    }

    state.holdRequested = true;

    if (event.pointerId !== undefined && micButtonEl && micButtonEl.setPointerCapture) {
      try {
        micButtonEl.setPointerCapture(event.pointerId);
      } catch {
        // no-op
      }
      state.activePointerId = event.pointerId;
    }

    setMicPressed(true);
    setTranscript("Listening...");

    try {
      await startCapture();
      if (!state.holdRequested) {
        await teardownCapture();
        setMicPressed(false);
        setTranscript("...");
        return;
      }
      state.recording = true;
      state.recordStartedAt = Date.now();
      setStatus("Listening...");
    } catch (err) {
      state.holdRequested = false;
      setMicPressed(false);
      setStatus(`Mic error: ${String(err.message || err)}`, true);
      teardownCapture();
    }
  }

  function onPressEnd(event) {
    if (event) {
      event.preventDefault();
    }

    if (
      event &&
      event.pointerId !== undefined &&
      state.activePointerId !== null &&
      event.pointerId !== state.activePointerId
    ) {
      return;
    }

    state.activePointerId = null;
    state.holdRequested = false;

    if (!state.recording) {
      setMicPressed(false);
      return;
    }

    state.recording = false;
    setMicPressed(false);
    finalizeCapture();
  }

  async function startCapture() {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
      throw new Error("Microphone is not supported on this browser");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error("Audio context is not supported");
    }

    const audioContext = new AudioContextCtor();
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    const sink = audioContext.createGain();
    sink.gain.value = 0;

    state.capture.stream = stream;
    state.capture.audioContext = audioContext;
    state.capture.source = source;
    state.capture.processor = processor;
    state.capture.sink = sink;
    state.capture.chunks = [];
    state.capture.sampleRate = Math.round(audioContext.sampleRate || 16000);

    processor.onaudioprocess = (audioEvent) => {
      if (!state.recording) return;
      const channel = audioEvent.inputBuffer.getChannelData(0);
      state.capture.chunks.push(new Float32Array(channel));
    };

    source.connect(processor);
    processor.connect(sink);
    sink.connect(audioContext.destination);
  }

  async function finalizeCapture() {
    const durationMs = Date.now() - state.recordStartedAt;
    const sampleRate = state.capture.sampleRate || 16000;
    const samples = flattenFloat32(state.capture.chunks);

    await teardownCapture();

    const minSamples = Math.max(1200, Math.floor(sampleRate * 0.12));
    if (durationMs < 80 || samples.length < minSamples) {
      setStatus("Didn\'t catch that. Hold a bit longer.", true);
      setTranscript("...");
      return;
    }

    const pcmBytes = floatTo16BitPcmBytes(samples);
    const audioBase64 = arrayBufferToBase64(pcmBytes.buffer);

    state.sttBusy = true;
    setStatus("Processing...");

    try {
      const transcript = await requestTranscript(audioBase64, sampleRate);
      if (!transcript) {
        setStatus("No speech recognized. Try again.", true);
        setTranscript("...");
        return;
      }

      setTranscript(transcript);
      sendAction("VOICE_TEXT", { text: transcript });
      setStatus("Ready. Hold the button to speak.");
    } catch (err) {
      setStatus(`Speech failed: ${String(err.message || err)}`, true);
    } finally {
      state.sttBusy = false;
    }
  }

  async function requestTranscript(audioContentBase64, sampleRateHertz) {
    const headers = {
      "Content-Type": "application/json",
    };

    if (state.speechApiKey) {
      headers["x-api-key"] = state.speechApiKey;
    }

    const response = await fetch(`${state.speechApiBase}/voice/stt`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        audioContentBase64,
        encoding: "LINEAR16",
        sampleRateHertz,
        languageCode: state.sttLanguageCode || "en-US",
        enablePunctuation: true,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `stt_http_${response.status}`);
    }

    if (!data.ok) {
      throw new Error(data.error || "stt_failed");
    }

    return typeof data.transcript === "string" ? data.transcript.trim() : "";
  }

  function sendAction(action, payload) {
    const ws = state.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setStatus("Connection lost. Reconnecting...");
      scheduleReconnect();
      return;
    }

    ws.send(
      JSON.stringify({
        v: "1.0",
        type: "action",
        id: makeClientId(),
        action,
        payload: payload || {},
        sentAt: new Date().toISOString(),
      })
    );

    if (navigator.vibrate) {
      navigator.vibrate(16);
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

    const waitMs = Math.min(8000, 900 + state.reconnectAttempts * 700);
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

    const sessionId =
      pathParts[0] === "join" && pathParts[1]
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

  function sanitizeSpeechBase(value) {
    try {
      const u = new URL(value);
      const path = u.pathname && u.pathname !== "/" ? u.pathname.replace(/\/+$/, "") : "";
      return `${u.protocol}//${u.host}${path}`;
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

  function flattenFloat32(chunks) {
    if (!Array.isArray(chunks) || chunks.length === 0) {
      return new Float32Array(0);
    }

    let total = 0;
    for (let i = 0; i < chunks.length; i += 1) {
      total += chunks[i].length;
    }

    const out = new Float32Array(total);
    let offset = 0;
    for (let i = 0; i < chunks.length; i += 1) {
      out.set(chunks[i], offset);
      offset += chunks[i].length;
    }

    return out;
  }

  function floatTo16BitPcmBytes(floatSamples) {
    const bytes = new Uint8Array(floatSamples.length * 2);
    const view = new DataView(bytes.buffer);

    for (let i = 0; i < floatSamples.length; i += 1) {
      const s = Math.max(-1, Math.min(1, floatSamples[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }

    return bytes;
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = "";

    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }

    return btoa(binary);
  }

  async function teardownCapture() {
    const capture = state.capture;

    if (capture.source) {
      try {
        capture.source.disconnect();
      } catch {
        // no-op
      }
      capture.source = null;
    }

    if (capture.processor) {
      try {
        capture.processor.disconnect();
      } catch {
        // no-op
      }
      capture.processor.onaudioprocess = null;
      capture.processor = null;
    }

    if (capture.sink) {
      try {
        capture.sink.disconnect();
      } catch {
        // no-op
      }
      capture.sink = null;
    }

    if (capture.stream) {
      capture.stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // no-op
        }
      });
      capture.stream = null;
    }

    if (capture.audioContext) {
      try {
        await capture.audioContext.close();
      } catch {
        // no-op
      }
      capture.audioContext = null;
    }
  }

  function setStatus(text, isError) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.toggle("is-error", !!isError);
  }

  function setTranscript(text) {
    if (!transcriptEl) return;
    transcriptEl.textContent = text;
  }

  function setMicPressed(pressed) {
    if (!micButtonEl) return;
    micButtonEl.classList.toggle("is-pressed", !!pressed);
  }

  function makeClientId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    return `c_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  }

  window.addEventListener("beforeunload", async () => {
    clearReconnectTimer();
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      try {
        state.ws.close();
      } catch {
        // no-op
      }
    }
    await teardownCapture();
  });

  init();
})();
