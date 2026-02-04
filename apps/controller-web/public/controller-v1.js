(() => {
  "use strict";

  const statusEl = document.getElementById("status");
  const sessionIdEl = document.getElementById("session-id");
  const roomCodeEl = document.getElementById("room-code");
  const transcriptEl = document.getElementById("transcript");
  const micButtonEl = document.getElementById("mic-button");
  const micLabelEl = document.getElementById("mic-label");

  const joinToolsEl = document.getElementById("join-tools");
  const roomCodeInputEl = document.getElementById("room-code-input");
  const codeJoinButtonEl = document.getElementById("code-join-button");
  const scanButtonEl = document.getElementById("scan-button");
  const joinHelpEl = document.getElementById("join-help");
  const scanPanelEl = document.getElementById("scan-panel");
  const scanVideoEl = document.getElementById("scan-video");
  const scanStopButtonEl = document.getElementById("scan-stop-button");

  const CUE_SOUND_PATHS = {
    start: "/sounds/startrecording.m4a",
    stop: "/sounds/stoprecording.m4a",
  };
  const DISCOVERY_PROMPT = "Scan QR code with camera or add room code:";

  const state = {
    hubBase: "",
    sessionId: "",
    roomCode: "",
    joinToken: "",
    controllerToken: "",
    clientVersion: "1",
    clientId: makeClientId(),
    ws: null,
    reconnectAttempts: 0,
    reconnectTimer: null,
    retryUiTimer: null,
    speechApiBase: "",
    speechApiKey: "",
    sttLanguageCode: "en-US",
    sttBusy: false,
    sttWarmStarted: false,
    recording: false,
    recordStartedAt: 0,
    activePointerId: null,
    holdRequested: false,
    connected: false,
    uiMode: "",
    cueSounds: {
      start: null,
      stop: null,
    },
    scanner: {
      stream: null,
      detector: null,
      running: false,
      loopTimer: null,
      busy: false,
    },
    capture: {
      ready: false,
      starting: null,
      stream: null,
      audioContext: null,
      source: null,
      processor: null,
      sink: null,
      chunks: [],
      sampleRate: 16000,
      releaseTimer: null,
    },
  };

  function init() {
    const config = parseConfigFromUrl();
    state.hubBase = config.hubBase || sanitizeHubBase(window.location.origin);
    state.sessionId = config.sessionId;
    state.joinToken = config.joinToken;
    state.clientVersion = config.clientVersion;
    state.roomCode = config.roomCode;

    bindUiEvents();
    initCueSounds();

    setMicState("idle");
    setTranscript("...");
    setUiMode("discovery");
    showJoinTools();
    updateSessionMeta();

    if (state.sessionId && state.joinToken && state.hubBase) {
      joinSession();
      return;
    }

    enterDiscoveryMode(DISCOVERY_PROMPT, false, true);
  }

  function bindUiEvents() {
    document.addEventListener("selectstart", (event) => {
      event.preventDefault();
    });

    if (roomCodeInputEl) {
      roomCodeInputEl.addEventListener("input", () => {
        roomCodeInputEl.value = sanitizeRoomCode(roomCodeInputEl.value);
      });
      roomCodeInputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onJoinByCode();
        }
      });
    }

    if (codeJoinButtonEl) {
      codeJoinButtonEl.addEventListener("click", () => {
        onJoinByCode();
      });
    }

    if (scanButtonEl) {
      scanButtonEl.addEventListener("click", () => {
        startScanFlow();
      });
    }

    if (scanStopButtonEl) {
      scanStopButtonEl.addEventListener("click", () => {
        stopScanFlow();
      });
    }

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

  function initCueSounds() {
    state.cueSounds.start = createCueSound(CUE_SOUND_PATHS.start);
    state.cueSounds.stop = createCueSound(CUE_SOUND_PATHS.stop);
  }

  function createCueSound(src) {
    try {
      const audio = new Audio(src);
      audio.preload = "auto";
      audio.volume = 0.92;
      audio.playsInline = true;
      return audio;
    } catch {
      return null;
    }
  }

  function playCueSound(kind) {
    const audio = state.cueSounds[kind];
    if (!audio) return;

    try {
      audio.pause();
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          // Best effort on iOS/web autoplay restrictions.
        });
      }
    } catch {
      // no-op
    }
  }

  async function onJoinByCode() {
    if (!roomCodeInputEl) return;

    const code = sanitizeRoomCode(roomCodeInputEl.value || "");
    roomCodeInputEl.value = code;

    if (code.length !== 4) {
      setStatus("Enter the 4-letter room code.", true);
      return;
    }

    await joinSessionByCode(code);
  }

  async function joinSessionByCode(code) {
    const hubBase = state.hubBase || sanitizeHubBase(window.location.origin);
    if (!hubBase) {
      setStatus("Missing hub URL.", true);
      return;
    }

    setStatus("Joining room...");

    try {
      const response = await fetch(`${hubBase}/api/v1/sessions/join-by-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code,
          clientVersion: state.clientVersion,
          clientInfo: {
            userAgent: navigator.userAgent,
            language: navigator.language,
          },
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok || !data.session) {
        throw new Error(data.error || "join_by_code_failed");
      }

      state.hubBase = sanitizeHubBase(data.hubBase || hubBase);
      state.sessionId = data.session.id || "";
      state.roomCode = sanitizeRoomCode(data.session.roomCode || code);
      state.joinToken = data.joinToken || data.controllerToken || "";
      state.controllerToken = data.controllerToken || state.joinToken;

      if (!state.sessionId || !state.controllerToken) {
        throw new Error("invalid_join_payload");
      }

      updateSessionMeta();
      applySessionMeta(data.session || {});
      stopScanFlow();
      updateUrlWithSession();
      openSocket(data.wsUrl || `${state.hubBase}/ws`);
    } catch (err) {
      setStatus(`Join failed: ${String(err.message || err)}`, true);
    }
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

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        const errCode = String(data.error || "join_failed");
        if (errCode === "session_closed" || errCode === "session_not_found") {
          enterDiscoveryMode("Session ended. Scan QR code with camera or add room code.", true, true);
          return;
        }
        throw new Error(errCode);
      }

      state.controllerToken = data.controllerToken || state.joinToken;
      state.joinToken = data.joinToken || state.joinToken || state.controllerToken;

      applySessionMeta(data.session || {});
      updateSessionMeta();

      setStatus("Connected. Opening live channel...");
      openSocket(data.wsUrl || `${state.hubBase}/ws`);
    } catch (err) {
      setStatus(`Join failed: ${String(err.message || err)}`, true);
      scheduleReconnect();
    }
  }

  function applySessionMeta(session) {
    const metadata = session && session.metadata ? session.metadata : {};
    const speechApiBase = sanitizeSpeechBase(
      metadata.speechApiBase || metadata.speechapibase || metadata.speech_api_base || ""
    );
    const speechApiKey =
      metadata.speechApiKey || metadata.speechapikey || metadata.speech_api_key || "";
    const sttLanguageCode =
      metadata.sttLanguageCode || metadata.sttlanguagecode || metadata.stt_language_code || "en-US";

    state.speechApiBase = speechApiBase;
    state.speechApiKey = typeof speechApiKey === "string" ? speechApiKey : "";
    state.sttLanguageCode =
      typeof sttLanguageCode === "string" && sttLanguageCode ? sttLanguageCode : "en-US";

    const roomCode = sanitizeRoomCode(session && session.roomCode ? session.roomCode : "");
    if (roomCode) {
      state.roomCode = roomCode;
      updateSessionMeta();
    }

    if (!state.speechApiBase) {
      setStatus("Connected, but speech API metadata is missing.", true);
      return;
    }

    setStatus("Ready. Hold the button to speak.");
    startSttWarmup();
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
        state.connected = true;
        state.reconnectAttempts = 0;
        clearReconnectTimer();
        setUiMode("connected");
        hideJoinTools();
        if (state.speechApiBase) {
          setStatus("Ready. Hold the button to speak.");
        }
      });

      ws.addEventListener("message", (event) => {
        handleSocketMessage(event.data);
      });

      ws.addEventListener("close", (event) => {
        state.connected = false;
        setUiMode("discovery");
        showJoinTools();
        const reason = String(event.reason || "").toLowerCase();
        if (
          reason.includes("host_disconnected") ||
          reason.includes("session_closed") ||
          reason.includes("closed_by_host")
        ) {
          enterDiscoveryMode("TV disconnected. Scan QR code with camera or add room code.", true, true);
          return;
        }

        setStatus("Connection closed. Reconnecting...");
        scheduleReconnect();
      });

      ws.addEventListener("error", () => {
        state.connected = false;
        setUiMode("discovery");
        showJoinTools();
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
      applySessionMeta(message.session || {});
      return;
    }

    if (message.type === "presence" && message.actor && message.actor.role === "host" && message.actor.state === "left") {
      enterDiscoveryMode("TV disconnected. Scan QR code with camera or add room code.", true, true);
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

    setMicState("arming", "PREPARING...");
    setStatus("Preparing microphone...");
    setTranscript("...");

    try {
      await ensureCaptureReady();
      if (!state.holdRequested) {
        setMicState("idle");
        return;
      }

      state.recording = true;
      state.recordStartedAt = Date.now();
      state.capture.chunks = [];
      playCueSound("start");
      setMicState("listening");
      setStatus("Listening...");
      setTranscript("Listening...");
    } catch (err) {
      state.holdRequested = false;
      setStatus(`Mic error: ${String(err.message || err)}`, true);
      flashRetryPrompt();
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
      if (!state.sttBusy) {
        setMicState("idle");
      }
      return;
    }

    state.recording = false;
    playCueSound("stop");
    setMicState("processing", "...");
    finalizeCapture();
  }

  async function ensureCaptureReady() {
    if (state.capture.ready) {
      cancelCaptureRelease();
      return;
    }

    if (state.capture.starting) {
      await state.capture.starting;
      cancelCaptureRelease();
      return;
    }

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
      throw new Error("Microphone is not supported on this browser");
    }

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error("Audio context is not supported");
    }

    state.capture.starting = (async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      const audioContext = new AudioContextCtor();
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      const sink = audioContext.createGain();
      sink.gain.value = 0;

      processor.onaudioprocess = (audioEvent) => {
        if (!state.recording) return;
        const channel = audioEvent.inputBuffer.getChannelData(0);
        state.capture.chunks.push(new Float32Array(channel));
      };

      source.connect(processor);
      processor.connect(sink);
      sink.connect(audioContext.destination);

      state.capture.stream = stream;
      state.capture.audioContext = audioContext;
      state.capture.source = source;
      state.capture.processor = processor;
      state.capture.sink = sink;
      state.capture.sampleRate = Math.round(audioContext.sampleRate || 16000);
      state.capture.ready = true;
    })();

    try {
      await state.capture.starting;
    } finally {
      state.capture.starting = null;
    }

    cancelCaptureRelease();
  }

  async function finalizeCapture() {
    const durationMs = Date.now() - state.recordStartedAt;
    const sampleRate = state.capture.sampleRate || 16000;
    const samples = flattenFloat32(state.capture.chunks);

    const minSamples = Math.max(1200, Math.floor(sampleRate * 0.12));
    if (durationMs < 80 || samples.length < minSamples) {
      setStatus("Didn't catch that. Try again.", true);
      setTranscript("...");
      flashRetryPrompt();
      scheduleCaptureRelease();
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
        flashRetryPrompt();
        return;
      }

      setTranscript(transcript);
      sendAction("VOICE_TEXT", { text: transcript });
      setMicState("idle");
      setStatus("Ready. Hold the button to speak.");
    } catch (err) {
      setStatus(`Speech failed: ${String(err.message || err)}`, true);
      flashRetryPrompt();
    } finally {
      state.sttBusy = false;
      scheduleCaptureRelease();
    }
  }

  function flashRetryPrompt() {
    setMicState("retry", "TRY AGAIN");
    clearRetryUiTimer();
    state.retryUiTimer = setTimeout(() => {
      state.retryUiTimer = null;
      if (!state.recording && !state.sttBusy) {
        setMicState("idle");
      }
    }, 500);
  }

  function clearRetryUiTimer() {
    if (!state.retryUiTimer) return;
    clearTimeout(state.retryUiTimer);
    state.retryUiTimer = null;
  }

  function setMicState(name, label) {
    if (!micButtonEl) return;

    micButtonEl.classList.remove("is-pressed", "is-arming", "is-processing", "is-retry");

    if (name === "listening") {
      micButtonEl.classList.add("is-pressed");
      setMicLabel("");
      return;
    }

    if (name === "arming") {
      micButtonEl.classList.add("is-arming");
      setMicLabel(label || "PREPARING...");
      return;
    }

    if (name === "processing") {
      micButtonEl.classList.add("is-processing");
      setMicLabel(label || "...");
      return;
    }

    if (name === "retry") {
      micButtonEl.classList.add("is-retry");
      setMicLabel(label || "TRY AGAIN");
      return;
    }

    setMicLabel("");
  }

  function setMicLabel(text) {
    if (!micLabelEl) return;
    micLabelEl.textContent = text || "";
  }

  function startSttWarmup() {
    if (state.sttWarmStarted || !state.speechApiBase) return;
    state.sttWarmStarted = true;

    const silenceBytes = new Uint8Array(3200);
    const silenceBase64 = arrayBufferToBase64(silenceBytes.buffer);

    requestTranscript(silenceBase64, 16000)
      .then(() => {
        // warm-up only
      })
      .catch(() => {
        // best-effort warm-up; ignore errors
      });
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
      navigator.vibrate(14);
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
    if (!state.sessionId || !state.joinToken || !state.hubBase) return;

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

  async function startScanFlow() {
    if (state.scanner.running) return;

    if (!scanVideoEl || !scanPanelEl) {
      setStatus("Scanner UI missing.", true);
      return;
    }

    if (typeof window.BarcodeDetector !== "function") {
      setStatus("In-app QR scan is not supported on this browser. Use Camera app or room code.", true);
      if (joinHelpEl) {
        joinHelpEl.textContent = "Use your phone camera app or enter the 4-letter room code.";
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
        },
        audio: false,
      });

      state.scanner.stream = stream;
      state.scanner.detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      state.scanner.running = true;

      scanVideoEl.srcObject = stream;
      await scanVideoEl.play();

      scanPanelEl.hidden = false;
      setStatus("Scanning QR...");

      state.scanner.loopTimer = setInterval(() => {
        scanLoopTick();
      }, 250);
    } catch (err) {
      setStatus(`Camera error: ${String(err.message || err)}`, true);
    }
  }

  async function scanLoopTick() {
    if (!state.scanner.running || state.scanner.busy || !state.scanner.detector || !scanVideoEl) {
      return;
    }

    state.scanner.busy = true;
    try {
      const barcodes = await state.scanner.detector.detect(scanVideoEl);
      if (Array.isArray(barcodes) && barcodes.length > 0) {
        const raw = String(barcodes[0].rawValue || "").trim();
        if (raw) {
          stopScanFlow();
          handleScannedValue(raw);
        }
      }
    } catch {
      // ignore individual detect errors
    } finally {
      state.scanner.busy = false;
    }
  }

  function stopScanFlow() {
    if (state.scanner.loopTimer) {
      clearInterval(state.scanner.loopTimer);
      state.scanner.loopTimer = null;
    }

    if (state.scanner.stream) {
      state.scanner.stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // no-op
        }
      });
      state.scanner.stream = null;
    }

    state.scanner.running = false;
    state.scanner.busy = false;
    state.scanner.detector = null;

    if (scanVideoEl) {
      scanVideoEl.srcObject = null;
    }
    if (scanPanelEl) {
      scanPanelEl.hidden = true;
    }
  }

  function handleScannedValue(raw) {
    if (/^[a-z]{4}$/i.test(raw)) {
      joinSessionByCode(raw.toUpperCase());
      return;
    }

    try {
      const scannedUrl = new URL(raw);
      const pathParts = scannedUrl.pathname.split("/").filter(Boolean);
      const sessionId = pathParts[0] === "join" && pathParts[1] ? decodeURIComponent(pathParts[1]) : "";
      const joinToken = scannedUrl.searchParams.get("t") || "";
      const hubFromUrl = sanitizeHubBase(scannedUrl.searchParams.get("hub") || "");
      const clientVersion = scannedUrl.searchParams.get("cv") || "1";

      if (!sessionId || !joinToken) {
        setStatus("QR code is missing session info.", true);
        return;
      }

      state.sessionId = sessionId;
      state.joinToken = joinToken;
      state.clientVersion = clientVersion;
      if (hubFromUrl) {
        state.hubBase = hubFromUrl;
      }

      updateSessionMeta();
      updateUrlWithSession();
      joinSession();
    } catch {
      setStatus("Unsupported QR format. Use the room code fallback.", true);
    }
  }

  function enterDiscoveryMode(message, isError, clearSession) {
    state.connected = false;
    clearReconnectTimer();
    setUiMode("discovery");

    if (state.ws) {
      try {
        state.ws.close();
      } catch {
        // no-op
      }
    }
    state.ws = null;

    state.recording = false;
    state.holdRequested = false;
    state.sttBusy = false;
    setMicState("idle");
    setTranscript("...");
    setStatus(message || DISCOVERY_PROMPT, !!isError);

    if (clearSession) {
      state.sessionId = "";
      state.joinToken = "";
      state.controllerToken = "";
      state.roomCode = "";
      state.speechApiBase = "";
      state.speechApiKey = "";
      state.sttWarmStarted = false;
      updateUrlToDiscovery();
      updateSessionMeta();
    }

    showJoinTools();
  }

  function setUiMode(mode) {
    const nextMode = mode === "connected" ? "connected" : "discovery";
    if (state.uiMode === nextMode) return;

    state.uiMode = nextMode;
    document.body.classList.toggle("mode-connected", nextMode === "connected");
    document.body.classList.toggle("mode-discovery", nextMode === "discovery");
  }

  function showJoinTools() {
    if (joinToolsEl) {
      joinToolsEl.hidden = false;
    }
  }

  function hideJoinTools() {
    if (joinToolsEl) {
      joinToolsEl.hidden = true;
    }
  }

  function updateSessionMeta() {
    if (sessionIdEl) {
      sessionIdEl.textContent = `Session: ${state.sessionId || "-"}`;
    }
    if (roomCodeEl) {
      roomCodeEl.textContent = `Code: ${state.roomCode || "----"}`;
    }
  }

  function updateUrlWithSession() {
    if (!state.sessionId || !state.joinToken || !state.hubBase) return;
    try {
      const hub = encodeURIComponent(state.hubBase);
      const next = `/join/${encodeURIComponent(state.sessionId)}?t=${encodeURIComponent(
        state.joinToken
      )}&hub=${hub}&cv=${encodeURIComponent(state.clientVersion || "1")}`;
      window.history.replaceState({}, "", next);
    } catch {
      // no-op
    }
  }

  function updateUrlToDiscovery() {
    try {
      window.history.replaceState({}, "", "/join");
    } catch {
      // no-op
    }
  }

  function scheduleCaptureRelease() {
    cancelCaptureRelease();
    state.capture.releaseTimer = setTimeout(() => {
      state.capture.releaseTimer = null;
      if (!state.recording && !state.sttBusy) {
        teardownCapture();
      }
    }, 25000);
  }

  function cancelCaptureRelease() {
    if (!state.capture.releaseTimer) return;
    clearTimeout(state.capture.releaseTimer);
    state.capture.releaseTimer = null;
  }

  async function teardownCapture() {
    cancelCaptureRelease();

    if (state.capture.source) {
      try {
        state.capture.source.disconnect();
      } catch {
        // no-op
      }
      state.capture.source = null;
    }

    if (state.capture.processor) {
      try {
        state.capture.processor.disconnect();
      } catch {
        // no-op
      }
      state.capture.processor.onaudioprocess = null;
      state.capture.processor = null;
    }

    if (state.capture.sink) {
      try {
        state.capture.sink.disconnect();
      } catch {
        // no-op
      }
      state.capture.sink = null;
    }

    if (state.capture.stream) {
      state.capture.stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // no-op
        }
      });
      state.capture.stream = null;
    }

    if (state.capture.audioContext) {
      try {
        await state.capture.audioContext.close();
      } catch {
        // no-op
      }
      state.capture.audioContext = null;
    }

    state.capture.ready = false;
    state.capture.starting = null;
    state.capture.chunks = [];
    state.capture.sampleRate = 16000;
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
    const roomCode = sanitizeRoomCode(params.get("rc") || "");

    return {
      sessionId,
      joinToken,
      hubBase,
      clientVersion,
      roomCode,
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

  function sanitizeRoomCode(value) {
    if (typeof value !== "string") return "";
    return value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
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
      if (query[key] !== undefined && query[key] !== null && query[key] !== "") {
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

  function setStatus(text, isError) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.toggle("is-error", !!isError);
  }

  function setTranscript(text) {
    if (!transcriptEl) return;
    transcriptEl.textContent = text;
  }

  function makeClientId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    return `c_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  }

  window.addEventListener("beforeunload", async () => {
    clearReconnectTimer();
    clearRetryUiTimer();

    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      try {
        state.ws.close();
      } catch {
        // no-op
      }
    }

    stopScanFlow();
    await teardownCapture();
  });

  init();
})();
