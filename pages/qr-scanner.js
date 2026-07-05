/* ==========================================================================
   CyberShield AI — QR Shield Scanner
   Camera + image decoding via html5-qrcode, followed by an in-browser
   "AI cybersecurity analyst" pass that classifies the payload, scores its
   risk, and explains the verdict in plain language. Fully client-side.
   ========================================================================== */

(() => {
  "use strict";

  /* ------------------------------------------------------------------ *
   *  DOM references
   * ------------------------------------------------------------------ */
  const stage = document.getElementById("scanner-stage");
  const videoRegion = document.getElementById("qr-video-region");
  const statusEl = document.getElementById("scan-status");
  const startBtn = document.getElementById("start-camera");
  const stopBtn = document.getElementById("stop-camera");
  const torchBtn = document.getElementById("toggle-torch");
  const switchBtn = document.getElementById("switch-camera");
  const fileInput = document.getElementById("qr-image");
  const cameraSelectWrap = document.getElementById("camera-select-wrap");
  const cameraSelect = document.getElementById("camera-select");

  const placeholder = document.getElementById("results-placeholder");
  const report = document.getElementById("qr-report");

  const recentWrap = document.getElementById("recent-scans");
  const recentList = document.getElementById("recent-list");
  const clearHistoryBtn = document.getElementById("clear-history");

  const READER_ID = "qr-video-region";
  const HISTORY_KEY = "cybershield_qr_history";

  /* ------------------------------------------------------------------ *
   *  Camera / scanner lifecycle
   * ------------------------------------------------------------------ */
  let html5Qr = null;
  let cameras = [];
  let activeCameraId = null;
  let torchOn = false;
  let isScanning = false;
  let lastResultText = null;
  let lastResultAt = 0;

  function setStatus(text, mode) {
    statusEl.textContent = text;
    statusEl.classList.remove("is-live", "is-error");
    if (mode) statusEl.classList.add(mode);
  }

  function isSecureContextOk() {
    return window.isSecureContext || location.hostname === "localhost";
  }

  async function populateCameraList() {
    try {
      cameras = await Html5Qrcode.getCameras();
    } catch (err) {
      cameras = [];
    }

    if (cameras.length > 1) {
      cameraSelectWrap.style.display = "flex";
      cameraSelect.innerHTML = cameras
        .map((c, i) => `<option value="${c.id}">${c.label || "Camera " + (i + 1)}</option>`)
        .join("");
    } else {
      cameraSelectWrap.style.display = "none";
    }
  }

  function pickRearCameraId() {
    if (!cameras.length) return null;
    // Prefer a label that clearly indicates the rear/back/environment lens.
    const rear = cameras.find((c) => /back|rear|environment/i.test(c.label || ""));
    if (rear) return rear.id;
    // Many phones list the rear camera last for single-camera-array devices.
    return cameras[cameras.length - 1].id;
  }

  async function startScanner(preferredId) {
    if (isScanning) return;

    if (!isSecureContextOk()) {
      setStatus("Camera requires HTTPS (or localhost). Try the image upload instead.", "is-error");
      return;
    }

    if (typeof Html5Qrcode === "undefined") {
      setStatus("Scanner library failed to load. Check your connection and reload.", "is-error");
      return;
    }

    try {
      setStatus("Requesting camera access…");

      if (!html5Qr) {
        html5Qr = new Html5Qrcode(READER_ID, {
          formatsToSupport: undefined, // let the library try all supported 1D/2D formats
          verbose: false,
        });
      }

      if (!cameras.length) await populateCameraList();

      const cameraId = preferredId || activeCameraId || pickRearCameraId();
      const cameraTarget = cameraId ? { deviceId: { exact: cameraId } } : { facingMode: "environment" };

      const config = {
        fps: 15,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const min = Math.min(viewfinderWidth, viewfinderHeight);
          const size = Math.floor(min * 0.72);
          return { width: size, height: size };
        },
        aspectRatio: 1.0,
        disableFlip: false,
        videoConstraints: {
          ...cameraTarget,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 30 },
          advanced: [{ focusMode: "continuous" }],
        },
      };

      await html5Qr.start(
        cameraTarget,
        config,
        onDecodeSuccess,
        () => {
          /* per-frame "no code found" callback — expected constantly, ignore */
        }
      );

      isScanning = true;
      activeCameraId = cameraId;
      stage.classList.add("is-active");
      startBtn.disabled = true;
      stopBtn.disabled = false;
      torchBtn.disabled = false;
      switchBtn.disabled = cameras.length < 2;
      setStatus("Scanning… point the camera at a QR code", "is-live");
      applyMirrorCorrection(cameraId);
    } catch (err) {
      console.error(err);
      isScanning = false;
      stage.classList.remove("is-active");
      const msg = /NotAllowedError|Permission/i.test(String(err))
        ? "Camera permission denied. Allow camera access and try again."
        : /NotFoundError/i.test(String(err))
        ? "No camera found on this device."
        : "Could not start the camera. You can still upload a QR image below.";
      setStatus(msg, "is-error");
    }
  }

  function applyMirrorCorrection(cameraId) {
    let isFrontFacing = false;

    // 1. Trust the browser's own facingMode report when available.
    try {
      const settings = html5Qr.getRunningTrackSettings?.();
      if (settings && settings.facingMode) {
        isFrontFacing = settings.facingMode === "user";
      } else {
        throw new Error("no facingMode reported");
      }
    } catch {
      // 2. Fall back to guessing from the device label (covers most
      // laptops/webcams, where facingMode is often not reported at all).
      const cam = cameras.find((c) => c.id === cameraId);
      const label = (cam && cam.label) || "";
      const looksRear = /back|rear|environment/i.test(label);
      const looksFront = /front|user|face|integrated|webcam|built-?in/i.test(label);
      isFrontFacing = looksFront || (!looksRear && cameras.length <= 1);
    }

    videoRegion.classList.toggle("mirror-fix", isFrontFacing);
  }

  async function stopScanner() {
    if (!html5Qr || !isScanning) return;
    try {
      if (torchOn) await setTorch(false).catch(() => {});
      await html5Qr.stop();
      html5Qr.clear();
    } catch (err) {
      console.warn("Error stopping scanner:", err);
    } finally {
      isScanning = false;
      stage.classList.remove("is-active");
      startBtn.disabled = false;
      stopBtn.disabled = true;
      torchBtn.disabled = true;
      torchBtn.setAttribute("aria-pressed", "false");
      setStatus("Camera stopped.");
    }
  }

  async function switchCamera() {
    if (cameras.length < 2) return;
    const idx = cameras.findIndex((c) => c.id === activeCameraId);
    const next = cameras[(idx + 1) % cameras.length];
    await stopScanner();
    await startScanner(next.id);
    cameraSelect.value = next.id;
  }

  async function setTorch(on) {
    if (!html5Qr) return;
    const capabilities = html5Qr.getRunningTrackCapabilities?.();
    if (!capabilities || !capabilities.torch) {
      throw new Error("Torch not supported");
    }
    await html5Qr.applyVideoConstraints({ advanced: [{ torch: on }] });
    torchOn = on;
    torchBtn.setAttribute("aria-pressed", String(on));
  }

  async function toggleTorch() {
    try {
      await setTorch(!torchOn);
    } catch (err) {
      setStatus("Flashlight isn't supported on this camera/browser.", "is-error");
      setTimeout(() => setStatus(isScanning ? "Scanning… point the camera at a QR code" : "", isScanning ? "is-live" : null), 2200);
    }
  }

  function onDecodeSuccess(decodedText) {
    // Debounce identical back-to-back reads from continuous scanning.
    const now = Date.now();
    if (decodedText === lastResultText && now - lastResultAt < 2500) return;
    lastResultText = decodedText;
    lastResultAt = now;

    flashSuccess();
    if (navigator.vibrate) navigator.vibrate(80);
    runAnalysis(decodedText);
  }

  function flashSuccess() {
    stage.classList.remove("scan-success");
    // Force reflow so the animation can restart on consecutive scans.
    void stage.offsetWidth;
    stage.classList.add("scan-success");
  }

  /* ------------------------------------------------------------------ *
   *  Image upload decoding
   * ------------------------------------------------------------------ */
  async function decodeFromFile(file) {
    if (!file) return;
    setStatus("Analyzing uploaded image…");
    try {
      if (!html5Qr) {
        html5Qr = new Html5Qrcode(READER_ID, { verbose: false });
      }
      const wasScanning = isScanning;
      if (wasScanning) await stopScanner();
      const text = await html5Qr.scanFile(file, false);
      setStatus("QR code found in image.");
      flashSuccess();
      runAnalysis(text);
    } catch (err) {
      console.error(err);
      setStatus("No QR code could be found in that image.", "is-error");
    } finally {
      fileInput.value = "";
    }
  }

  /* ------------------------------------------------------------------ *
   *  QR payload classification
   * ------------------------------------------------------------------ */

  const SHORTENERS = [
    "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly",
    "rebrand.ly", "cutt.ly", "shorturl.at", "rb.gy", "tiny.cc", "lnkd.in",
    "bl.ink", "v.gd", "s.id", "qr.ae",
  ];

  const SUSPICIOUS_TLDS = [
    "tk", "ml", "ga", "cf", "gq", "xyz", "top", "click", "work", "support",
    "country", "gdn", "loan", "win", "review", "party", "date", "faith",
    "icu", "cam", "cyou", "buzz",
  ];

  const BRAND_KEYWORDS = [
    "paypal", "google", "microsoft", "apple", "amazon", "netflix", "facebook",
    "instagram", "whatsapp", "bank", "chase", "wellsfargo", "hdfc", "icici",
    "sbi", "paytm", "phonepe", "gpay", "irs", "dhl", "fedex", "linkedin",
  ];

  const URGENCY_WORDS = /urgent|immediately|verify now|act now|suspend|expire|winner|prize|lottery|congratulations|claim now|limited time/i;
  const CREDENTIAL_WORDS = /login|log in|sign in|password|otp|cvv|pin\b|verify.{0,15}(account|identity)/i;

  function classify(raw) {
    const text = raw.trim();
    const upper = text.toUpperCase();

    if (/^upi:\/\//i.test(text)) return { type: "UPI Payment", icon: "💸", key: "upi" };
    if (/^https?:\/\/(wa\.me|api\.whatsapp\.com)/i.test(text) || /^whatsapp:\/\//i.test(text)) return { type: "WhatsApp", icon: "🟢", key: "social" };
    if (/instagram\.com/i.test(text)) return { type: "Instagram", icon: "📸", key: "social" };
    if (/facebook\.com|fb\.com/i.test(text)) return { type: "Facebook", icon: "📘", key: "social" };
    if (/linkedin\.com/i.test(text)) return { type: "LinkedIn", icon: "💼", key: "social" };
    if (/youtube\.com|youtu\.be/i.test(text)) return { type: "YouTube", icon: "▶️", key: "social" };
    if (/twitter\.com|(^|\/\/)x\.com/i.test(text)) return { type: "Twitter / X", icon: "𝕏", key: "social" };
    if (/t\.me\//i.test(text)) return { type: "Telegram", icon: "✈️", key: "social" };
    if (/discord\.(gg|com)/i.test(text)) return { type: "Discord", icon: "🎮", key: "social" };
    if (/github\.com/i.test(text)) return { type: "GitHub", icon: "🐙", key: "social" };
    if (/^WIFI:/i.test(upper)) return { type: "Wi‑Fi Network", icon: "📶", key: "wifi" };
    if (/^BEGIN:VCARD/i.test(upper)) return { type: "Contact Card", icon: "👤", key: "vcard" };
    if (/^BEGIN:VEVENT|^BEGIN:VCALENDAR/i.test(upper)) return { type: "Calendar Event", icon: "📅", key: "calendar" };
    if (/^mailto:/i.test(text) || /^MATMSG:/i.test(upper)) return { type: "Email", icon: "✉️", key: "email" };
    if (/^smsto:/i.test(text) || /^sms:/i.test(text)) return { type: "SMS", icon: "💬", key: "sms" };
    if (/^tel:/i.test(text)) return { type: "Phone Number", icon: "📞", key: "phone" };
    if (/^geo:/i.test(text)) return { type: "Location", icon: "📍", key: "geo" };
    if (/(maps\.google\.|goo\.gl\/maps|maps\.apple\.com)/i.test(text)) return { type: "Map Location", icon: "🗺️", key: "geo-url" };
    if (/^bitcoin:/i.test(text)) return { type: "Bitcoin Payment", icon: "₿", key: "crypto" };
    if (/^(ethereum|litecoin|dogecoin|bitcoincash|tron):/i.test(text)) return { type: "Cryptocurrency Payment", icon: "◈", key: "crypto" };
    if (/apps\.apple\.com/i.test(text)) return { type: "App Store Link", icon: "🍎", key: "url" };
    if (/play\.google\.com/i.test(text)) return { type: "Play Store Link", icon: "▶", key: "url" };
    if (/\.pdf(\?|#|$)/i.test(text) && /^https?:\/\//i.test(text)) return { type: "PDF Document", icon: "📄", key: "url" };
    if (/^https?:\/\//i.test(text) || /^www\./i.test(text)) return { type: "Website", icon: "🌐", key: "url" };
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(text)) return { type: "App Deep Link", icon: "🔗", key: "deeplink" };
    return { type: "Plain Text", icon: "📝", key: "text" };
  }

  function parseQueryLike(str) {
    const out = {};
    const q = str.split("?")[1];
    if (!q) return out;
    q.split("&").forEach((pair) => {
      const [k, v] = pair.split("=");
      if (k) out[decodeURIComponent(k)] = v ? decodeURIComponent(v.replace(/\+/g, " ")) : "";
    });
    return out;
  }

  function safeUrl(str) {
    try {
      const withProto = /^https?:\/\//i.test(str) ? str : `http://${str}`;
      return new URL(withProto);
    } catch {
      return null;
    }
  }

  function isIpHost(host) {
    return /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || /^\[?[0-9a-f:]+\]?$/i.test(host) && host.includes(":");
  }

  /* ------------------------------------------------------------------ *
   *  Type-specific parsers -> { details: [{label,value}], flags: [{sev,text}] }
   * ------------------------------------------------------------------ */

  function analyzeUrl(text) {
    const details = [];
    const flags = [];
    const url = safeUrl(text);

    if (!url) {
      flags.push({ sev: 2, text: "This doesn't parse as a well-formed URL — treat it with caution." });
      return { details: [{ label: "Raw Value", value: text, mono: true }], flags };
    }

    const host = url.hostname.toLowerCase();
    details.push({ label: "Domain", value: host, mono: true });
    details.push({ label: "Protocol", value: url.protocol.replace(":", "").toUpperCase() });
    details.push({ label: "Full URL", value: url.href, mono: true, wide: true });

    if (url.protocol === "http:") {
      flags.push({ sev: 2, text: "Uses unencrypted HTTP instead of HTTPS — data sent here isn't protected in transit." });
    }

    if (isIpHost(host)) {
      flags.push({ sev: 3, text: "Points to a raw IP address instead of a domain name, a common phishing/malware pattern." });
    }

    if (SHORTENERS.some((s) => host === s || host.endsWith("." + s))) {
      flags.push({ sev: 2, text: "Uses a link shortener, which hides the real destination until you click." });
    }

    const tld = host.split(".").pop();
    if (SUSPICIOUS_TLDS.includes(tld)) {
      flags.push({ sev: 2, text: `Uses a ".${tld}" domain ending frequently abused for throwaway phishing sites.` });
    }

    if (host.startsWith("xn--") || host.includes(".xn--")) {
      flags.push({ sev: 3, text: "Domain uses Punycode encoding — a technique used to mimic look‑alike (Unicode) domains." });
    }

    const labels = host.split(".");
    const sub = labels.length > 2 ? labels.slice(0, -2).join(".") : "";
    if (sub && /[a-z0-9]{12,}/i.test(sub.replace(/\./g, ""))) {
      flags.push({ sev: 1, text: "Contains a long, random-looking subdomain, often seen in auto-generated phishing infrastructure." });
    }

    if (text.length > 100) {
      flags.push({ sev: 1, text: "Unusually long URL, which can be used to bury the real domain or obscure tracking/redirect chains." });
    }

    const params = parseQueryLike(text);
    const paramCount = Object.keys(params).length;
    if (paramCount >= 6) {
      flags.push({ sev: 1, text: `Contains ${paramCount} query parameters — an excessive amount can indicate tracking or redirect chaining.` });
    }

    if (/%[0-9a-f]{2}/i.test(text) && (text.match(/%[0-9a-f]{2}/gi) || []).length > 4) {
      flags.push({ sev: 1, text: "Heavily URL-encoded, which can be used to disguise the true destination." });
    }

    if (/redirect|redir|url=|next=|continue=|dest=/i.test(text)) {
      flags.push({ sev: 1, text: "Contains an open-redirect style parameter that could forward you somewhere else entirely." });
    }

    // Simple brand-impersonation / typosquat heuristic: brand keyword present
    // in the domain, but not as the actual registrable domain.
    const registrable = labels.slice(-2).join(".");
    BRAND_KEYWORDS.forEach((brand) => {
      if (host.includes(brand) && !registrable.startsWith(brand + ".")) {
        flags.push({ sev: 3, text: `Domain references "${brand}" but isn't an official ${brand} domain — a classic look‑alike / typosquatting pattern.` });
      }
    });

    if (CREDENTIAL_WORDS.test(text)) {
      flags.push({ sev: 2, text: "URL text references login/verification actions — be cautious entering credentials." });
    }

    if (URGENCY_WORDS.test(text)) {
      flags.push({ sev: 1, text: "Uses urgency-driven wording, a common pressure tactic in phishing links." });
    }

    return { details, flags, url, host };
  }

  function analyzeUpi(text) {
    const params = parseQueryLike(text);
    const details = [];
    const flags = [];

    const pa = params.pa || "—";
    const pn = params.pn || "Unknown merchant";
    const am = params.am;
    const cu = params.cu || "INR";
    const tn = params.tn;
    const mc = params.mc;

    details.push({ label: "UPI ID (Payee)", value: pa, mono: true });
    details.push({ label: "Merchant / Payee Name", value: pn });
    if (am) details.push({ label: "Requested Amount", value: `${am} ${cu}` });
    if (mc) details.push({ label: "Merchant Category Code", value: mc });
    if (tn) details.push({ label: "Note / Reference", value: tn, wide: true });

    if (!params.pa) {
      flags.push({ sev: 3, text: "No payee UPI ID could be parsed — this payment link may be malformed or manipulated." });
    }
    if (!params.pn) {
      flags.push({ sev: 1, text: "No merchant name is included, making it harder to verify who you'd be paying." });
    }
    if (am) {
      flags.push({ sev: 1, text: `This QR pre-fills a payment amount of ${am} ${cu} — always confirm this matches what you expect to pay before authorizing.` });
    } else {
      flags.push({ sev: 1, text: "No fixed amount is set, meaning whoever you pay could request any amount you enter — verify the recipient carefully." });
    }
    if (pa && /^\d+$/.test(pa.split("@")[0] || "") === false && /[a-z]{15,}/i.test(pa)) {
      flags.push({ sev: 1, text: "UPI handle looks unusually long/random rather than a typical merchant handle." });
    }

    return { details, flags };
  }

  function analyzeWifi(text) {
    const details = [];
    const flags = [];
    const get = (k) => {
      const m = text.match(new RegExp(k + ":([^;]*);", "i"));
      return m ? m[1] : "";
    };
    const ssid = get("S");
    const type = get("T") || "nopass";
    const pass = get("P");
    const hidden = /H:true/i.test(text);

    details.push({ label: "Network Name (SSID)", value: ssid || "—" });
    details.push({ label: "Security Type", value: type.toUpperCase() });
    details.push({ label: "Password Included", value: pass ? "Yes (hidden)" : "No" });
    details.push({ label: "Hidden Network", value: hidden ? "Yes" : "No" });

    if (type.toUpperCase() === "NOPASS") {
      flags.push({ sev: 2, text: "This is an open network with no password — traffic on it can be easier to intercept." });
    } else {
      flags.push({ sev: 0, text: "Network uses password-based security. Only join if you recognize/trust the source of this QR code." });
    }
    if (hidden) {
      flags.push({ sev: 1, text: "Marked as a hidden network — legitimate, but confirm this is a network you expect to see a QR code for." });
    }

    return { details, flags, ssid, pass };
  }

  function analyzeVcard(text) {
    const details = [];
    const flags = [];
    const get = (k) => {
      const m = text.match(new RegExp("^" + k + "[^:\\n]*:(.*)$", "im"));
      return m ? m[1].trim() : "";
    };
    const fn = get("FN") || get("N");
    const tel = get("TEL");
    const email = get("EMAIL");
    const org = get("ORG");
    const url = get("URL");
    const adr = get("ADR");

    if (fn) details.push({ label: "Name", value: fn });
    if (tel) details.push({ label: "Phone", value: tel, mono: true });
    if (email) details.push({ label: "Email", value: email, mono: true });
    if (org) details.push({ label: "Company", value: org });
    if (url) details.push({ label: "Website", value: url, mono: true });
    if (adr) details.push({ label: "Address", value: adr, wide: true });

    flags.push({ sev: 0, text: "Contact cards only add an entry to your address book — they can't run code or make payments on their own." });
    if (!fn && !tel && !email) {
      flags.push({ sev: 1, text: "This contact card is missing basic identifying details, which is unusual for a legitimate vCard." });
    }

    return { details, flags };
  }

  function analyzeCalendar(text) {
    const details = [];
    const flags = [];
    const get = (k) => {
      const m = text.match(new RegExp("^" + k + "[^:\\n]*:(.*)$", "im"));
      return m ? m[1].trim() : "";
    };
    const summary = get("SUMMARY");
    const dtstart = get("DTSTART");
    const dtend = get("DTEND");
    const location = get("LOCATION");

    if (summary) details.push({ label: "Event", value: summary, wide: true });
    if (dtstart) details.push({ label: "Starts", value: dtstart, mono: true });
    if (dtend) details.push({ label: "Ends", value: dtend, mono: true });
    if (location) details.push({ label: "Location", value: location });

    flags.push({ sev: 0, text: "Calendar invites only add an event to your calendar app — review the details before accepting." });
    return { details, flags };
  }

  function analyzeEmail(text) {
    const details = [];
    const flags = [];
    const withoutScheme = text.replace(/^mailto:/i, "");
    const [addr, query] = withoutScheme.split("?");
    const params = parseQueryLike("?" + (query || ""));

    details.push({ label: "Recipient", value: addr || "—", mono: true });
    if (params.subject) details.push({ label: "Subject", value: params.subject, wide: true });
    if (params.body) details.push({ label: "Body Preview", value: params.body.slice(0, 160), wide: true });

    if (URGENCY_WORDS.test(text) || CREDENTIAL_WORDS.test(text)) {
      flags.push({ sev: 2, text: "Pre-filled email content references urgency or credentials — a pattern seen in phishing-by-QR ('quishing') scams." });
    } else {
      flags.push({ sev: 0, text: "This will pre-fill a new email in your mail app — nothing is sent until you hit send." });
    }
    return { details, flags };
  }

  function analyzeSms(text) {
    const details = [];
    const flags = [];
    const body = text.replace(/^smsto:/i, "").replace(/^sms:/i, "");
    const [number, msg] = body.split(/:(.+)/);

    details.push({ label: "Phone Number", value: number || "—", mono: true });
    if (msg) details.push({ label: "Pre-filled Message", value: msg, wide: true });

    if (msg && (URGENCY_WORDS.test(msg) || CREDENTIAL_WORDS.test(msg))) {
      flags.push({ sev: 2, text: "Pre-filled text references urgency or sensitive info — verify before sending." });
    } else {
      flags.push({ sev: 0, text: "This opens a pre-filled text message — nothing is sent until you tap send." });
    }
    return { details, flags };
  }

  function analyzePhone(text) {
    const number = text.replace(/^tel:/i, "");
    const details = [{ label: "Phone Number", value: number, mono: true }];
    const flags = [{ sev: 1, text: "Dialing an unfamiliar number can connect you to premium-rate or scam call centers — verify the source first." }];
    return { details, flags };
  }

  function analyzeGeo(text) {
    const details = [];
    const flags = [];
    let lat, lon;
    if (/^geo:/i.test(text)) {
      const coords = text.replace(/^geo:/i, "").split(";")[0].split(",");
      lat = coords[0];
      lon = coords[1];
    } else {
      const m = text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || text.match(/q=(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (m) { lat = m[1]; lon = m[2]; }
    }
    if (lat && lon) {
      details.push({ label: "Coordinates", value: `${lat}, ${lon}`, mono: true });
      details.push({ label: "Google Maps", value: `https://maps.google.com/?q=${lat},${lon}`, mono: true, wide: true, link: true });
    } else {
      details.push({ label: "Raw Value", value: text, mono: true, wide: true });
    }
    flags.push({ sev: 0, text: "Opens a location in your maps app — no personal data is shared just by viewing it." });
    return { details, flags };
  }

  function analyzeCrypto(text) {
    const scheme = text.split(":")[0];
    const rest = text.slice(scheme.length + 1);
    const [address, query] = rest.split("?");
    const params = parseQueryLike("?" + (query || ""));
    const details = [
      { label: "Currency", value: scheme.charAt(0).toUpperCase() + scheme.slice(1) },
      { label: "Wallet Address", value: address, mono: true, wide: true },
    ];
    if (params.amount) details.push({ label: "Requested Amount", value: params.amount });
    const flags = [
      { sev: 2, text: "Cryptocurrency transactions are irreversible. Only send funds if you personally verify the recipient and amount." },
    ];
    if (params.amount) {
      flags.push({ sev: 1, text: `This QR pre-fills a request for ${params.amount} ${scheme} — confirm this matches what you intend to send.` });
    }
    return { details, flags };
  }

  function analyzeSocial(text, typeLabel) {
    const url = safeUrl(text);
    const details = [{ label: "Opens In", value: typeLabel }];
    if (url) details.push({ label: "Link", value: url.href, mono: true, wide: true, link: true });
    const flags = [{ sev: 0, text: `This QR opens a ${typeLabel} profile, chat, or page in the app or browser.` }];
    if (url && url.protocol === "http:") {
      flags.push({ sev: 1, text: "Uses HTTP rather than HTTPS, which is unusual for this platform." });
    }
    return { details, flags };
  }

  function analyzeDeeplink(text) {
    const scheme = text.split(":")[0];
    return {
      details: [
        { label: "Scheme", value: scheme },
        { label: "Full Link", value: text, mono: true, wide: true },
      ],
      flags: [
        { sev: 1, text: "This opens a specific app directly rather than a website — only proceed if you recognize the app/scheme." },
      ],
    };
  }

  function analyzeText(text) {
    const details = [{ label: "Content", value: text, wide: true, mono: text.length < 120 }];
    const flags = [];
    if (URGENCY_WORDS.test(text) || CREDENTIAL_WORDS.test(text)) {
      flags.push({ sev: 2, text: "This plain text uses urgency or credential-related wording often seen in scam QR codes." });
    } else {
      flags.push({ sev: 0, text: "Plain text QR codes can't run code or open links by themselves." });
    }
    return { details, flags };
  }

  function analyzeUnknown(text) {
    const bytes = new TextEncoder().encode(text);
    const hex = Array.from(bytes.slice(0, 64))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    const encodingGuess = /^[\x00-\x7F]*$/.test(text) ? "ASCII / UTF-8 text" : "Non-ASCII (likely UTF-8 / binary)";
    return {
      details: [
        { label: "Raw Content", value: text || "(empty)", mono: true, wide: true },
        { label: "Length", value: `${bytes.length} bytes` },
        { label: "Encoding Guess", value: encodingGuess },
        { label: "Hex Preview", value: hex + (bytes.length > 64 ? " …" : ""), mono: true, wide: true },
      ],
      flags: [{ sev: 1, text: "This payload didn't match a known QR format, but it was decoded safely and won't be executed." }],
    };
  }

  /* ------------------------------------------------------------------ *
   *  Risk engine
   * ------------------------------------------------------------------ */

  function scoreFromFlags(flags) {
    // sev: 0 = informational, 1 = low, 2 = medium, 3 = high
    const weight = { 0: 0, 1: 8, 2: 16, 3: 26 };
    let score = flags.reduce((sum, f) => sum + (weight[f.sev] || 0), 0);
    score = Math.min(100, score);
    return score;
  }

  function tierFor(score) {
    if (score >= 80) return { key: "critical", label: "Critical Risk", cls: "critical", color: "var(--danger)" };
    if (score >= 60) return { key: "high", label: "High Risk", cls: "high", color: "#ff8c42" };
    if (score >= 40) return { key: "medium", label: "Medium Risk", cls: "caution", color: "var(--warning)" };
    if (score >= 20) return { key: "low", label: "Low Risk", cls: "low", color: "var(--blue)" };
    return { key: "safe", label: "Safe", cls: "safe", color: "var(--green)" };
  }

  function verdictFor(tier, classification) {
    const noun = classification.type.toLowerCase();
    switch (tier.key) {
      case "critical":
        return `This ${noun} shows multiple strong indicators of a scam or attack. We strongly recommend not proceeding.`;
      case "high":
        return `This ${noun} has several red flags. Proceed only if you can independently verify the source.`;
      case "medium":
        return `This ${noun} has some suspicious traits. Double-check details before taking any action it requests.`;
      case "low":
        return `This ${noun} looks mostly fine, but review the details below before proceeding.`;
      default:
        return `No significant red flags were found in this ${noun}.`;
    }
  }

  function recommendedAction(tier, classification) {
    if (tier.key === "critical" || tier.key === "high") {
      return "Do not open the link, pay, or enter any personal information. Delete or report this QR code if possible.";
    }
    if (tier.key === "medium") {
      return "Verify the source independently (official app, phone number, or website) before continuing.";
    }
    if (classification.key === "upi" || classification.key === "crypto") {
      return "Confirm the recipient and amount before authorizing any payment.";
    }
    return "Should be safe to proceed, using normal browsing caution.";
  }

  /* ------------------------------------------------------------------ *
   *  Main analysis pipeline
   * ------------------------------------------------------------------ */

  function runAnalysis(rawText) {
    const classification = classify(rawText);
    let result;

    try {
      switch (classification.key) {
        case "url": result = analyzeUrl(rawText); break;
        case "upi": result = analyzeUpi(rawText); break;
        case "wifi": result = analyzeWifi(rawText); break;
        case "vcard": result = analyzeVcard(rawText); break;
        case "calendar": result = analyzeCalendar(rawText); break;
        case "email": result = analyzeEmail(rawText); break;
        case "sms": result = analyzeSms(rawText); break;
        case "phone": result = analyzePhone(rawText); break;
        case "geo":
        case "geo-url": result = analyzeGeo(rawText); break;
        case "crypto": result = analyzeCrypto(rawText); break;
        case "social": result = analyzeSocial(rawText, classification.type); break;
        case "deeplink": result = analyzeDeeplink(rawText); break;
        case "text": result = analyzeText(rawText); break;
        default: result = analyzeUnknown(rawText);
      }
    } catch (err) {
      console.error("Analysis error, falling back to unknown handler:", err);
      result = analyzeUnknown(rawText);
    }

    const score = scoreFromFlags(result.flags || []);
    const tier = tierFor(score);

    renderReport({
      rawText,
      classification,
      details: result.details || [],
      flags: result.flags || [],
      score,
      tier,
    });

    saveToHistory({ rawText, type: classification.type, tier: tier.key, at: Date.now() });
    renderHistory();
  }

  /* ------------------------------------------------------------------ *
   *  Rendering
   * ------------------------------------------------------------------ */

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else node.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function renderReport({ rawText, classification, details, flags, score, tier }) {
    placeholder.style.display = "none";
    report.innerHTML = "";
    report.classList.add("visible");

    // Top row: type + risk badge
    const top = el("div", { class: "report-top" }, [
      el("div", { class: "report-type" }, [
        el("div", { class: "type-icon" }, classification.icon),
        el("div", { class: "type-text" }, [
          el("div", { class: "t-label" }, "QR Type"),
          el("div", { class: "t-value" }, classification.type),
        ]),
      ]),
      el("span", { class: `risk-badge ${tier.cls}` }, tier.label),
    ]);
    report.appendChild(top);

    // Risk meter
    const meterBlock = el("div", { class: "risk-meter-block" }, [
      el("div", { class: "risk-dial", style: `color:${tier.color}` }, `${score}`),
      el("div", { class: "risk-meter-track" }, [
        el("div", { class: "risk-meter-fill" }),
      ]),
    ]);
    report.appendChild(meterBlock);
    requestAnimationFrame(() => {
      const fill = meterBlock.querySelector(".risk-meter-fill");
      fill.style.width = score + "%";
      fill.style.background = tier.color;
    });

    // AI verdict
    report.appendChild(
      el("p", { class: "verdict-line" }, [
        el("strong", {}, "AI Verdict: "),
        document.createTextNode(verdictFor(tier, classification)),
      ])
    );

    // Details grid
    if (details.length) {
      const wrap = el("div", {}, [el("div", { class: "section-label" }, "Details")]);
      const grid = el("div", { class: "detail-grid" });
      details.forEach((d) => {
        const valueNode = d.link
          ? el("a", { href: d.value, target: "_blank", rel: "noopener noreferrer", class: "d-value mono" }, d.value)
          : el("div", { class: `d-value${d.mono ? " mono" : ""}` }, d.value);
        const item = el("div", { class: "detail-item", style: d.wide ? "grid-column: 1 / -1;" : "" }, [
          el("div", { class: "d-label" }, d.label),
          valueNode,
        ]);
        grid.appendChild(item);
      });
      wrap.appendChild(grid);
      report.appendChild(wrap);
    }

    // Security warnings
    const flagWrap = el("div", {}, [el("div", { class: "section-label" }, "Security Warnings") ]);
    const flagList = el("div", { class: "flag-list" });
    const sevIcon = { 0: "✅", 1: "ℹ️", 2: "⚠️", 3: "🚨" };
    (flags.length ? flags : [{ sev: 0, text: "No warnings to show." }]).forEach((f) => {
      flagList.appendChild(
        el("div", { class: "flag-item" }, [
          el("span", {}, sevIcon[f.sev] || "•"),
          el("span", {}, f.text),
        ])
      );
    });
    flagWrap.appendChild(flagList);
    report.appendChild(flagWrap);

    // Recommended action
    report.appendChild(
      el("div", { class: "suggestion-block" }, [
        el("span", { class: "s-icon" }, "🛡️"),
        el("span", {}, [
          el("strong", {}, "Recommended action: "),
          document.createTextNode(recommendedAction(tier, classification)),
        ]),
      ])
    );

    // Safe actions
    report.appendChild(buildActionRow(rawText, classification, tier));

    // Raw payload (collapsed-ish, scrollable)
    const rawWrap = el("div", {}, [el("div", { class: "section-label" }, "Raw Payload")]);
    rawWrap.appendChild(el("div", { class: "raw-payload" }, rawText));
    report.appendChild(rawWrap);

    report.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function buildActionRow(rawText, classification, tier) {
    const row = el("div", { class: "action-row" });
    const risky = tier.key === "high" || tier.key === "critical";

    const copyBtn = el("button", { class: "btn btn-ghost btn-sm" }, "📋 Copy Content");
    copyBtn.addEventListener("click", () => {
      navigator.clipboard?.writeText(rawText);
      copyBtn.textContent = "✅ Copied";
      setTimeout(() => (copyBtn.textContent = "📋 Copy Content"), 1500);
    });
    row.appendChild(copyBtn);

    if (classification.key === "url" || classification.key === "social" || classification.key === "deeplink") {
      const url = safeUrl(rawText) || (/^[a-z]+:/i.test(rawText) ? rawText : null);
      const openBtn = el("button", { class: `btn btn-sm ${risky ? "btn-ghost" : "btn-primary"}` }, risky ? "⚠️ Open Anyway" : "🔗 Open Link");
      openBtn.addEventListener("click", () => {
        if (risky && !confirm("This link was flagged as risky. Are you sure you want to open it?")) return;
        window.open(typeof url === "string" ? url : url.href, "_blank", "noopener,noreferrer");
      });
      row.appendChild(openBtn);
    }

    if (classification.key === "geo" || classification.key === "geo-url") {
      const gm = document.createElement("a");
      const m = rawText.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
      gm.href = m ? `https://maps.google.com/?q=${m[1]},${m[2]}` : rawText;
      gm.target = "_blank";
      gm.rel = "noopener noreferrer";
      gm.className = "btn btn-primary btn-sm";
      gm.textContent = "🗺️ Open in Maps";
      row.appendChild(gm);
    }

    if (classification.key === "vcard") {
      const dl = el("button", { class: "btn btn-primary btn-sm" }, "👤 Save Contact (.vcf)");
      dl.addEventListener("click", () => downloadAsFile(rawText, "contact.vcf", "text/vcard"));
      row.appendChild(dl);
    }

    if (classification.key === "calendar") {
      const dl = el("button", { class: "btn btn-primary btn-sm" }, "📅 Save Event (.ics)");
      dl.addEventListener("click", () => downloadAsFile(rawText, "event.ics", "text/calendar"));
      row.appendChild(dl);
    }

    if (classification.key === "wifi") {
      const info = el("span", { class: "text-dim", style: "font-size:0.82rem;align-self:center;" }, "Most phones can join Wi‑Fi directly from the camera app when scanning this code.");
      row.appendChild(info);
    }

    if (classification.key === "upi" || classification.key === "crypto") {
      const warn = el("button", { class: "btn btn-ghost btn-sm" }, "💸 Payment link — not opened automatically");
      warn.disabled = true;
      row.appendChild(warn);
    }

    return row;
  }

  function downloadAsFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ------------------------------------------------------------------ *
   *  Recent scan history (localStorage, client-side only)
   * ------------------------------------------------------------------ */

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function saveToHistory(entry) {
    const list = loadHistory();
    list.unshift(entry);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 8)));
  }

  function renderHistory() {
    const list = loadHistory();
    if (!list.length) {
      recentWrap.style.display = "none";
      return;
    }
    recentWrap.style.display = "block";
    recentList.innerHTML = "";
    list.forEach((entry) => {
      const badgeClass = { safe: "safe", low: "low", medium: "caution", high: "high", critical: "critical" }[entry.tier] || "safe";
      const item = el("div", { class: "recent-item" }, [
        el("span", { class: "r-text" }, entry.rawText),
        el("span", { class: `r-badge risk-badge ${badgeClass}` }, entry.type),
      ]);
      item.addEventListener("click", () => runAnalysis(entry.rawText));
      recentList.appendChild(item);
    });
  }

  clearHistoryBtn?.addEventListener("click", () => {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
  });

  /* ------------------------------------------------------------------ *
   *  Wire up controls
   * ------------------------------------------------------------------ */

  startBtn.addEventListener("click", () => startScanner());
  stopBtn.addEventListener("click", () => stopScanner());
  torchBtn.addEventListener("click", toggleTorch);
  switchBtn.addEventListener("click", switchCamera);
  cameraSelect?.addEventListener("change", (e) => startScanner(e.target.value));
  fileInput.addEventListener("change", (e) => decodeFromFile(e.target.files[0]));

  window.addEventListener("beforeunload", () => {
    if (isScanning) stopScanner();
  });

  // Stop the camera cleanly if the user navigates away within the SPA-like nav.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && isScanning) {
      // Keep scanning in background tabs off to save battery / avoid duplicate streams.
      stopScanner();
    }
  });

  stopBtn.disabled = true;
  torchBtn.disabled = true;
  switchBtn.disabled = true;

  renderHistory();
})();