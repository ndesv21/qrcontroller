(() => {
  "use strict";

  const statusEl = document.getElementById("status");
  const controllerShellEl = document.getElementById("controller-shell");
  const challengeShellEl = document.getElementById("challenge-shell");
  const sessionIdEl = document.getElementById("session-id");
  const roomCodeEl = document.getElementById("room-code");
  const transcriptEl = document.getElementById("transcript");
  const micButtonEl = document.getElementById("mic-button");
  const micImageEl = document.getElementById("mic-image");
  const micLabelEl = document.getElementById("mic-label");

  const joinToolsEl = document.getElementById("join-tools");
  const roomCodeInputEl = document.getElementById("room-code-input");
  const codeJoinButtonEl = document.getElementById("code-join-button");
  const scanButtonEl = document.getElementById("scan-button");
  const createChallengeButtonEl = document.getElementById("create-challenge-button");
  const joinHelpEl = document.getElementById("join-help");
  const scanPanelEl = document.getElementById("scan-panel");
  const scanVideoEl = document.getElementById("scan-video");
  const scanStopButtonEl = document.getElementById("scan-stop-button");

  const CUE_SOUND_PATHS = {
    start: "/sounds/startrecording.m4a",
    stop: "/sounds/stoprecording.m4a",
  };
  const ROOM_CODE_LENGTH = 4;
  const DISCOVERY_TITLE = "Enter game code or scan QR";
  const DISCOVERY_PROMPT = DISCOVERY_TITLE;
  const STORAGE_KEYS = {
    lastHubBase: "qrcontroller.lastHubBase",
    lastName: "qrcontroller.lastName",
    challengeName: "qrcontroller.challengeName",
    receiverName: "qrcontroller.receiverName",
    analyticsClientId: "qrcontroller.analyticsClientId",
  };
  const ROUTE_JOIN = "join";
  const ROUTE_CHALLENGE = "challenge";
  const MINI_ROUND_SIZE = 5;
  const QR_ASSET_BASE = "https://d3tswg7dtbmd2x.cloudfront.net/qr";
  const MIC_IMAGE_SRC = {
    idle: `${QR_ASSET_BASE}/mic.png`,
    pressed: `${QR_ASSET_BASE}/micpressed.png`,
  };
  const ROUND_AMOUNT_HOLD_MS = 2000;
  const ROUND_REVEAL_HOLD_MS = 500;
  const ROUND_FEEDBACK_HOLD_MS = 1200;
  const PLATFORM_COPY = {
    alexa: {
      title: "Alexa",
      icon: `${QR_ASSET_BASE}/alexa.png`,
      prompt: "To play on Alexa, just say:",
      command: '"Alexa, play Trivia Champions"',
    },
    fire: {
      title: "Fire TV",
      icon: `${QR_ASSET_BASE}/fire.png`,
      prompt: "To play on FireTV, just hold the microphone button and say:",
      command: '"Alexa, play Trivia Champions"',
    },
    roku: {
      title: "Roku",
      icon: `${QR_ASSET_BASE}/roku.png`,
      prompt: "To play on Roku hold the microphone button and say:",
      command: '"Open Trivia Champions"',
      extra: 'Or simply search for "Trivia Champions"',
    },
  };
  const CHALLENGE_TTS_ASSETS = {
    chooseCategory: "https://d3tswg7dtbmd2x.cloudfront.net/tts/en-us/en-us-chirp3-hd-laomedeia/63242e39f21a37c9993a9e00c769850072c16cc1d8d9d149ee4be28d8cdfc33d.mp3",
    for100: "https://d3tswg7dtbmd2x.cloudfront.net/tts/en-us/en-us-chirp3-hd-laomedeia/a9631edc39a6f9d434dce102b51dad8783681ca8c16e9e6b2950e047f364dcca.mp3",
    for200: "https://d3tswg7dtbmd2x.cloudfront.net/tts/en-us/en-us-chirp3-hd-laomedeia/124ae4f4607420f35baccb4a727ac0cfdc8cdef745197299d73213f3509e05a4.mp3",
    for300: "https://d3tswg7dtbmd2x.cloudfront.net/tts/en-us/en-us-chirp3-hd-laomedeia/e8016a5f96f15d1169a65fed1f4d0a7ed6dd88a3895be51aaa97eefc443d101f.mp3",
    correct: "https://d3tswg7dtbmd2x.cloudfront.net/tts/en-us/en-us-chirp3-hd-laomedeia/c8da718e5aa4740e90634bacd10520621728882c61cd787cdc2d8c8d03a93cc5.mp3",
    wrong: "https://d3tswg7dtbmd2x.cloudfront.net/tts/en-us/en-us-chirp3-hd-laomedeia/ace7e6f7c0443c73287a5e769e06f1afae2f2d0e959c21092a91058bd6863685.mp3",
    youWin: "https://d3tswg7dtbmd2x.cloudfront.net/tts/en-us/en-us-chirp3-hd-laomedeia/6192e57cb8e23667124d7cde529f682bc65684e550a8b36abb7fe1ad744cb560.mp3",
    youLose: "https://d3tswg7dtbmd2x.cloudfront.net/tts/en-us/en-us-chirp3-hd-laomedeia/bb9e9854c841162ab89d74f56867f78d80c9f95026186b356272ef3d34cef87f.mp3",
    tie: "https://d3tswg7dtbmd2x.cloudfront.net/tts/en-us/en-us-chirp3-hd-laomedeia/731bcf75761f26896305b24d98b666db928eef62abc37904dc9f2a150bb5f376.mp3",
    congratulations: "https://d3tswg7dtbmd2x.cloudfront.net/tts/en-us/en-us-chirp3-hd-laomedeia/b61e70662cf6105c7e502fab2e01c9b0c16672eb2a4df5442f2e6e9ece7a6787.mp3",
    greatGame: "https://d3tswg7dtbmd2x.cloudfront.net/tts/en-us/en-us-chirp3-hd-laomedeia/9b9e032c176cb626f3f5b120664bb64fda8a6701f9de62f9148d999c95cfa993.mp3",
  };
  const SELF_ORIGIN =
    typeof window !== "undefined" && window.location && /^https?:/i.test(window.location.origin || "")
      ? String(window.location.origin).replace(/\/+$/, "")
      : "";
  const CHALLENGE_LOOP_AUDIO = {
    gameplay: SELF_ORIGIN
      ? `${SELF_ORIGIN}/api/v1/audio/loop/gameplay`
      : "https://sotw-assets.s3.us-east-1.amazonaws.com/bgloop.mp3",
    menu: SELF_ORIGIN
      ? `${SELF_ORIGIN}/api/v1/audio/loop/menu`
      : "https://sotw-assets.s3.us-east-1.amazonaws.com/loop.mp3",
  };
  const CHALLENGE_USE_WEB_AUDIO_LOOP_GAIN = true;
  const CHALLENGE_USE_WEB_AUDIO_SPEECH = false;
  const CHALLENGE_BG_AUDIO_ENABLED = false;
  const CHALLENGE_LOOP_VOLUME = 0.1;
  const CHALLENGE_LOOP_DUCK_VOLUME = 0.03;
  const CHALLENGE_SPEECH_GAIN = 1.35;
  const CHALLENGE_SPEECH_VOLUME = 1;

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
    appMode: "controller",
    routeKind: ROUTE_JOIN,
    challengeId: "",
    forceCreateMode: false,
    challengeSpeech: {
      token: 0,
      activeAudio: null,
      loopAudio: null,
      loopKind: "off",
      loopDucked: false,
      mediaUnlocked: false,
      loopVolumeControlSupported: null,
      audioContext: null,
      masterGain: null,
      musicGain: null,
      speechGain: null,
      loopGameplayUrl: CHALLENGE_LOOP_AUDIO.gameplay,
      loopMenuUrl: CHALLENGE_LOOP_AUDIO.menu,
    },
    challengeFlow: {
      source: "",
      view: "",
      challenge: null,
      hostDraft: null,
      round: null,
      categories: [],
      categoryOffset: 0,
      participantId: "",
      participantName: "",
      lastShareUrl: "",
      loading: false,
      autoShareOnRender: false,
      roundTimer: null,
    },
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
    analytics: {
      enabled: false,
      initialized: false,
      measurementId: "",
      clientId: "",
      sessionId: "",
      micPressCount: 0,
    },
  };

  function init() {
    const config = parseConfigFromUrl();
    state.hubBase =
      config.hubBase || safeStorageGet(STORAGE_KEYS.lastHubBase) || sanitizeHubBase(window.location.origin);
    state.sessionId = config.sessionId;
    state.joinToken = config.joinToken;
    state.clientVersion = config.clientVersion;
    state.roomCode = config.roomCode;
    state.routeKind = config.routeKind;
    state.challengeId = config.challengeId;
    state.forceCreateMode = config.forceCreateMode;
    state.challengeSpeech.loopGameplayUrl =
      resolveLoopAudioUrl(config.challengeGameplayAudio || config.challengeLoopAudio || "", "gameplay") ||
      CHALLENGE_LOOP_AUDIO.gameplay;
    state.challengeSpeech.loopMenuUrl =
      resolveLoopAudioUrl(config.challengeMenuAudio || "", "menu") || CHALLENGE_LOOP_AUDIO.menu;
    initAnalytics(config);

    if (state.hubBase) {
      safeStorageSet(STORAGE_KEYS.lastHubBase, state.hubBase);
    }

    bindUiEvents();
    initCueSounds();

    setMicState("idle");
    setTranscript("...");
    setAppMode("controller");
    setUiMode("discovery");
    showJoinTools();
    updateSessionMeta();
    trackAnalyticsEvent("controller_app_open", {
      route_kind: state.routeKind,
      has_session_id: !!state.sessionId,
      has_challenge_id: !!state.challengeId,
      force_create_mode: !!state.forceCreateMode,
    });

    if (state.routeKind === ROUTE_CHALLENGE && state.challengeId) {
      loadChallengeReceiverFlow(state.challengeId);
      return;
    }

    if (state.forceCreateMode) {
      startMiniCreateFlow();
      return;
    }

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
    bindChallengeAudioUnlock();

    if (roomCodeInputEl) {
      roomCodeInputEl.addEventListener("input", () => {
        roomCodeInputEl.value = formatRoomCodeDisplay(sanitizeRoomCode(roomCodeInputEl.value));
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

    if (createChallengeButtonEl) {
      createChallengeButtonEl.addEventListener("click", () => {
        startMiniCreateFlow();
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

  function bindChallengeAudioUnlock() {
    const unlock = () => {
      resumeChallengeAudioEngine();
      unlockChallengeMediaPlayback();
      if (state.appMode === "challenge") {
        syncChallengeLoopAudio();
      }
    };
    document.addEventListener("pointerdown", unlock, { passive: true });
    document.addEventListener("touchstart", unlock, { passive: true });
    document.addEventListener("click", unlock, { passive: true });
  }

  function initAnalytics(config) {
    if (state.analytics.initialized) return;
    state.analytics.initialized = true;

    const pageConfig =
      typeof window !== "undefined" && isPlainObject(window.__QR_CONTROLLER_CONFIG)
        ? window.__QR_CONTROLLER_CONFIG
        : {};
    const measurementId = sanitizeGaMeasurementId(
      (config && config.gaMeasurementId) || pageConfig.gaMeasurementId || ""
    );
    if (!measurementId) return;

    const debugMode =
      pageConfig.gaDebug === true ||
      pageConfig.gaDebug === "1" ||
      pageConfig.gaDebug === 1 ||
      (config && config.gaDebug === true);

    state.analytics.enabled = true;
    state.analytics.measurementId = measurementId;
    state.analytics.clientId = getOrCreateAnalyticsClientId();
    state.analytics.sessionId = `s_${makeClientId().slice(0, 10)}`;

    if (!Array.isArray(window.dataLayer)) {
      window.dataLayer = [];
    }
    if (typeof window.gtag !== "function") {
      window.gtag = function gtag() {
        window.dataLayer.push(arguments);
      };
    }

    window.gtag("js", new Date());
    window.gtag("config", measurementId, {
      send_page_view: false,
      anonymize_ip: true,
      client_id: state.analytics.clientId,
      debug_mode: !!debugMode,
    });

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    script.setAttribute("data-qr-ga", measurementId);
    document.head.appendChild(script);
  }

  function getOrCreateAnalyticsClientId() {
    const existing = sanitizeInlineText(safeStorageGet(STORAGE_KEYS.analyticsClientId));
    if (existing) return existing.slice(0, 64);
    const value = `c_${makeClientId()}`;
    safeStorageSet(STORAGE_KEYS.analyticsClientId, value);
    return value;
  }

  function trackAnalyticsEvent(name, params) {
    if (!state.analytics.enabled || typeof window.gtag !== "function") return;
    const eventName = sanitizeAnalyticsEventName(name);
    if (!eventName) return;

    const payload = sanitizeAnalyticsParams(params || {});
    payload.app_surface = "qr_controller";
    payload.app_mode = state.appMode === "challenge" ? "challenge" : "controller";
    payload.connected_to_tv = state.connected ? 1 : 0;
    if (state.routeKind) {
      payload.route_kind = state.routeKind;
    }
    if (state.analytics.sessionId) {
      payload.analytics_session = state.analytics.sessionId;
    }

    try {
      window.gtag("event", eventName, payload);
    } catch {
      // no-op
    }
  }

  function sanitizeAnalyticsEventName(value) {
    if (typeof value !== "string") return "";
    const cleaned = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!cleaned) return "";
    return cleaned.slice(0, 40);
  }

  function sanitizeAnalyticsParams(raw) {
    if (!isPlainObject(raw)) return {};
    const out = {};
    const entries = Object.entries(raw).slice(0, 25);
    for (let i = 0; i < entries.length; i += 1) {
      const key = sanitizeAnalyticsEventName(entries[i][0]);
      if (!key) continue;
      const value = entries[i][1];
      if (typeof value === "number") {
        if (Number.isFinite(value)) {
          out[key] = Math.round(value * 1000) / 1000;
        }
        continue;
      }
      if (typeof value === "boolean") {
        out[key] = value ? 1 : 0;
        continue;
      }
      if (typeof value === "string") {
        const text = sanitizeInlineText(value);
        if (text) out[key] = text.slice(0, 120);
      }
    }
    return out;
  }

  function unlockChallengeMediaPlayback() {
    if (state.challengeSpeech.mediaUnlocked) return;
    try {
      const audio = new Audio(CUE_SOUND_PATHS.start);
      audio.preload = "auto";
      audio.playsInline = true;
      audio.volume = 0.0001;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.then === "function") {
        playPromise
          .then(() => {
            state.challengeSpeech.mediaUnlocked = true;
            try {
              audio.pause();
              audio.currentTime = 0;
            } catch {
              // no-op
            }
          })
          .catch(() => {
            // no-op
          });
      }
    } catch {
      // no-op
    }
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
    roomCodeInputEl.value = formatRoomCodeDisplay(code);

    if (code.length !== ROOM_CODE_LENGTH) {
      setStatus(`Enter the ${ROOM_CODE_LENGTH}-digit room code.`, true);
      trackAnalyticsEvent("tv_join_by_code_invalid", { code_length: code.length });
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
    trackAnalyticsEvent("tv_join_by_code_attempt", { code_length: code.length });

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
      if (state.hubBase) {
        safeStorageSet(STORAGE_KEYS.lastHubBase, state.hubBase);
      }
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
      setAppMode("controller");
      updateUrlWithSession();
      openSocket(data.wsUrl || `${state.hubBase}/ws`);
      trackAnalyticsEvent("tv_join_by_code_success", {
        has_session_id: !!state.sessionId,
        room_code_length: state.roomCode.length,
      });
    } catch (err) {
      setStatus(`Join failed: ${String(err.message || err)}`, true);
      trackAnalyticsEvent("tv_join_by_code_failed", {
        error_code: String((err && err.message) || "join_by_code_failed"),
      });
    }
  }

  async function joinSession() {
    setStatus("Joining session...");
    trackAnalyticsEvent("tv_join_session_attempt", { via: "join_token" });
    if (state.hubBase) {
      safeStorageSet(STORAGE_KEYS.lastHubBase, state.hubBase);
    }

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
          enterDiscoveryMode(`Session ended. ${DISCOVERY_PROMPT}`, true, true);
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
      trackAnalyticsEvent("tv_join_session_success", {
        has_session_id: !!state.sessionId,
      });
    } catch (err) {
      setStatus(`Join failed: ${String(err.message || err)}`, true);
      trackAnalyticsEvent("tv_join_session_failed", {
        error_code: String((err && err.message) || "join_failed"),
      });
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

    setStatus("PRESS & HOLD");
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
        setAppMode("controller");
        setUiMode("connected");
        hideJoinTools();
        if (state.speechApiBase) {
          setStatus("PRESS & HOLD");
        }
        trackAnalyticsEvent("tv_socket_connected");
      });

      ws.addEventListener("message", (event) => {
        handleSocketMessage(event.data);
      });

      ws.addEventListener("close", (event) => {
        state.connected = false;
        if (state.appMode !== "challenge") {
          setAppMode("controller");
        }
        setUiMode("discovery");
        showJoinTools();
        const reason = String(event.reason || "").toLowerCase();
        if (
          reason.includes("host_disconnected") ||
          reason.includes("session_closed") ||
          reason.includes("closed_by_host")
        ) {
          enterDiscoveryMode(`TV disconnected. ${DISCOVERY_PROMPT}`, true, true);
          trackAnalyticsEvent("tv_socket_closed_host_left", { reason });
          return;
        }

        setStatus("Connection closed. Reconnecting...");
        trackAnalyticsEvent("tv_socket_closed", { reason: reason || "unknown" });
        scheduleReconnect();
      });

      ws.addEventListener("error", () => {
        state.connected = false;
        if (state.appMode !== "challenge") {
          setAppMode("controller");
        }
        setUiMode("discovery");
        showJoinTools();
        setStatus("Connection error. Reconnecting...");
        trackAnalyticsEvent("tv_socket_error");
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
      enterDiscoveryMode(`TV disconnected. ${DISCOVERY_PROMPT}`, true, true);
      return;
    }

    if (message.type === "event" && message.event && message.event.fromRole === "host") {
      maybeOpenHostChallengeFlow(message.event);
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
      state.analytics.micPressCount += 1;
      trackAnalyticsEvent("mic_press_started", {
        mic_press_count: state.analytics.micPressCount,
      });
      playCueSound("start");
      setMicState("listening");
      setStatus("Listening...");
      setTranscript("Listening...");
    } catch (err) {
      state.holdRequested = false;
      setStatus(`Mic error: ${String(err.message || err)}`, true);
      trackAnalyticsEvent("mic_press_start_error", {
        error_code: String((err && err.message) || "mic_start_failed"),
      });
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
    if (state.recordStartedAt > 0) {
      trackAnalyticsEvent("mic_press_released", {
        mic_press_count: state.analytics.micPressCount,
        press_duration_ms: Math.max(0, Date.now() - state.recordStartedAt),
      });
    }
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
      trackAnalyticsEvent("mic_press_too_short", {
        press_duration_ms: durationMs,
      });
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
        trackAnalyticsEvent("mic_transcription_empty", {
          press_duration_ms: durationMs,
        });
        flashRetryPrompt();
        return;
      }

      setTranscript(transcript);
      sendAction("VOICE_TEXT", { text: transcript });
      trackAnalyticsEvent("mic_transcription_success", {
        press_duration_ms: durationMs,
        transcript_length: transcript.length,
        word_count: transcript.split(/\s+/).filter(Boolean).length,
      });
      setMicState("idle");
      setStatus("PRESS & HOLD");
    } catch (err) {
      setStatus(`Speech failed: ${String(err.message || err)}`, true);
      trackAnalyticsEvent("mic_transcription_failed", {
        error_code: String((err && err.message) || "stt_failed"),
        press_duration_ms: durationMs,
      });
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
      setMicImage(true);
      micButtonEl.classList.add("is-pressed");
      setMicLabel("");
      return;
    }

    if (name === "arming") {
      setMicImage(true);
      micButtonEl.classList.add("is-arming");
      setMicLabel(label || "PREPARING...");
      return;
    }

    if (name === "processing") {
      setMicImage(true);
      micButtonEl.classList.add("is-processing");
      setMicLabel(label || "PROCESSING\nPLEASE WAIT");
      return;
    }

    if (name === "retry") {
      setMicImage(true);
      micButtonEl.classList.add("is-retry");
      setMicLabel(label || "TRY AGAIN");
      return;
    }

    setMicImage(false);
    setMicLabel("");
  }

  function setMicImage(isPressed) {
    if (!micImageEl) return;
    const nextSrc = isPressed ? MIC_IMAGE_SRC.pressed : MIC_IMAGE_SRC.idle;
    if (micImageEl.getAttribute("src") !== nextSrc) {
      micImageEl.setAttribute("src", nextSrc);
    }
  }

  function setMicLabel(text) {
    if (!micLabelEl) return;
    micLabelEl.textContent = text || "";
  }

  function startSttWarmup() {
    if (state.sttWarmStarted || !state.speechApiBase) return;
    state.sttWarmStarted = true;

    const silenceBytes = new Uint8Array(16000);
    const silenceBase64 = arrayBufferToBase64(silenceBytes.buffer);

    requestTranscript(silenceBase64, 16000, {
      warmup: true,
      warmupReason: "session_start",
    })
      .then(() => {
        // warm-up only
      })
      .catch(() => {
        // best-effort warm-up; ignore errors
      });
  }

  async function requestTranscript(audioContentBase64, sampleRateHertz, options) {
    const opts = options || {};
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
        warmup: opts.warmup === true,
        warmupReason: typeof opts.warmupReason === "string" ? opts.warmupReason : "",
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
    trackAnalyticsEvent("tv_qr_scan_opened");

    if (!scanVideoEl || !scanPanelEl) {
      setStatus("Scanner UI missing.", true);
      return;
    }

    if (typeof window.BarcodeDetector !== "function") {
      setStatus("In-app QR scan is not supported on this browser. Use Camera app or room code.", true);
      trackAnalyticsEvent("tv_qr_scan_unsupported");
      if (joinHelpEl) {
        joinHelpEl.textContent = "Scan with your phone camera or enter your 4-digit game code.";
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
      trackAnalyticsEvent("tv_qr_scan_started");

      state.scanner.loopTimer = setInterval(() => {
        scanLoopTick();
      }, 250);
    } catch (err) {
      setStatus(`Camera error: ${String(err.message || err)}`, true);
      trackAnalyticsEvent("tv_qr_scan_error", {
        error_code: String((err && err.message) || "camera_error"),
      });
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
    if (new RegExp(`^\\\\d{${ROOM_CODE_LENGTH}}$`).test(raw)) {
      trackAnalyticsEvent("tv_qr_scanned_room_code", { code_length: raw.length });
      joinSessionByCode(raw);
      return;
    }

    try {
      const scannedUrl = new URL(raw);
      const pathParts = scannedUrl.pathname.split("/").filter(Boolean);
      if (pathParts[0] === "challenge" && pathParts[1]) {
        trackAnalyticsEvent("challenge_link_scanned_opened");
        window.location.href = scannedUrl.toString();
        return;
      }
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
        safeStorageSet(STORAGE_KEYS.lastHubBase, state.hubBase);
      }

      updateSessionMeta();
      setAppMode("controller");
      updateUrlWithSession();
      trackAnalyticsEvent("tv_qr_scanned_session_link");
      joinSession();
    } catch {
      setStatus("Unsupported QR format. Use the room code fallback.", true);
      trackAnalyticsEvent("tv_qr_scan_invalid_payload");
    }
  }

  function enterDiscoveryMode(message, isError, clearSession) {
    clearRoundTimer();
    stopChallengeSpeech();
    closePlatformModal();
    closeSenderNameModal();
    closeReceiverNameModal();
    state.connected = false;
    clearReconnectTimer();
    setAppMode("controller");
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

  function setAppMode(mode) {
    const nextMode = mode === "challenge" ? "challenge" : "controller";
    if (state.appMode === nextMode) return;
    if (nextMode !== "challenge") {
      stopChallengeSpeech();
    }
    state.appMode = nextMode;
    document.body.classList.toggle("mode-challenge", nextMode === "challenge");
    if (controllerShellEl) {
      controllerShellEl.hidden = nextMode === "challenge";
    }
    if (challengeShellEl) {
      challengeShellEl.hidden = nextMode !== "challenge";
    }
    syncChallengeLoopAudio();
  }

  function showJoinTools() {
    if (joinToolsEl) {
      joinToolsEl.hidden = false;
    }
    if (roomCodeInputEl) {
      roomCodeInputEl.value = formatRoomCodeDisplay(state.roomCode || "");
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
      const placeholder = "-".repeat(ROOM_CODE_LENGTH);
      roomCodeEl.textContent = `Code: ${state.roomCode || placeholder}`;
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
    const routeKind = pathParts[0] === ROUTE_CHALLENGE ? ROUTE_CHALLENGE : ROUTE_JOIN;
    const challengeId =
      routeKind === ROUTE_CHALLENGE && pathParts[1] ? decodeURIComponent(pathParts[1]) : "";

    const sessionId =
      routeKind === ROUTE_JOIN && pathParts[0] === "join" && pathParts[1]
        ? decodeURIComponent(pathParts[1])
        : params.get("session") || "";

    const joinToken = params.get("t") || "";
    const clientVersion = params.get("cv") || "1";
    const hubBase = sanitizeHubBase(params.get("hub") || "");
    const roomCode = sanitizeRoomCode(params.get("rc") || "");
    const forceCreateMode = params.get("mode") === "create";
    const challengeLoopAudio = params.get("bgAudio") || params.get("bg") || "";
    const challengeGameplayAudio =
      params.get("bgGameplay") || params.get("bgAudioGameplay") || challengeLoopAudio || "";
    const challengeMenuAudio = params.get("bgMenu") || params.get("bgAudioMenu") || "";
    const gaMeasurementId = params.get("gaid") || params.get("ga") || "";
    const gaDebug = params.get("gadebug") === "1";

    return {
      routeKind,
      challengeId,
      forceCreateMode,
      sessionId,
      joinToken,
      hubBase,
      clientVersion,
      roomCode,
      challengeLoopAudio,
      challengeGameplayAudio,
      challengeMenuAudio,
      gaMeasurementId,
      gaDebug,
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
    return value.replace(/[^0-9]/g, "").slice(0, ROOM_CODE_LENGTH);
  }

  function formatRoomCodeDisplay(value) {
    const code = sanitizeRoomCode(value);
    return code.split("").join(" ");
  }

  function hubUrl(path) {
    const base = (state.hubBase || sanitizeHubBase(window.location.origin)).replace(/\/$/, "");
    return `${base}${path}`;
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

  function maybeOpenHostChallengeFlow(eventEnvelope) {
    if (!eventEnvelope || state.routeKind === ROUTE_CHALLENGE) return;
    const action = String(eventEnvelope.action || "").toUpperCase();
    const payload = isPlainObject(eventEnvelope.payload) ? eventEnvelope.payload : {};
    const hostBgLoopUrl = resolveLoopAudioUrl(
      payload.bgAudioUrl || payload.backgroundAudioUrl || payload.bgLoopAudioUrl || "",
      "gameplay"
    );
    if (hostBgLoopUrl) {
      state.challengeSpeech.loopGameplayUrl = hostBgLoopUrl;
      syncChallengeLoopAudio();
    }

    const prebuilt = extractHostPrebuiltChallenge(payload);
    state.challengeFlow.challenge = prebuilt ? prebuilt.challenge : null;
    state.challengeFlow.lastShareUrl = prebuilt ? prebuilt.shareUrl || "" : "";

    const shouldOpen = shouldOpenChallengeFromHost(action, payload);
    const draft = extractHostChallengeDraft(payload);
    if (shouldOpen || draft) {
      trackAnalyticsEvent("host_challenge_flow_triggered", {
        action: action || "unknown",
        has_draft: !!draft,
      });
    }
    if (!shouldOpen && !draft) return;
    stopChallengeSpeech();

    if (!draft) {
      if (prebuilt && prebuilt.challenge) {
        renderSenderShareCard(prebuilt.challenge, prebuilt.shareUrl, "host");
        return;
      }
      renderHostChallengeUnavailable();
      return;
    }

    state.challengeFlow.source = "host";
    state.challengeFlow.hostDraft = draft;
    state.challengeFlow.view = "host_intro";
    renderHostChallengeStart(draft);
  }

  function shouldOpenChallengeFromHost(action, payload) {
    const triggers = new Set([
      "SHOW_CHALLENGE_FLOW",
      "OPEN_CHALLENGE_FLOW",
      "POST_GAME_CHALLENGE",
      "CHALLENGE_FLOW",
      "GAME_COMPLETED",
      "MATCH_COMPLETED",
    ]);
    if (triggers.has(action)) return true;
    if (!isPlainObject(payload)) return false;
    if (payload.challengeFlow === true || payload.showChallengeFlow === true) return true;
    if (isPlainObject(payload.challenge) || isPlainObject(payload.challengeSnapshot)) return true;
    if (Array.isArray(payload.questions)) return true;
    return false;
  }

  function extractHostChallengeDraft(payload) {
    if (!isPlainObject(payload)) return null;
    const raw = isPlainObject(payload.challengeSnapshot)
      ? payload.challengeSnapshot
      : isPlainObject(payload.challenge)
        ? payload.challenge
        : payload;

    const questions = normalizePlayableQuestions(raw.questions || payload.questions || []);
    if (questions.length === 0) return null;

    const category = normalizeCategoryMeta(
      raw.category || {
        id: raw.categoryId || payload.categoryId || "",
        name: raw.categoryName || payload.categoryName || "",
      }
    );
    const senderName = sanitizeDisplayName(
      raw.senderName || payload.senderName || safeStorageGet(STORAGE_KEYS.lastName) || "Player"
    );
    const senderAttempt = normalizeSenderAttempt(
      raw.senderAttempt || payload.senderAttempt || {},
      questions,
      senderName
    );
    const leaderboard = normalizeLeaderboardRows(raw.leaderboard || payload.leaderboard || []);

    return {
      title: sanitizeInlineText(raw.title || payload.title || ""),
      senderName,
      category,
      questions,
      senderAttempt,
      leaderboard,
    };
  }

  function extractHostPrebuiltChallenge(payload) {
    if (!isPlainObject(payload)) return null;
    const challengeRaw = isPlainObject(payload.challenge) ? payload.challenge : null;
    if (!challengeRaw) return null;

    const challengeId = sanitizeInlineText(challengeRaw.id || "");
    if (!challengeId) return null;

    const shareUrl = sanitizeInlineText(payload.shareUrl || challengeRaw.shareUrl || "");
    const bgAudioUrl = sanitizeMediaUrl(
      payload.bgAudioUrl || challengeRaw.bgAudioUrl || payload.backgroundAudioUrl || challengeRaw.backgroundAudioUrl || ""
    );
    return {
      shareUrl,
      challenge: {
        ...challengeRaw,
        id: challengeId,
        senderName: sanitizeDisplayName(challengeRaw.senderName || "Player"),
        category: normalizeCategoryMeta(challengeRaw.category || {}),
        leaderboard: normalizeLeaderboardRows(challengeRaw.leaderboard || []),
        bgAudioUrl,
        shareUrl: shareUrl || sanitizeInlineText(challengeRaw.shareUrl || ""),
      },
    };
  }

  function normalizeSenderAttempt(raw, questions, fallbackName) {
    if (!isPlainObject(raw)) return null;
    const name = sanitizeDisplayName(raw.participantName || raw.name || fallbackName || "Player");
    const answers = normalizeRoundAnswers(raw.answers || [], questions, false);
    let score = asFiniteInt(raw.score, 0);
    let correctCount = asFiniteInt(raw.correctCount, 0);

    if (answers.length > 0) {
      score = 0;
      correctCount = 0;
      for (let i = 0; i < answers.length; i += 1) {
        if (answers[i].selectedIndex === answers[i].correctIndex) {
          score += answers[i].pointsPossible;
          correctCount += 1;
        }
      }
    }

    const hasAnything = answers.length > 0 || Number.isFinite(raw.score) || Number.isFinite(raw.correctCount);
    if (!hasAnything) return null;

    return {
      participantName: name,
      score,
      correctCount,
      totalQuestions: questions.length,
      answers,
    };
  }

  function clearRoundTimer() {
    const timer = state.challengeFlow.roundTimer;
    if (!timer) return;
    clearTimeout(timer);
    state.challengeFlow.roundTimer = null;
  }

  function setRoundTimer(fn, delayMs) {
    clearRoundTimer();
    state.challengeFlow.roundTimer = setTimeout(() => {
      state.challengeFlow.roundTimer = null;
      fn();
    }, Math.max(0, asFiniteInt(delayMs, 0)));
  }

  function formatScore(score) {
    const value = Math.max(0, asFiniteInt(score, 0));
    return `$${value.toLocaleString()}`;
  }

  function normalizeLeaderboardForUi(rows, options) {
    const opts = options || {};
    const maxRows = Math.max(1, asFiniteInt(opts.maxRows, 4));
    const out = [];
    const list = Array.isArray(rows) ? rows : [];

    for (let i = 0; i < maxRows; i += 1) {
      const row = list[i];
      if (row && isPlainObject(row)) {
        out.push({
          rank: asFiniteInt(row.rank, i + 1),
          participantName: sanitizeDisplayName(row.participantName || "Player"),
          score: asFiniteInt(row.score, 0),
          isSender: row.isSender === true,
        });
        continue;
      }
      out.push({
        rank: i + 1,
        participantName: "???",
        score: -1,
        isSender: false,
      });
    }
    return out;
  }

  function renderLeaderboardRows(rows, options) {
    const opts = options || {};
    const maxRows = asFiniteInt(opts.maxRows, 4);
    const list = normalizeLeaderboardForUi(rows, { maxRows });
    const selfName = sanitizeDisplayName(opts.selfName || "");

    return `
      <ul class="challenge-list">
        ${list
          .map((row, idx) => {
            const depth = idx + 1;
            const isYou =
              opts.highlightSender === true
                ? row.isSender
                : selfName
                  ? row.participantName.toLowerCase() === selfName.toLowerCase()
                  : depth === 1;
            const scoreText = row.score >= 0 ? formatScore(row.score) : "$---";
            return `
              <li class="challenge-list-row ${isYou ? "is-you" : ""}" data-depth="${depth}">
                <div class="challenge-list-top">
                  <strong>#${escapeHtml(String(row.rank))}</strong>
                  <span class="challenge-pill success">${escapeHtml(scoreText)}</span>
                  <strong>${escapeHtml(isYou ? "YOU" : row.participantName)}</strong>
                </div>
              </li>
            `;
          })
          .join("")}
      </ul>
    `;
  }

  function renderPlatformLogoGrid(prefix) {
    return `
      <div class="platform-tiles">
        <button
          type="button"
          class="platform-box platform-box-alexa"
          id="${prefix}-platform-alexa"
          aria-label="Play on Alexa"
        >
          <img class="platform-box-logo" src="${escapeHtmlAttr(PLATFORM_COPY.alexa.icon)}" alt="Alexa" />
        </button>
        <button
          type="button"
          class="platform-box platform-box-fire"
          id="${prefix}-platform-fire"
          aria-label="Play on Fire TV"
        >
          <img class="platform-box-logo" src="${escapeHtmlAttr(PLATFORM_COPY.fire.icon)}" alt="Fire TV" />
        </button>
        <button
          type="button"
          class="platform-box platform-box-roku"
          id="${prefix}-platform-roku"
          aria-label="Play on Roku"
        >
          <img class="platform-box-logo" src="${escapeHtmlAttr(PLATFORM_COPY.roku.icon)}" alt="Roku" />
        </button>
      </div>
    `;
  }

  function bindPlatformGrid(prefix) {
    const alexaButton = document.getElementById(`${prefix}-platform-alexa`);
    const fireButton = document.getElementById(`${prefix}-platform-fire`);
    const rokuButton = document.getElementById(`${prefix}-platform-roku`);

    if (alexaButton) {
      alexaButton.addEventListener("click", () => {
        trackAnalyticsEvent("platform_tile_clicked", { platform: "alexa", context: prefix });
        openPlatformModal("alexa");
      });
    }
    if (fireButton) {
      fireButton.addEventListener("click", () => {
        trackAnalyticsEvent("platform_tile_clicked", { platform: "fire", context: prefix });
        openPlatformModal("fire");
      });
    }
    if (rokuButton) {
      rokuButton.addEventListener("click", () => {
        trackAnalyticsEvent("platform_tile_clicked", { platform: "roku", context: prefix });
        openPlatformModal("roku");
      });
    }
  }

  function openPlatformModal(platformKey) {
    const platform = PLATFORM_COPY[platformKey];
    if (!platform) return;
    closePlatformModal();
    trackAnalyticsEvent("platform_instruction_opened", { platform: platformKey });

    const container = document.createElement("div");
    container.id = "platform-invoke-modal";
    container.className = "challenge-modal-backdrop platform-modal-backdrop";
    container.innerHTML = `
      <section class="platform-modal-screen" role="dialog" aria-modal="true" aria-label="${escapeHtmlAttr(
        platform.title
      )} instructions">
        <button id="platform-modal-close" class="platform-modal-close" type="button" aria-label="Close">X</button>
        <img class="platform-modal-mini-logo" src="${QR_ASSET_BASE}/minilogo.png" alt="Trivia Champions" />
        <div class="platform-modal-main">
          <img class="platform-modal-icon" src="${escapeHtmlAttr(platform.icon)}" alt="${escapeHtmlAttr(platform.title)}" />
          <p class="platform-modal-prompt">${escapeHtml(platform.prompt)}</p>
          <h2 class="platform-modal-command">${escapeHtml(platform.command || "")}</h2>
          ${platform.extra ? `<p class="platform-modal-extra">${escapeHtml(platform.extra)}</p>` : ""}
        </div>
      </section>
    `;

    container.addEventListener("click", (event) => {
      if (event.target === container) {
        closePlatformModal();
      }
    });

    document.body.appendChild(container);
    const closeButton = document.getElementById("platform-modal-close");
    if (closeButton) {
      closeButton.addEventListener("click", () => closePlatformModal());
    }
  }

  function closePlatformModal() {
    const node = document.getElementById("platform-invoke-modal");
    if (node && node.parentNode) {
      node.parentNode.removeChild(node);
    }
  }

  function calculateSenderScoreAtIndex(index) {
    const challenge = state.challengeFlow.challenge;
    if (!challenge || !challenge.senderAttempt || !Array.isArray(challenge.senderAttempt.answers)) return 0;
    const end = Math.max(0, asFiniteInt(index, 0));
    let total = 0;
    for (let i = 0; i <= end; i += 1) {
      const answer = challenge.senderAttempt.answers[i];
      if (!answer || !answer.isCorrect) continue;
      total += asFiniteInt(answer.pointsAwarded, asFiniteInt(answer.pointsPossible, 0));
    }
    return total;
  }

  async function loadChallengeReceiverFlow(challengeId) {
    clearRoundTimer();
    stopChallengeSpeech();
    closePlatformModal();
    closeSenderNameModal();
    closeReceiverNameModal();
    state.challengeFlow.view = "receiver_loading";
    state.challengeFlow.source = "receiver";
    state.challengeFlow.round = null;
    state.challengeFlow.lastShareUrl = "";
    state.challengeFlow.challenge = null;
    state.challengeFlow.participantId = getOrCreateParticipantId(challengeId);
    state.challengeFlow.participantName = safeStorageGet(STORAGE_KEYS.receiverName) || "";

    renderChallengeLoading("Loading challenge...");
    trackAnalyticsEvent("challenge_opened", { challenge_entry: "link" });
    try {
      const data = await requestHubJson(
        `/api/v1/challenges/${encodeURIComponent(challengeId)}?participantId=${encodeURIComponent(
          state.challengeFlow.participantId
        )}`
      );

      state.challengeFlow.challenge = data.challenge;
      const challengeBgLoopUrl = resolveLoopAudioUrl(
        data.challenge &&
          (data.challenge.bgAudioUrl || data.challenge.backgroundAudioUrl || data.challenge.bgLoopAudioUrl || ""),
        "gameplay"
      );
      if (challengeBgLoopUrl) {
        state.challengeSpeech.loopGameplayUrl = challengeBgLoopUrl;
        syncChallengeLoopAudio();
      }
      state.challengeFlow.lastShareUrl = data.challenge && data.challenge.shareUrl ? data.challenge.shareUrl : "";
      state.challengeFlow.participantName = safeStorageGet(STORAGE_KEYS.receiverName) || "";
      trackAnalyticsEvent("challenge_loaded", {
        has_existing_attempt: !!(data.viewer && data.viewer.hasAttempted),
        question_count:
          data.challenge && Array.isArray(data.challenge.questions) ? data.challenge.questions.length : 0,
      });

      if (data.viewer && data.viewer.hasAttempted && data.viewer.attempt) {
        state.challengeFlow.round = null;
        state.challengeFlow.view = "receiver_result";
        renderReceiverResult(data.viewer.attempt, true);
        return;
      }

      state.challengeFlow.view = "receiver_intro";
      renderReceiverStart();
    } catch (err) {
      const code = String(err.code || "");
      if (code === "challenge_expired") {
        trackAnalyticsEvent("challenge_expired_viewed");
        renderChallengeExpired();
        return;
      }
      trackAnalyticsEvent("challenge_load_failed", {
        error_code: String((err && err.code) || "challenge_load_failed"),
      });
      renderChallengeError("Challenge unavailable. Please try another link.");
    }
  }

  function renderChallengeLoading(message) {
    setChallengeLoopKind("menu");
    renderChallengeCard(`
      <p class="challenge-subtitle">${escapeHtml(message || "Loading...")}</p>
    `);
  }

  function renderChallengeError(message) {
    setChallengeLoopKind("menu");
    renderChallengeCard(`
      <h1 class="challenge-title">Challenge unavailable</h1>
      <p class="challenge-subtitle">${escapeHtml(message || "Please try again later.")}</p>
      <div class="challenge-actions">
        <button id="challenge-open-mini" class="challenge-btn primary" type="button">Start Web Challenge</button>
        <button id="challenge-back-tv" class="challenge-btn" type="button">Connect to TV</button>
      </div>
    `);

    const miniBtn = document.getElementById("challenge-open-mini");
    const backBtn = document.getElementById("challenge-back-tv");
    if (miniBtn) {
      miniBtn.addEventListener("click", () => startMiniCreateFlow());
    }
    if (backBtn) {
      backBtn.addEventListener("click", () => returnToControllerHome());
    }
  }

  function renderChallengeExpired() {
    setChallengeLoopKind("menu");
    renderChallengeCard(`
      <h1 class="challenge-title">This challenge expired, create a new one</h1>
      <p class="challenge-subtitle">Challenges expire automatically and extend while active.</p>
      <div class="challenge-actions">
        <button id="challenge-new-mini" class="challenge-btn primary" type="button">Create New Challenge</button>
        <button id="challenge-expired-tv" class="challenge-btn" type="button">Connect to TV</button>
      </div>
    `);

    const miniBtn = document.getElementById("challenge-new-mini");
    const tvBtn = document.getElementById("challenge-expired-tv");
    if (miniBtn) {
      miniBtn.addEventListener("click", () => startMiniCreateFlow());
    }
    if (tvBtn) {
      tvBtn.addEventListener("click", () => returnToControllerHome());
    }
  }

  function renderReceiverStart() {
    setChallengeLoopKind("menu");
    const challenge = state.challengeFlow.challenge;
    if (!challenge) {
      renderChallengeError("Challenge missing.");
      return;
    }

    const leaderboard = Array.isArray(challenge.leaderboard) ? challenge.leaderboard : [];
    const categoryName = (challenge.category && challenge.category.name) || "Trivia";
    const senderName = sanitizeDisplayName(challenge.senderName || "your friend");
    const beatLabel = senderName.length <= 14 ? `Beat ${senderName}` : "Beat their score";

    renderChallengeCard(`
      <h1 class="challenge-title">Can you beat ${escapeHtml(senderName)}?</h1>
      <p class="challenge-subtitle">Guess the trivia questions in the following category:</p>
      <button
        class="challenge-category-btn"
        type="button"
        disabled
        style="background-image:url('https://d3tswg7dtbmd2x.cloudfront.net/qr/catbg.png')"
      >${escapeHtml(categoryName)}</button>
      ${renderLeaderboardRows(leaderboard, { maxRows: 4 })}
      <div class="challenge-actions">
        <button id="receiver-start-button" class="challenge-btn primary" type="button">${escapeHtml(
          beatLabel
        )}</button>
      </div>
    `);

    const startButton = document.getElementById("receiver-start-button");
    if (startButton) {
      startButton.addEventListener("click", () => {
        trackAnalyticsEvent("challenge_accept_clicked");
        const storedName = sanitizeDisplayName(state.challengeFlow.participantName || "You");
        openReceiverNameModal(storedName, (name) => {
          safeStorageSet(STORAGE_KEYS.receiverName, name);
          state.challengeFlow.participantName = name;
          trackAnalyticsEvent("challenge_accepted", { has_name: !!name });
          startReceiverRound(name);
        });
      });
    }
  }

  function startReceiverRound(name) {
    const challenge = state.challengeFlow.challenge;
    if (!challenge || !Array.isArray(challenge.questions) || challenge.questions.length === 0) {
      renderChallengeError("Challenge has no playable questions.");
      return;
    }

    state.challengeFlow.round = {
      mode: "receiver",
      participantName: sanitizeDisplayName(name || "Player"),
      participantId: state.challengeFlow.participantId,
      category: challenge.category || { id: "general", name: "General Knowledge" },
      questions: challenge.questions.map((question) => ({
        questionId: sanitizeInlineText(question.questionId || ""),
        questionText: sanitizeInlineText(question.questionText || ""),
        choices: Array.isArray(question.choices)
          ? question.choices.map((choice) => sanitizeInlineText(choice)).filter(Boolean).slice(0, 8)
          : [],
        correctIndex: asFiniteInt(question.correctIndex, -1),
        points: Math.max(0, asFiniteInt(question.points, 100)),
        tts: normalizeQuestionTts(question, Array.isArray(question.choices) ? question.choices.length : 0),
      })),
      index: 0,
      score: 0,
      correctCount: 0,
      answers: [],
      locked: false,
    };
    trackAnalyticsEvent("challenge_round_started", {
      mode: "receiver",
      question_count: state.challengeFlow.round.questions.length,
    });

    beginRoundSequence();
  }

  function beginRoundSequence() {
    setChallengeLoopKind("gameplay");
    const round = state.challengeFlow.round;
    if (!round || !Array.isArray(round.questions) || round.questions.length === 0) return;
    if (round.index >= round.questions.length) {
      if (round.mode === "receiver") {
        submitReceiverAttempt();
      } else {
        renderMiniSummary();
      }
      return;
    }

    const current = round.questions[round.index];
    if (!current) return;

    renderChallengeCard(`
      <p class="challenge-small">${escapeHtml(round.category.name || "Trivia")}</p>
      <p class="challenge-score">${escapeHtml(formatScore(current.points || 100))}</p>
    `);
    playRoundIntroTts(round, current);

    setRoundTimer(() => {
      renderCurrentRoundQuestion();
    }, ROUND_AMOUNT_HOLD_MS);
  }

  function renderCurrentRoundQuestion() {
    setChallengeLoopKind("gameplay");
    const round = state.challengeFlow.round;
    if (!round || !Array.isArray(round.questions) || round.questions.length === 0) return;
    const question = round.questions[round.index];
    if (!question) return;
    trackAnalyticsEvent("challenge_question_viewed", {
      mode: round.mode,
      question_index: round.index + 1,
      question_points: question.points,
    });

    const title =
      round.mode === "receiver"
        ? `Can you beat ${escapeHtml((state.challengeFlow.challenge && state.challengeFlow.challenge.senderName) || "your friend")}?`
        : `${escapeHtml(round.category.name || "Trivia")}`;

    renderChallengeCard(`
      <p class="challenge-small">${title}</p>
      <p class="challenge-progress">Question ${escapeHtml(String(round.index + 1))} of ${escapeHtml(String(round.questions.length))}</p>
      <h1 class="challenge-question">${escapeHtml(question.questionText)}</h1>
      <div class="challenge-choice-list">
        ${question.choices
          .map(
            (choice, idx) =>
              `<button type="button" class="challenge-choice" data-choice="${idx}">
                <span class="challenge-choice-label">${escapeHtml(String.fromCharCode(65 + idx))}</span>
                <span class="challenge-choice-text">${escapeHtml(choice)}</span>
              </button>`
          )
          .join("")}
      </div>
    `);

    const buttons = Array.from(document.querySelectorAll("[data-choice]"));
    fitChoiceText(buttons);
    playQuestionTts(question);
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const value = asFiniteInt(button.getAttribute("data-choice"), -1);
        handleRoundChoice(value);
      });
    });
  }

  function fitChoiceText(buttons) {
    const initialSize = 21;
    const minSize = 13;
    buttons.forEach((button) => {
      const textNode = button.querySelector(".challenge-choice-text");
      if (!(textNode instanceof HTMLElement)) return;

      let size = initialSize;
      textNode.style.fontSize = `${size}px`;

      while (size > minSize && textNode.scrollWidth > textNode.clientWidth + 1) {
        size -= 1;
        textNode.style.fontSize = `${size}px`;
      }

      if (textNode.scrollWidth > textNode.clientWidth + 1) {
        textNode.style.textOverflow = "ellipsis";
      } else {
        textNode.style.textOverflow = "";
      }
    });
  }

  function handleRoundChoice(selectedIndex) {
    const round = state.challengeFlow.round;
    if (!round || round.locked) return;
    const question = round.questions[round.index];
    if (!question) return;
    const hasCorrectAnswer = question.correctIndex >= 0;

    round.locked = true;
    stopChallengeSpeech();

    const buttons = Array.from(document.querySelectorAll("[data-choice]"));
    buttons.forEach((button) => {
      button.disabled = true;
      const value = asFiniteInt(button.getAttribute("data-choice"), -1);
      if (value === selectedIndex) {
        button.classList.add("is-selected");
      }
      if (hasCorrectAnswer && value === question.correctIndex) {
        button.classList.add("is-correct");
      } else if (hasCorrectAnswer && value === selectedIndex) {
        button.classList.add("is-wrong");
      }
    });

    const isCorrect = hasCorrectAnswer && selectedIndex === question.correctIndex;
    if (hasCorrectAnswer && isCorrect) {
      round.score += question.points;
      round.correctCount += 1;
    }

    round.answers.push({
      questionId: question.questionId,
      questionText: question.questionText,
      choices: question.choices,
      selectedIndex,
      correctIndex: question.correctIndex,
      isCorrect,
      pointsAwarded: hasCorrectAnswer && isCorrect ? question.points : 0,
      pointsPossible: question.points,
    });
    trackAnalyticsEvent("challenge_answer_submitted", {
      mode: round.mode,
      question_index: round.index + 1,
      selected_index: selectedIndex,
      is_correct: isCorrect,
      points_awarded: hasCorrectAnswer && isCorrect ? question.points : 0,
    });

    setRoundTimer(() => {
      renderQuestionResultSlice(isCorrect);
    }, ROUND_REVEAL_HOLD_MS);
  }

  function renderQuestionResultSlice(isCorrect) {
    setChallengeLoopKind("gameplay");
    const round = state.challengeFlow.round;
    if (!round) return;

    if (round.mode === "receiver") {
      const senderName =
        (state.challengeFlow.challenge && state.challengeFlow.challenge.senderName) || "Friend";
      const senderScore =
        state.challengeFlow.challenge &&
        state.challengeFlow.challenge.senderAttempt &&
        Number.isFinite(state.challengeFlow.challenge.senderAttempt.score)
          ? asFiniteInt(state.challengeFlow.challenge.senderAttempt.score, 0)
          : 0;
      const playerScore = asFiniteInt(round.score, 0);
      renderChallengeCard(`
        <h1 class="challenge-title">${isCorrect ? "CORRECT!" : "WRONG!"}</h1>
        <div class="challenge-duel" data-duel-root>
          <div class="challenge-duel-col">
            <p class="challenge-duel-score">${escapeHtml(formatScore(senderScore))}</p>
            <div class="challenge-duel-bar-wrap">
              <span class="challenge-duel-bar is-sender" data-duel-bar="sender"></span>
            </div>
            <p class="challenge-duel-name">${escapeHtml(senderName)}</p>
          </div>
          <div class="challenge-duel-col">
            <p class="challenge-duel-score">${escapeHtml(formatScore(playerScore))}</p>
            <div class="challenge-duel-bar-wrap">
              <span class="challenge-duel-bar is-player" data-duel-bar="player"></span>
            </div>
            <p class="challenge-duel-name">You</p>
          </div>
        </div>
      `);
      animateDuelBars(senderScore, playerScore);
    } else {
      renderChallengeCard(`
        <h1 class="challenge-title">${isCorrect ? "CORRECT!" : "WRONG!"}</h1>
        <p class="challenge-subtitle">${escapeHtml(formatScore(round.score))}</p>
      `);
    }
    playFeedbackTts(isCorrect);

    setRoundTimer(() => {
      round.index += 1;
      round.locked = false;
      beginRoundSequence();
    }, ROUND_FEEDBACK_HOLD_MS);
  }

  async function submitReceiverAttempt() {
    const round = state.challengeFlow.round;
    const challenge = state.challengeFlow.challenge;
    if (!round || !challenge) return;

    clearRoundTimer();
    renderChallengeLoading("Submitting your score...");
    trackAnalyticsEvent("challenge_attempt_submit_started", {
      answers_count: Array.isArray(round.answers) ? round.answers.length : 0,
    });
    try {
      const data = await requestHubJson(
        `/api/v1/challenges/${encodeURIComponent(challenge.id)}/attempts`,
        {
          method: "POST",
          body: {
            participantId: round.participantId,
            participantName: round.participantName,
            answers: round.answers.map((item) => ({
              questionId: item.questionId,
              selectedIndex: item.selectedIndex,
            })),
          },
        }
      );

      if (data.participantId) {
        state.challengeFlow.participantId = data.participantId;
        safeStorageSet(`qrcontroller.challenge.pid.${challenge.id}`, data.participantId);
      }

      state.challengeFlow.challenge = data.challenge || challenge;
      trackAnalyticsEvent("challenge_attempt_submit_success", {
        score: data.attempt && Number.isFinite(data.attempt.score) ? data.attempt.score : round.score,
        correct_count:
          data.attempt && Number.isFinite(data.attempt.correctCount) ? data.attempt.correctCount : round.correctCount,
      });
      renderReceiverResult(data.attempt, !!data.alreadyAttempted);
    } catch (err) {
      const code = String(err.code || "");
      if (code === "challenge_expired") {
        trackAnalyticsEvent("challenge_attempt_submit_expired");
        renderChallengeExpired();
        return;
      }
      trackAnalyticsEvent("challenge_attempt_submit_failed", {
        error_code: String((err && err.code) || "submit_failed"),
      });
      renderChallengeError("Could not submit attempt. Please try again.");
    }
  }

  function renderReceiverResult(attempt, alreadyAttempted) {
    setChallengeLoopKind("menu");
    const challenge = state.challengeFlow.challenge;
    if (!challenge || !attempt) {
      renderChallengeError("Result unavailable.");
      return;
    }

    const senderScore = challenge.senderAttempt ? asFiniteInt(challenge.senderAttempt.score, 0) : 0;
    const myScore = asFiniteInt(attempt.score, 0);
    const outcome = myScore > senderScore ? "win" : myScore === senderScore ? "tie" : "lose";
    const leaderboard = Array.isArray(challenge.leaderboard) ? challenge.leaderboard : [];

    renderChallengeCard(`
      <p class="challenge-small">${alreadyAttempted ? "Challenge replay" : "Challenge complete"}</p>
      <h1 class="challenge-title">${
        outcome === "win" ? "YOU WIN" : outcome === "tie" ? "IT'S A TIE" : "GOOD GAME"
      }</h1>
      <p class="challenge-subtitle">${
        outcome === "win"
          ? "You beat their score"
          : outcome === "tie"
            ? "You matched their score"
            : "You can try again from a new invite"
      }</p>
      <p class="challenge-label">Friends leaderboard</p>
      ${renderLeaderboardRows(leaderboard, { maxRows: 4 })}
      <div class="challenge-actions">
        <button id="receiver-play-more-button" class="challenge-btn primary" type="button">Play more</button>
      </div>
    `);
    playEndResultTts(outcome);
    trackAnalyticsEvent("challenge_completed", {
      mode: "receiver",
      outcome,
      score: myScore,
      opponent_score: senderScore,
      already_attempted: !!alreadyAttempted,
      question_count:
        attempt && Number.isFinite(attempt.totalQuestions)
          ? attempt.totalQuestions
          : state.challengeFlow.round && Array.isArray(state.challengeFlow.round.questions)
            ? state.challengeFlow.round.questions.length
            : 0,
      answered_count:
        attempt && Array.isArray(attempt.answers)
          ? attempt.answers.filter((item) => item && Number.isFinite(item.selectedIndex) && item.selectedIndex >= 0).length
          : 0,
    });

    const playMoreButton = document.getElementById("receiver-play-more-button");
    if (playMoreButton) {
      playMoreButton.addEventListener("click", () => renderReceiverPlayMore());
    }
  }

  function renderReceiverPlayMore() {
    setChallengeLoopKind("menu");
    trackAnalyticsEvent("challenge_play_more_viewed", { mode: "receiver" });
    renderChallengeCard(`
      <section class="playmore-screen">
        <div class="playmore-main">
          <h1 class="challenge-title">Play full game on:</h1>
          ${renderPlatformLogoGrid("receiver-more")}
        </div>
        <div class="playmore-footer">
          <p class="challenge-subtitle playmore-subtitle">or start a new game immediately</p>
          <div class="challenge-actions">
            <button id="receiver-play-here" class="challenge-btn primary" type="button">Play here</button>
          </div>
        </div>
      </section>
    `);

    bindPlatformGrid("receiver-more");
    const playHereButton = document.getElementById("receiver-play-here");
    if (playHereButton) {
      playHereButton.addEventListener("click", () => {
        trackAnalyticsEvent("challenge_play_here_clicked", { mode: "receiver" });
        startMiniCreateFlow();
      });
    }
  }

  async function startMiniCreateFlow() {
    state.challengeFlow.source = "mini";
    state.challengeFlow.view = "mini_setup_loading";
    state.challengeFlow.round = null;
    state.challengeFlow.challenge = null;
    state.challengeFlow.lastShareUrl = "";
    state.challengeFlow.categoryOffset = 0;
    clearRoundTimer();
    setAppMode("challenge");
    updateUrlToCreateMode();
    renderChallengeLoading("Loading categories...");
    trackAnalyticsEvent("mini_create_flow_opened");

    try {
      const data = await requestHubJson("/api/v1/trivia/categories");
      state.challengeFlow.categories = Array.isArray(data.categories) ? data.categories : [];
      if (state.challengeFlow.categories.length === 0) {
        renderChallengeError("No categories available right now.");
        return;
      }
      state.challengeFlow.view = "mini_setup";
      trackAnalyticsEvent("mini_categories_loaded", {
        categories_count: state.challengeFlow.categories.length,
      });
      renderMiniSetup();
    } catch (err) {
      trackAnalyticsEvent("mini_categories_load_failed", {
        error_code: String((err && err.code) || "categories_load_failed"),
      });
      renderChallengeCard(`
        <h1 class="challenge-title">Could not load categories</h1>
        <p class="challenge-subtitle">Connect to TV first or open a QR link so hub info is available.</p>
        <div class="challenge-actions">
          <button id="mini-retry-load" class="challenge-btn primary" type="button">Retry</button>
          <button id="mini-back-tv" class="challenge-btn" type="button">Connect to TV</button>
        </div>
      `);

      const retryButton = document.getElementById("mini-retry-load");
      const backButton = document.getElementById("mini-back-tv");
      if (retryButton) {
        retryButton.addEventListener("click", () => startMiniCreateFlow());
      }
      if (backButton) {
        backButton.addEventListener("click", () => returnToControllerHome());
      }
    }
  }

  function renderMiniSetup() {
    setChallengeLoopKind("menu");
    const categories = state.challengeFlow.categories || [];
    const pageSize = 4;
    const total = categories.length;
    const start = total > 0 ? ((asFiniteInt(state.challengeFlow.categoryOffset, 0) % total) + total) % total : 0;
    const visible = [];
    const visibleCount = Math.min(pageSize, total);
    for (let i = 0; i < visibleCount; i += 1) {
      visible.push(categories[(start + i) % total]);
    }
    const hasMore = total > pageSize;
    trackAnalyticsEvent("mini_setup_viewed", {
      categories_total: total,
      page_size: pageSize,
      has_more: hasMore,
    });

    renderChallengeCard(`
      <section class="mini-setup-screen">
        <div class="mini-setup-main">
          <h1 class="challenge-title">Choose a category</h1>
          <div class="mini-category-list">
            ${visible
              .map(
                (category) => `
              <button
                type="button"
                class="challenge-category-btn"
                data-mini-category="${escapeHtmlAttr(category.id || "")}"
                style="background-image:url('https://d3tswg7dtbmd2x.cloudfront.net/qr/catbg.png')"
              >
                ${escapeHtml(category.displayName || category.name || category.id || "Category")}
              </button>
            `
              )
              .join("")}
            ${
              hasMore
                ? `
              <button
                type="button"
                class="challenge-category-btn"
                data-mini-more="1"
                style="background-image:url('https://d3tswg7dtbmd2x.cloudfront.net/qr/catbg.png')"
              >
                More Categories
              </button>
            `
                : ""
            }
          </div>
        </div>
        <div class="mini-setup-footer">
          <div class="challenge-actions">
            <button id="mini-connect-tv-button" class="challenge-btn secondary" type="button">Connect to TV</button>
          </div>
        </div>
      </section>
    `);

    const categoryButtons = Array.from(document.querySelectorAll("[data-mini-category]"));
    const moreButton = document.querySelector("[data-mini-more]");
    const tvButton = document.getElementById("mini-connect-tv-button");

    categoryButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const categoryId = sanitizeInlineText(button.getAttribute("data-mini-category"));
        const playerName = sanitizeDisplayName(
          safeStorageGet(STORAGE_KEYS.challengeName) || safeStorageGet(STORAGE_KEYS.lastName) || "Player"
        );
        safeStorageSet(STORAGE_KEYS.challengeName, playerName);
        safeStorageSet(STORAGE_KEYS.lastName, playerName);
        trackAnalyticsEvent("mini_category_selected", { category_id: categoryId || "unknown" });
        startMiniRound(playerName, categoryId);
      });
    });

    if (moreButton && hasMore) {
      moreButton.addEventListener("click", () => {
        state.challengeFlow.categoryOffset = total > 0 ? (start + pageSize) % total : 0;
        trackAnalyticsEvent("mini_category_more_clicked", {
          next_offset: state.challengeFlow.categoryOffset,
        });
        renderMiniSetup();
      });
    }

    if (tvButton) {
      tvButton.addEventListener("click", () => {
        trackAnalyticsEvent("mini_connect_tv_clicked");
        returnToControllerHome();
      });
    }

    const categoryNames = visible
      .map((category) => sanitizeInlineText(category.displayName || category.name || category.id || ""))
      .filter(Boolean);
    if (hasMore) {
      categoryNames.push("More Categories");
    }
    if (categoryNames.length > 0) {
      playChallengeSpeechSequence([
        { url: CHALLENGE_TTS_ASSETS.chooseCategory, rate: 1.02 },
        { text: categoryNames.join(". "), rate: 1.14 },
      ]);
    }
  }

  async function startMiniRound(playerName, categoryId) {
    if (!categoryId) {
      renderMiniSetup();
      return;
    }

    stopChallengeSpeech();
    renderChallengeLoading("Loading questions...");
    trackAnalyticsEvent("mini_round_load_started", { category_id: categoryId });
    try {
      const data = await requestHubJson(`/api/v1/trivia/questions?category=${encodeURIComponent(categoryId)}`);
      const questions = normalizePlayableQuestions(data.questions || []);
      if (questions.length === 0) {
        renderChallengeError("No questions found for this category.");
        return;
      }

      const selected = shuffleArray(questions.slice()).slice(0, Math.min(MINI_ROUND_SIZE, questions.length));
      const shuffled = selected.map((question) => shuffleQuestionChoices(question));

      const categoryMeta =
        (state.challengeFlow.categories || []).find((category) => category.id === categoryId) || {
          id: categoryId,
          name: categoryId,
          displayName: categoryId,
        };

      state.challengeFlow.round = {
        mode: "mini",
        participantName: sanitizeDisplayName(playerName || "Player"),
        participantId: "",
        category: normalizeCategoryMeta(categoryMeta),
        questions: shuffled,
        index: 0,
        score: 0,
        correctCount: 0,
        answers: [],
        locked: false,
      };
      state.challengeFlow.view = "mini_round";
      trackAnalyticsEvent("mini_round_started", {
        category_id: categoryId,
        question_count: shuffled.length,
      });
      beginRoundSequence();
    } catch (err) {
      trackAnalyticsEvent("mini_round_load_failed", {
        category_id: categoryId,
        error_code: String((err && err.code) || "questions_load_failed"),
      });
      renderChallengeError("Could not load questions for this category.");
    }
  }

  function renderMiniSummary() {
    setChallengeLoopKind("menu");
    const round = state.challengeFlow.round;
    if (!round || round.mode !== "mini") {
      renderMiniSetup();
      return;
    }

    const leaderboardRows = [
      {
        rank: 1,
        participantName: round.participantName || "You",
        score: round.score,
        isSender: true,
      },
    ];

    renderChallengeCard(`
      <h1 class="challenge-title">Good game!</h1>
      <p class="challenge-subtitle">You did well with strangers. How smart are your friends?</p>
      <p class="challenge-label">Friends leaderboard</p>
      ${renderLeaderboardRows(leaderboardRows, { maxRows: 4, highlightSender: true })}
      <div class="challenge-actions">
        <button id="mini-test-friends-button" class="challenge-btn primary" type="button">Test friends</button>
        <button id="mini-play-again-button" class="challenge-btn secondary ${state.connected ? "" : "is-disabled"}" type="button" ${
      state.connected ? "" : "disabled"
    }>Play again</button>
      </div>
    `);
    trackAnalyticsEvent("challenge_completed", {
      mode: "mini",
      outcome: "finished",
      score: round.score,
      question_count: Array.isArray(round.questions) ? round.questions.length : 0,
      answered_count: Array.isArray(round.answers) ? round.answers.length : 0,
    });
    playChallengeSpeechSequence([{ url: CHALLENGE_TTS_ASSETS.greatGame, rate: 1.03 }]);

    const createLinkButton = document.getElementById("mini-test-friends-button");
    const playAgainButton = document.getElementById("mini-play-again-button");
    if (createLinkButton) {
      createLinkButton.addEventListener("click", () => {
        trackAnalyticsEvent("challenge_sender_test_friends_clicked", { mode: "mini" });
        openSenderNameModal(round.participantName || "Player", (resolvedName) => {
          round.participantName = resolvedName;
          state.challengeFlow.autoShareOnRender = true;
          createChallengeFromCurrentRound("web_mini");
        });
      });
    }
    if (playAgainButton) {
      playAgainButton.addEventListener("click", () => {
        if (!state.connected) return;
        trackAnalyticsEvent("tv_play_again_requested", { source: "mini_summary" });
        sendAction("PLAY_AGAIN", { source: "qr_controller" });
        setAppMode("controller");
        setUiMode("connected");
        setStatus("Play again requested.");
      });
    }
  }

  async function createChallengeFromCurrentRound(source) {
    const round = state.challengeFlow.round;
    if (!round) {
      renderChallengeError("Round data missing.");
      return;
    }

    renderChallengeLoading("Creating challenge link...");
    trackAnalyticsEvent("challenge_create_started", {
      source: source || "unknown",
      question_count: Array.isArray(round.questions) ? round.questions.length : 0,
      answered_count: Array.isArray(round.answers) ? round.answers.length : 0,
    });
    try {
      const payload = {
        source: source || "web_mini",
        senderName: round.participantName,
        bgAudioUrl: sanitizeMediaUrl(state.challengeSpeech.loopGameplayUrl || ""),
        category: round.category,
        rules: {
          scoringVersion: "v1",
          pointsPerCorrect: 100,
          questionsPerRound: round.questions.length,
          challengeType: "trivia_snapshot",
        },
        questions: round.questions.map((question) => ({
          questionId: question.questionId,
          questionText: question.questionText,
          choices: question.choices,
          correctIndex: question.correctIndex,
          points: question.points,
          tts: question.tts || null,
        })),
        senderAttempt: {
          participantName: round.participantName,
          score: round.score,
          correctCount: round.correctCount,
          answers: round.answers.map((answer) => ({
            questionId: answer.questionId,
            selectedIndex: answer.selectedIndex,
          })),
        },
      };

      const data = await requestHubJson("/api/v1/challenges", {
        method: "POST",
        body: payload,
      });

      state.challengeFlow.challenge = data.challenge || null;
      state.challengeFlow.lastShareUrl = data.shareUrl || "";
      trackAnalyticsEvent("challenge_created", {
        source: source === "host" ? "host" : "mini",
        question_count:
          data.challenge && Array.isArray(data.challenge.questions) ? data.challenge.questions.length : 0,
        score: round.score,
        correct_count: round.correctCount,
      });
      renderSenderShareCard(data.challenge, data.shareUrl, source === "host" ? "host" : "mini");
    } catch (err) {
      trackAnalyticsEvent("challenge_create_failed", {
        source: source || "unknown",
        error_code: String((err && err.code) || "create_failed"),
      });
      renderChallengeError(`Could not create challenge link (${String(err.code || "error")}).`);
    }
  }

  function renderSenderShareCard(challenge, shareUrl) {
    setChallengeLoopKind("menu");
    if (!challenge) {
      renderChallengeError("Challenge was created but response was incomplete.");
      return;
    }

    const link = shareUrl || challenge.shareUrl || "";
    const leaderboard = Array.isArray(challenge.leaderboard) ? challenge.leaderboard : [];
    const senderName = challenge.senderName || "Player";
    state.challengeFlow.lastShareUrl = link;
    trackAnalyticsEvent("challenge_share_screen_viewed", {
      has_link: !!link,
      leaderboard_entries: leaderboard.length,
    });

    renderChallengeCard(`
      <h1 class="challenge-title">Share the link</h1>
      <p class="challenge-subtitle">When friends play, scores appear in the leaderboard.</p>
      <p class="challenge-label">${escapeHtml(senderName)}'s leaderboard</p>
      ${renderLeaderboardRows(leaderboard, { maxRows: 4, highlightSender: true })}
      <div class="challenge-actions">
        <button id="sender-copy-button" class="challenge-btn primary" type="button">Copy link</button>
        <button id="sender-play-button" class="challenge-btn secondary" type="button">Play again</button>
      </div>
    `);

    const copyButton = document.getElementById("sender-copy-button");
    const playButton = document.getElementById("sender-play-button");

    if (copyButton) {
      copyButton.addEventListener("click", async () => {
        await copyText(link);
        trackAnalyticsEvent("challenge_link_copied", { source: "sender_share_button" });
        copyButton.classList.add("is-copied");
        const originalLabel = "Copy link";
        copyButton.textContent = "Copied";
        setTimeout(() => {
          if (!copyButton.isConnected) return;
          copyButton.classList.remove("is-copied");
          copyButton.textContent = originalLabel;
        }, 1400);
        setStatus("Challenge link copied.");
      });
    }
    if (playButton) {
      playButton.addEventListener("click", () => {
        if (state.connected) {
          trackAnalyticsEvent("tv_play_again_requested", { source: "sender_share" });
          sendAction("PLAY_AGAIN", { source: "qr_controller" });
          returnToControllerHome();
          setStatus("Play again requested.");
          return;
        }
        trackAnalyticsEvent("challenge_play_more_opened", { source: "sender_share" });
        renderSenderPlayMore();
      });
    }

    if (state.challengeFlow.autoShareOnRender && link) {
      state.challengeFlow.autoShareOnRender = false;
      setTimeout(async () => {
        const ok = await shareOrCopyLink(link);
        trackAnalyticsEvent(ok ? "challenge_link_shared" : "challenge_link_share_fallback");
        setStatus(ok ? "Challenge shared." : "Share unavailable. You can copy link.");
      }, 80);
    }
  }

  function renderSenderPlayMore() {
    setChallengeLoopKind("menu");
    trackAnalyticsEvent("challenge_play_more_viewed", { mode: "sender" });
    renderChallengeCard(`
      <section class="playmore-screen">
        <div class="playmore-main">
          <h1 class="challenge-title">You can also play on:</h1>
          ${renderPlatformLogoGrid("sender-more")}
        </div>
        <div class="playmore-footer">
          <p class="challenge-subtitle playmore-subtitle">or start a new game immediately</p>
          <div class="challenge-actions">
            <button id="sender-more-play-here" class="challenge-btn primary" type="button">Play here</button>
          </div>
        </div>
      </section>
    `);

    bindPlatformGrid("sender-more");
    const playHereButton = document.getElementById("sender-more-play-here");
    if (playHereButton) {
      playHereButton.addEventListener("click", () => {
        trackAnalyticsEvent("challenge_play_here_clicked", { mode: "sender" });
        startMiniCreateFlow();
      });
    }
  }

  function renderHostChallengeUnavailable() {
    setChallengeLoopKind("menu");
    trackAnalyticsEvent("host_challenge_unavailable_viewed");
    renderChallengeCard(`
      <h1 class="challenge-title">Challenge data not ready yet</h1>
      <p class="challenge-subtitle">Finish a full TV match to generate a shareable challenge snapshot.</p>
      <div class="challenge-actions">
        <button id="host-open-mini" class="challenge-btn primary" type="button">Start Web Challenge</button>
        <button id="host-back-mic" class="challenge-btn" type="button">Back to microphone</button>
      </div>
    `);

    const miniButton = document.getElementById("host-open-mini");
    const backButton = document.getElementById("host-back-mic");
    if (miniButton) {
      miniButton.addEventListener("click", () => {
        trackAnalyticsEvent("host_challenge_unavailable_start_mini");
        startMiniCreateFlow();
      });
    }
    if (backButton) {
      backButton.addEventListener("click", () => {
        trackAnalyticsEvent("host_challenge_unavailable_back_to_mic");
        setAppMode("controller");
        setUiMode(state.connected ? "connected" : "discovery");
      });
    }
  }

  function openSenderNameModal(initialName, onConfirm) {
    const defaultName = sanitizeDisplayName(
      initialName || safeStorageGet(STORAGE_KEYS.lastName) || safeStorageGet(STORAGE_KEYS.challengeName) || "Player"
    );
    closeSenderNameModal();

    const container = document.createElement("div");
    container.id = "sender-name-modal";
    container.className = "challenge-modal-backdrop name-modal-backdrop";
    container.innerHTML = `
      <section class="name-modal-screen" role="dialog" aria-modal="true" aria-label="Your name">
        <button id="sender-name-close" class="name-modal-close" type="button" aria-label="Close">X</button>
        <div class="name-modal-main">
          <h2 class="challenge-modal-title">Your name?</h2>
          <p class="challenge-modal-subtitle">So friends recognize you</p>
          <input id="sender-name-input" class="challenge-input" maxlength="32" value="${escapeHtmlAttr(defaultName)}" />
          <div class="challenge-modal-actions name-modal-actions">
            <button id="sender-name-confirm" class="challenge-btn primary" type="button">Test friends</button>
          </div>
        </div>
      </section>
    `;

    container.addEventListener("click", (event) => {
      if (event.target === container) {
        closeSenderNameModal();
      }
    });

    document.body.appendChild(container);

    const input = document.getElementById("sender-name-input");
    const confirmButton = document.getElementById("sender-name-confirm");
    const closeButton = document.getElementById("sender-name-close");
    if (input && typeof input.focus === "function") {
      setTimeout(() => {
        input.focus();
        try {
          input.setSelectionRange(0, input.value.length);
        } catch {
          // no-op
        }
      }, 40);
    }
    if (confirmButton) {
      confirmButton.addEventListener("click", () => {
        const name = sanitizeDisplayName(input ? input.value : defaultName);
        safeStorageSet(STORAGE_KEYS.lastName, name);
        safeStorageSet(STORAGE_KEYS.challengeName, name);
        closeSenderNameModal();
        if (typeof onConfirm === "function") {
          onConfirm(name);
        }
      });
    }
    if (closeButton) {
      closeButton.addEventListener("click", () => closeSenderNameModal());
    }
  }

  function closeSenderNameModal() {
    const node = document.getElementById("sender-name-modal");
    if (node && node.parentNode) {
      node.parentNode.removeChild(node);
    }
  }

  function openReceiverNameModal(initialName, onConfirm) {
    const defaultName = sanitizeDisplayName(
      initialName || safeStorageGet(STORAGE_KEYS.receiverName) || "Player"
    );
    closeReceiverNameModal();

    const container = document.createElement("div");
    container.id = "receiver-name-modal";
    container.className = "challenge-modal-backdrop name-modal-backdrop";
    container.innerHTML = `
      <section class="name-modal-screen" role="dialog" aria-modal="true" aria-label="Your name">
        <button id="receiver-name-close" class="name-modal-close" type="button" aria-label="Close">X</button>
        <div class="name-modal-main">
          <h2 class="challenge-modal-title">Your name?</h2>
          <p class="challenge-modal-subtitle">So friends can recognize you on the leaderboard</p>
          <input id="receiver-name-input-modal" class="challenge-input" maxlength="32" value="${escapeHtmlAttr(defaultName)}" />
          <div class="challenge-modal-actions name-modal-actions">
            <button id="receiver-name-confirm" class="challenge-btn primary" type="button">Start challenge</button>
          </div>
        </div>
      </section>
    `;

    container.addEventListener("click", (event) => {
      if (event.target === container) {
        closeReceiverNameModal();
      }
    });

    document.body.appendChild(container);
    const input = document.getElementById("receiver-name-input-modal");
    const confirmButton = document.getElementById("receiver-name-confirm");
    const closeButton = document.getElementById("receiver-name-close");
    if (input && typeof input.focus === "function") {
      setTimeout(() => {
        input.focus();
        try {
          input.setSelectionRange(0, input.value.length);
        } catch {
          // no-op
        }
      }, 40);
    }
    if (confirmButton) {
      confirmButton.addEventListener("click", () => {
        const name = sanitizeDisplayName(input ? input.value : defaultName);
        closeReceiverNameModal();
        if (typeof onConfirm === "function") {
          onConfirm(name);
        }
      });
    }
    if (closeButton) {
      closeButton.addEventListener("click", () => closeReceiverNameModal());
    }
  }

  function closeReceiverNameModal() {
    const node = document.getElementById("receiver-name-modal");
    if (node && node.parentNode) {
      node.parentNode.removeChild(node);
    }
  }

  function renderHostChallengeStart(draft) {
    setChallengeLoopKind("menu");
    if (!draft) {
      renderHostChallengeUnavailable();
      return;
    }

    const rows =
      Array.isArray(draft.leaderboard) && draft.leaderboard.length > 0
        ? draft.leaderboard.slice(0, 4)
        : [
            {
              rank: 1,
              participantName: draft.senderName,
              score: draft.senderAttempt ? draft.senderAttempt.score : 0,
              isSender: true,
            },
          ];

    renderChallengeCard(`
      <h1 class="challenge-title">Good game!</h1>
      <p class="challenge-subtitle">You did well with strangers. How smart are your friends?</p>
      <p class="challenge-label">Friends leaderboard</p>
      ${renderLeaderboardRows(rows, { maxRows: 4, highlightSender: true })}
      <div class="challenge-actions">
        <button id="host-test-friends-button" class="challenge-btn primary" type="button">Test friends</button>
        <button id="host-play-again-button" class="challenge-btn secondary" type="button">Play again</button>
      </div>
    `);

    const testFriendsButton = document.getElementById("host-test-friends-button");
    const playAgainButton = document.getElementById("host-play-again-button");

    if (testFriendsButton) {
      testFriendsButton.addEventListener("click", () => {
        openSenderNameModal(draft.senderName, async (senderName) => {
          const questions = draft.questions.map((question) => ({
            questionId: question.questionId,
            questionText: question.questionText,
            choices: question.choices,
            correctIndex: question.correctIndex,
            points: question.points,
            tts: question.tts || null,
          }));
          state.challengeFlow.round = {
            mode: "host",
            participantName: senderName,
            participantId: "",
            category: draft.category,
            questions,
            index: questions.length,
            score: draft.senderAttempt ? asFiniteInt(draft.senderAttempt.score, 0) : 0,
            correctCount: draft.senderAttempt ? asFiniteInt(draft.senderAttempt.correctCount, 0) : 0,
            answers:
              draft.senderAttempt && Array.isArray(draft.senderAttempt.answers)
                ? draft.senderAttempt.answers.slice()
                : [],
            locked: false,
          };
          state.challengeFlow.autoShareOnRender = true;
          await createChallengeFromCurrentRound("host");
        });
      });
    }

    if (playAgainButton) {
      playAgainButton.addEventListener("click", () => {
        trackAnalyticsEvent("tv_play_again_requested", { source: "host_summary" });
        sendAction("PLAY_AGAIN", { source: "qr_controller" });
        setAppMode("controller");
        setUiMode(state.connected ? "connected" : "discovery");
        setStatus("Play again requested.");
      });
    }
  }

  function renderChallengeCard(contentHtml) {
    setAppMode("challenge");
    if (!challengeShellEl) return;
    closePlatformModal();
    closeReceiverNameModal();
    challengeShellEl.hidden = false;
    challengeShellEl.innerHTML = `<div class="challenge-card">${contentHtml}</div>`;
  }

  function returnToControllerHome() {
    clearRoundTimer();
    stopChallengeSpeech();
    closePlatformModal();
    closeSenderNameModal();
    closeReceiverNameModal();
    setAppMode("controller");
    setUiMode(state.connected ? "connected" : "discovery");
    if (state.connected && state.sessionId && state.joinToken) {
      updateUrlWithSession();
      return;
    }
    updateUrlToDiscovery();
    setStatus(DISCOVERY_PROMPT);
    showJoinTools();
  }

  function updateUrlToCreateMode() {
    try {
      window.history.replaceState({}, "", "/join?mode=create");
    } catch {
      // no-op
    }
  }

  async function requestHubJson(path, options) {
    const opts = options || {};
    const primaryBase = sanitizeHubBase(state.hubBase || "");
    const originBase = sanitizeHubBase(window.location.origin);
    const bases = [];
    if (primaryBase) {
      bases.push(primaryBase);
    }
    if (originBase && originBase !== primaryBase) {
      bases.push(originBase);
    }
    if (bases.length === 0) {
      bases.push(originBase || window.location.origin);
    }

    let lastError = null;
    for (let i = 0; i < bases.length; i += 1) {
      const base = bases[i].replace(/\/$/, "");
      try {
        const response = await fetch(`${base}${path}`, {
          method: opts.method || "GET",
          headers: {
            "Content-Type": "application/json",
          },
          body: opts.body ? JSON.stringify(opts.body) : undefined,
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok || data.ok === false) {
          const err = new Error(data.error || `http_${response.status}`);
          err.code = data.error || "";
          err.status = response.status;
          throw err;
        }

        if (state.hubBase !== base) {
          state.hubBase = base;
          safeStorageSet(STORAGE_KEYS.lastHubBase, base);
        }
        return data;
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error("request_failed");
  }

  async function shareOrCopyLink(url) {
    const text = String(url || "").trim();
    if (!text) return false;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Trivia Challenge",
          text: "Can you beat my score?",
          url: text,
        });
        trackAnalyticsEvent("challenge_link_shared_native");
        return true;
      } catch {
        trackAnalyticsEvent("challenge_link_share_native_failed");
      }
    }
    await copyText(text);
    trackAnalyticsEvent("challenge_link_copied_fallback");
    return false;
  }

  async function copyText(text) {
    const value = String(text || "");
    if (!value) return;

    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(value);
        trackAnalyticsEvent("copy_to_clipboard_success", { method: "clipboard_api" });
        return;
      } catch {
        trackAnalyticsEvent("copy_to_clipboard_failed", { method: "clipboard_api" });
      }
    }

    const temp = document.createElement("textarea");
    temp.value = value;
    temp.setAttribute("readonly", "true");
    temp.style.position = "absolute";
    temp.style.left = "-9999px";
    document.body.appendChild(temp);
    temp.select();
    try {
      document.execCommand("copy");
      trackAnalyticsEvent("copy_to_clipboard_success", { method: "exec_command" });
    } catch {
      trackAnalyticsEvent("copy_to_clipboard_failed", { method: "exec_command" });
    }
    document.body.removeChild(temp);
  }

  function stopChallengeSpeech() {
    state.challengeSpeech.token += 1;

    if (state.challengeSpeech.activeAudio) {
      try {
        state.challengeSpeech.activeAudio.pause();
        state.challengeSpeech.activeAudio.currentTime = 0;
      } catch {
        // no-op
      }
    }
    state.challengeSpeech.activeAudio = null;

    if (window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // no-op
      }
    }

    if (state.challengeSpeech.loopDucked) {
      state.challengeSpeech.loopDucked = false;
      syncChallengeLoopAudio();
    }
  }

  function initChallengeAudioEngine() {
    if (!CHALLENGE_USE_WEB_AUDIO_LOOP_GAIN && !CHALLENGE_USE_WEB_AUDIO_SPEECH) return;
    if (state.challengeSpeech.audioContext && state.challengeSpeech.masterGain) {
      return;
    }
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    try {
      const ctx = new AudioContextCtor();
      const masterGain = ctx.createGain();
      const musicGain = ctx.createGain();
      const speechGain = CHALLENGE_USE_WEB_AUDIO_SPEECH ? ctx.createGain() : null;

      masterGain.gain.value = 1;
      musicGain.gain.value = CHALLENGE_LOOP_VOLUME;
      if (speechGain) {
        speechGain.gain.value = CHALLENGE_SPEECH_GAIN;
      }

      musicGain.connect(masterGain);
      if (speechGain) {
        speechGain.connect(masterGain);
      }
      masterGain.connect(ctx.destination);

      state.challengeSpeech.audioContext = ctx;
      state.challengeSpeech.masterGain = masterGain;
      state.challengeSpeech.musicGain = musicGain;
      state.challengeSpeech.speechGain = speechGain;
    } catch {
      // no-op
    }
  }

  function resumeChallengeAudioEngine() {
    if (!CHALLENGE_USE_WEB_AUDIO_LOOP_GAIN && !CHALLENGE_USE_WEB_AUDIO_SPEECH) return;
    initChallengeAudioEngine();
    const ctx = state.challengeSpeech.audioContext;
    if (!ctx || typeof ctx.resume !== "function") return;
    if (ctx.state === "running") {
      if (state.challengeSpeech.loopAudio) {
        connectLoopAudioToMixer(state.challengeSpeech.loopAudio);
        setChallengeMusicVolume(state.challengeSpeech.loopDucked ? CHALLENGE_LOOP_DUCK_VOLUME : CHALLENGE_LOOP_VOLUME);
      }
      return;
    }
    ctx.resume()
      .then(() => {
        if (state.challengeSpeech.loopAudio) {
          connectLoopAudioToMixer(state.challengeSpeech.loopAudio);
          setChallengeMusicVolume(state.challengeSpeech.loopDucked ? CHALLENGE_LOOP_DUCK_VOLUME : CHALLENGE_LOOP_VOLUME);
        }
      })
      .catch(() => {
        // no-op
      });
  }

  function setChallengeMusicVolume(value) {
    const v = clampFloat(value, 0, 1, CHALLENGE_LOOP_VOLUME);
    if (CHALLENGE_USE_WEB_AUDIO_LOOP_GAIN && state.challengeSpeech.musicGain) {
      try {
        state.challengeSpeech.musicGain.gain.setTargetAtTime(
          v,
          state.challengeSpeech.audioContext ? state.challengeSpeech.audioContext.currentTime : 0,
          0.04
        );
      } catch {
        state.challengeSpeech.musicGain.gain.value = v;
      }
    }

    if (state.challengeSpeech.loopAudio) {
      if (state.challengeSpeech.loopAudio._challengeLoopConnected) {
        state.challengeSpeech.loopAudio.muted = false;
        state.challengeSpeech.loopAudio.volume = 1;
      } else {
        const supportsVolume = supportsLoopElementVolumeControl();
        state.challengeSpeech.loopAudio.muted = !supportsVolume;
        state.challengeSpeech.loopAudio.volume = supportsVolume ? v : 1;
      }
    }
  }

  function connectLoopAudioToMixer(audio) {
    if (!CHALLENGE_USE_WEB_AUDIO_LOOP_GAIN) return false;
    initChallengeAudioEngine();
    if (!audio || !state.challengeSpeech.audioContext || !state.challengeSpeech.musicGain) return false;
    if (state.challengeSpeech.audioContext.state !== "running") return false;
    if (audio._challengeLoopConnected === true) return true;

    try {
      const source = state.challengeSpeech.audioContext.createMediaElementSource(audio);
      source.connect(state.challengeSpeech.musicGain);
      audio._challengeLoopConnected = true;
      audio._challengeLoopSource = source;
      audio.volume = 1;
      return true;
    } catch {
      return false;
    }
  }

  function connectSpeechAudioToMixer(audio) {
    if (!CHALLENGE_USE_WEB_AUDIO_SPEECH) return false;
    initChallengeAudioEngine();
    if (!audio || !state.challengeSpeech.audioContext || !state.challengeSpeech.speechGain) return false;
    if (state.challengeSpeech.audioContext.state !== "running") return false;
    if (audio._challengeSpeechConnected === true) return true;

    try {
      const source = state.challengeSpeech.audioContext.createMediaElementSource(audio);
      source.connect(state.challengeSpeech.speechGain);
      audio._challengeSpeechConnected = true;
      audio._challengeSpeechSource = source;
      audio.volume = 1;
      return true;
    } catch {
      return false;
    }
  }

  function setChallengeLoopKind(kind) {
    if (!CHALLENGE_BG_AUDIO_ENABLED) {
      state.challengeSpeech.loopKind = "off";
      syncChallengeLoopAudio();
      return;
    }
    const next = kind === "gameplay" ? "gameplay" : kind === "menu" ? "menu" : "off";
    if (state.challengeSpeech.loopKind === next) return;
    state.challengeSpeech.loopKind = next;
    syncChallengeLoopAudio();
  }

  function syncChallengeLoopAudio() {
    if (!CHALLENGE_BG_AUDIO_ENABLED) {
      if (state.challengeSpeech.loopAudio) {
        try {
          state.challengeSpeech.loopAudio.pause();
          state.challengeSpeech.loopAudio.currentTime = 0;
        } catch {
          // no-op
        }
      }
      return;
    }
    resumeChallengeAudioEngine();
    const shouldPlay = state.appMode === "challenge" && state.challengeSpeech.loopKind !== "off";
    const loopUrl =
      state.challengeSpeech.loopKind === "gameplay"
        ? sanitizeMediaUrl(state.challengeSpeech.loopGameplayUrl || "")
        : state.challengeSpeech.loopKind === "menu"
          ? sanitizeMediaUrl(state.challengeSpeech.loopMenuUrl || "")
          : "";
    if (!shouldPlay || !loopUrl) {
      if (state.challengeSpeech.loopAudio) {
        try {
          state.challengeSpeech.loopAudio.pause();
          state.challengeSpeech.loopAudio.currentTime = 0;
        } catch {
          // no-op
        }
      }
      return;
    }

    let audio = state.challengeSpeech.loopAudio;
    if (!audio || audio.dataset.src !== loopUrl) {
      if (audio) {
        try {
          audio.pause();
        } catch {
          // no-op
        }
      }
      audio = new Audio();
      audio.loop = true;
      audio.preload = "auto";
      audio.playsInline = true;
      audio.crossOrigin = "anonymous";
      audio.dataset.src = loopUrl;
      audio.src = loopUrl;
      state.challengeSpeech.loopAudio = audio;
      audio.volume = state.challengeSpeech.loopDucked ? CHALLENGE_LOOP_DUCK_VOLUME : CHALLENGE_LOOP_VOLUME;
    }

    const connected = connectLoopAudioToMixer(audio);
    if (!connected && !supportsLoopElementVolumeControl()) {
      audio.muted = true;
    } else {
      audio.muted = false;
    }
    setChallengeMusicVolume(state.challengeSpeech.loopDucked ? CHALLENGE_LOOP_DUCK_VOLUME : CHALLENGE_LOOP_VOLUME);
    if (audio.paused) {
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === "function") {
        if (typeof playPromise.then === "function") {
          playPromise.then(() => {
            state.challengeSpeech.mediaUnlocked = true;
          });
        }
        playPromise.catch(() => {
          // iOS autoplay/user-gesture restrictions; retry on next interaction.
        });
      }
    }
  }

  function playChallengeSpeechSequence(parts) {
    if (!Array.isArray(parts) || parts.length === 0) return;
    stopChallengeSpeech();
    const token = state.challengeSpeech.token;
    const sequence = parts.filter((item) => isPlainObject(item) || typeof item === "string");
    if (sequence.length === 0) return;
    state.challengeSpeech.loopDucked = true;
    syncChallengeLoopAudio();

    void (async () => {
      try {
        for (let i = 0; i < sequence.length; i += 1) {
          if (token !== state.challengeSpeech.token || state.appMode !== "challenge") return;
          const entry = sequence[i];
          const rate = clampFloat(
            typeof entry === "string" ? 1 : Number(entry.rate),
            0.75,
            2,
            1
          );
          const url = sanitizeMediaUrl(typeof entry === "string" ? entry : entry.url);
          if (url) {
            await playChallengeSpeechUrl(url, token, rate);
            continue;
          }
          const text = sanitizeInlineText(typeof entry === "string" ? entry : entry.text || "");
          if (text) {
            await speakChallengeTextFallback(text, token, rate);
          }
        }
      } finally {
        if (token === state.challengeSpeech.token) {
          state.challengeSpeech.loopDucked = false;
          syncChallengeLoopAudio();
        }
      }
    })();
  }

  function playRoundIntroTts(round, question) {
    const parts = [];
    if (round && round.index === 0 && round.category && round.category.name) {
      parts.push({ text: round.category.name, rate: 1.2 });
    }
    const value = question ? question.points : 100;
    const amountUrl =
      value >= 300
        ? CHALLENGE_TTS_ASSETS.for300
        : value >= 200
          ? CHALLENGE_TTS_ASSETS.for200
          : CHALLENGE_TTS_ASSETS.for100;
    parts.push({ url: amountUrl, rate: 1.06 });
    playChallengeSpeechSequence(parts);
  }

  function playQuestionTts(question) {
    if (!isPlainObject(question)) return;
    const choices = Array.isArray(question.choices) ? question.choices : [];
    const tts = normalizeQuestionTts(question, choices.length);
    const choiceUrls = tts && Array.isArray(tts.choiceUrls) ? tts.choiceUrls : [];
    const parts = [];
    const spokenQuestion = stripQuestionNumberPrefix(question.questionText || "");

    if (spokenQuestion) {
      parts.push({ text: spokenQuestion, rate: 1.2 });
    } else if (tts && tts.questionUrl) {
      parts.push({ url: tts.questionUrl, rate: 1.2 });
    } else {
      parts.push({ text: sanitizeInlineText(question.questionText || ""), rate: 1.2 });
    }

    for (let i = 0; i < choices.length; i += 1) {
      const choiceUrl = sanitizeMediaUrl(choiceUrls[i] || "");
      if (choiceUrl) {
        parts.push({ url: choiceUrl, rate: 1.24 });
      } else {
        parts.push({ text: choices[i] || "", rate: 1.24 });
      }
    }

    playChallengeSpeechSequence(parts);
  }

  function playFeedbackTts(isCorrect) {
    playChallengeSpeechSequence([
      { url: isCorrect ? CHALLENGE_TTS_ASSETS.correct : CHALLENGE_TTS_ASSETS.wrong, rate: 1.06 },
    ]);
  }

  function playEndResultTts(outcome) {
    const normalized = outcome === "win" || outcome === "tie" ? outcome : "lose";
    if (normalized === "win") {
      playChallengeSpeechSequence([
        { url: CHALLENGE_TTS_ASSETS.congratulations, rate: 1.03 },
        { url: CHALLENGE_TTS_ASSETS.youWin, rate: 1.03 },
      ]);
      return;
    }
    if (normalized === "tie") {
      playChallengeSpeechSequence([{ url: CHALLENGE_TTS_ASSETS.tie, rate: 1.03 }]);
      return;
    }
    playChallengeSpeechSequence([{ url: CHALLENGE_TTS_ASSETS.youLose, rate: 1.03 }]);
  }

  function animateDuelBars(senderScore, playerScore) {
    const senderBar = document.querySelector('[data-duel-bar="sender"]');
    const playerBar = document.querySelector('[data-duel-bar="player"]');
    if (!(senderBar instanceof HTMLElement) || !(playerBar instanceof HTMLElement)) return;

    const maxPx = 240;
    const minPx = 28;
    const maxScore = Math.max(100, asFiniteInt(senderScore, 0), asFiniteInt(playerScore, 0));
    const senderHeight =
      senderScore > 0 ? Math.max(minPx, Math.round((asFiniteInt(senderScore, 0) / maxScore) * maxPx)) : 12;
    const playerHeight =
      playerScore > 0 ? Math.max(minPx, Math.round((asFiniteInt(playerScore, 0) / maxScore) * maxPx)) : 12;

    senderBar.style.height = "12px";
    playerBar.style.height = "12px";

    requestAnimationFrame(() => {
      senderBar.style.height = `${senderHeight}px`;
      playerBar.style.height = `${playerHeight}px`;
    });
  }

  function playChallengeSpeechUrl(url, token, rate) {
    return new Promise((resolve) => {
      if (token !== state.challengeSpeech.token || state.appMode !== "challenge") {
        resolve();
        return;
      }

      resumeChallengeAudioEngine();
      const audio = new Audio();
      audio.preload = "auto";
      audio.playsInline = true;
      audio.src = url;
      audio.volume = CHALLENGE_SPEECH_VOLUME;
      audio.muted = false;
      audio.playbackRate = clampFloat(rate, 0.75, 2, 1);
      const connected = connectSpeechAudioToMixer(audio);
      if (!connected) {
        audio.volume = CHALLENGE_SPEECH_VOLUME;
      }
      state.challengeSpeech.activeAudio = audio;

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        audio.onended = null;
        audio.onerror = null;
        if (state.challengeSpeech.activeAudio === audio) {
          state.challengeSpeech.activeAudio = null;
        }
        resolve();
      };

      audio.onended = finish;
      audio.onerror = finish;

      try {
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === "function") {
          if (typeof playPromise.then === "function") {
            playPromise.then(() => {
              state.challengeSpeech.mediaUnlocked = true;
            });
          }
          playPromise.catch(() => {
            finish();
          });
        }
      } catch {
        finish();
      }
    });
  }

  function speakChallengeTextFallback(text, token, rate) {
    return new Promise((resolve) => {
      if (
        token !== state.challengeSpeech.token ||
        state.appMode !== "challenge" ||
        !window.speechSynthesis ||
        typeof window.SpeechSynthesisUtterance !== "function"
      ) {
        resolve();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = clampFloat(rate, 0.75, 2, 1.15);
      utterance.pitch = 1;

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        utterance.onend = null;
        utterance.onerror = null;
        resolve();
      };

      utterance.onend = finish;
      utterance.onerror = finish;

      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        finish();
      }
    });
  }

  function normalizeQuestionTts(rawQuestion, choiceCount) {
    if (!isPlainObject(rawQuestion)) return null;
    const ttsRoot = isPlainObject(rawQuestion.tts) ? rawQuestion.tts : {};

    const questionUrl = sanitizeMediaUrl(
      rawQuestion.questionTtsUrl ||
        rawQuestion.questionTts ||
        ttsRoot.questionUrl ||
        extractMediaUrl(ttsRoot.question || "")
    );

    let sourceChoiceUrls = [];
    if (Array.isArray(rawQuestion.choiceTtsUrls)) {
      sourceChoiceUrls = rawQuestion.choiceTtsUrls;
    } else if (Array.isArray(rawQuestion.choiceTts)) {
      sourceChoiceUrls = rawQuestion.choiceTts;
    } else if (Array.isArray(ttsRoot.choiceUrls)) {
      sourceChoiceUrls = ttsRoot.choiceUrls;
    } else if (Array.isArray(ttsRoot.choices)) {
      sourceChoiceUrls = ttsRoot.choices;
    } else if (isPlainObject(ttsRoot.choices)) {
      sourceChoiceUrls = Object.values(ttsRoot.choices);
    }

    const maxChoices = Math.max(0, asFiniteInt(choiceCount, 0));
    const choiceUrls = [];
    for (let i = 0; i < maxChoices; i += 1) {
      const candidate = sourceChoiceUrls[i];
      choiceUrls.push(sanitizeMediaUrl(extractMediaUrl(candidate)));
    }

    const hasQuestion = !!questionUrl;
    const hasChoice = choiceUrls.some((value) => !!value);
    if (!hasQuestion && !hasChoice) return null;

    return {
      questionUrl,
      choiceUrls,
    };
  }

  function stripQuestionNumberPrefix(value) {
    const text = sanitizeInlineText(value || "");
    if (!text) return "";
    const cleaned = text.replace(
      /^\s*question\s*(?:number\s*)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*[\.\:\-\,]?\s*/i,
      ""
    );
    return sanitizeInlineText(cleaned || text);
  }

  function supportsLoopElementVolumeControl() {
    if (typeof state.challengeSpeech.loopVolumeControlSupported === "boolean") {
      return state.challengeSpeech.loopVolumeControlSupported;
    }
    if (isLikelyIosMobile()) {
      state.challengeSpeech.loopVolumeControlSupported = false;
      return false;
    }
    try {
      const probe = new Audio();
      probe.volume = 0.37;
      state.challengeSpeech.loopVolumeControlSupported = Math.abs(Number(probe.volume) - 0.37) < 0.01;
      return state.challengeSpeech.loopVolumeControlSupported;
    } catch {
      state.challengeSpeech.loopVolumeControlSupported = false;
      return false;
    }
  }

  function extractMediaUrl(value) {
    if (typeof value === "string") return value;
    if (!isPlainObject(value)) return "";
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

  function sanitizeMediaUrl(value) {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (!/^https?:\/\//i.test(trimmed)) return "";
    return trimmed.slice(0, 2048);
  }

  function resolveLoopAudioUrl(value, kind) {
    const normalizedKind = kind === "menu" ? "menu" : "gameplay";
    const fallback = CHALLENGE_LOOP_AUDIO[normalizedKind];
    const raw = sanitizeMediaUrl(typeof value === "string" ? value : "");
    if (!raw) return fallback;
    if (!SELF_ORIGIN) return raw;

    try {
      const parsed = new URL(raw);
      if (parsed.origin === SELF_ORIGIN) {
        return raw;
      }
    } catch {
      return fallback;
    }

    return `${SELF_ORIGIN}/api/v1/audio/loop/${normalizedKind}?src=${encodeURIComponent(raw)}`;
  }

  function isLikelyIosMobile() {
    try {
      const ua = String(navigator.userAgent || "");
      const platform = String(navigator.platform || "");
      const touchPoints = Number(navigator.maxTouchPoints || 0);
      return /iPad|iPhone|iPod/i.test(ua) || (/Mac/i.test(platform) && touchPoints > 1);
    } catch {
      return false;
    }
  }

  function normalizePlayableQuestions(rawList) {
    if (!Array.isArray(rawList)) return [];
    const out = [];

    for (let i = 0; i < rawList.length; i += 1) {
      const item = rawList[i];
      if (!isPlainObject(item)) continue;

      const questionId = sanitizeInlineText(item.questionId || item.id || item.qid || `q_${i + 1}`);
      const questionText = sanitizeInlineText(
        item.questionText || item.question || item.text || item.prompt || ""
      );
      const rawChoices = Array.isArray(item.choices)
        ? item.choices
        : Array.isArray(item.options)
          ? item.options
          : Array.isArray(item.answers)
            ? item.answers
            : [];
      const choices = rawChoices.map((value) => sanitizeInlineText(value)).filter(Boolean).slice(0, 8);
      let correctIndex = asFiniteInt(item.correctIndex, asFiniteInt(item.correctAnswerIndex, -1));
      if (correctIndex < 0 && typeof item.correctAnswer === "string" && choices.length > 0) {
        const needle = sanitizeInlineText(item.correctAnswer).toLowerCase();
        correctIndex = choices.findIndex((choice) => choice.toLowerCase() === needle);
      }
      const points = Math.max(0, asFiniteInt(item.points, 100));
      const tts = normalizeQuestionTts(item, choices.length);

      if (!questionText || choices.length < 2 || correctIndex < 0 || correctIndex >= choices.length) {
        continue;
      }

      out.push({
        questionId: questionId || `q_${out.length + 1}`,
        questionText,
        choices,
        correctIndex,
        points,
        tts,
      });
    }

    return out;
  }

  function normalizeRoundAnswers(rawAnswers, questions, includeMissing) {
    const map = new Map();
    if (Array.isArray(rawAnswers)) {
      for (let i = 0; i < rawAnswers.length; i += 1) {
        const item = rawAnswers[i];
        if (!isPlainObject(item)) continue;
        const questionId = sanitizeInlineText(item.questionId || item.id || "");
        if (!questionId) continue;
        const selectedIndex = asFiniteInt(item.selectedIndex, asFiniteInt(item.answerIndex, -1));
        map.set(questionId, selectedIndex);
      }
    }

    const out = [];
    for (let i = 0; i < questions.length; i += 1) {
      const question = questions[i];
      const has = map.has(question.questionId);
      if (!includeMissing && !has) continue;
      const selectedIndex = has ? map.get(question.questionId) : -1;
      out.push({
        questionId: question.questionId,
        questionText: question.questionText,
        choices: question.choices,
        selectedIndex,
        correctIndex: question.correctIndex,
        pointsPossible: question.points,
      });
    }

    return out;
  }

  function normalizeCategoryMeta(raw) {
    if (!isPlainObject(raw)) {
      return { id: "general", name: "General Knowledge" };
    }
    const id = sanitizeInlineText(raw.id || raw.categoryId || raw.category || "general");
    const name = sanitizeInlineText(raw.displayName || raw.name || raw.title || id || "General Knowledge");
    return {
      id: id || "general",
      name: name || "General Knowledge",
    };
  }

  function normalizeLeaderboardRows(rawRows) {
    if (!Array.isArray(rawRows)) return [];
    const out = [];
    for (let i = 0; i < rawRows.length; i += 1) {
      const row = rawRows[i];
      if (!isPlainObject(row)) continue;
      out.push({
        rank: asFiniteInt(row.rank, i + 1),
        participantName: sanitizeDisplayName(row.participantName || row.name || "Player"),
        score: asFiniteInt(row.score, 0),
        isSender: !!row.isSender,
      });
    }
    return out;
  }

  function shuffleArray(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = out[i];
      out[i] = out[j];
      out[j] = temp;
    }
    return out;
  }

  function shuffleQuestionChoices(question) {
    const choices = Array.isArray(question.choices) ? question.choices.slice() : [];
    const ttsChoiceUrls =
      question && isPlainObject(question.tts) && Array.isArray(question.tts.choiceUrls)
        ? question.tts.choiceUrls.slice(0, choices.length)
        : [];
    const pairs = choices.map((choice, index) => ({
      choice,
      index,
      choiceTtsUrl: sanitizeMediaUrl(ttsChoiceUrls[index] || ""),
    }));
    const shuffled = shuffleArray(pairs);
    let nextCorrectIndex = 0;
    for (let i = 0; i < shuffled.length; i += 1) {
      if (shuffled[i].index === question.correctIndex) {
        nextCorrectIndex = i;
        break;
      }
    }
    return {
      questionId: question.questionId,
      questionText: question.questionText,
      choices: shuffled.map((item) => item.choice),
      correctIndex: nextCorrectIndex,
      points: question.points,
      tts: normalizeQuestionTts(
        {
          tts: {
            questionUrl:
              question && isPlainObject(question.tts) ? sanitizeMediaUrl(question.tts.questionUrl || "") : "",
            choiceUrls: shuffled.map((item) => item.choiceTtsUrl || ""),
          },
        },
        shuffled.length
      ),
    };
  }

  function getOrCreateParticipantId(challengeId) {
    const key = `qrcontroller.challenge.pid.${challengeId}`;
    const existing = sanitizeInlineText(safeStorageGet(key));
    if (existing) return existing;
    const generated = sanitizeInlineText(makeClientId()).slice(0, 64);
    safeStorageSet(key, generated);
    return generated;
  }

  function safeStorageGet(key) {
    try {
      return String(localStorage.getItem(key) || "");
    } catch {
      return "";
    }
  }

  function safeStorageSet(key, value) {
    try {
      localStorage.setItem(key, String(value || ""));
    } catch {
      // no-op
    }
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

  function sanitizeInlineText(value) {
    if (typeof value !== "string") return "";
    return value
      .trim()
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 280);
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

  function asFiniteInt(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.floor(n);
  }

  function clampFloat(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeHtmlAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
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
    stopChallengeSpeech();

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
