/* ==========================================================================
   CyberShield AI — Shared script
   Handles: mobile nav, scroll-reveal, animated dashboard stats,
   random cyber tip / daily challenge, and lightweight "latest news" widget.
   Loaded on every page.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  initNav();
  initScrollReveal();
  initDashboard();
  initTipWidget();
  initChallengeWidget();
  initNewsWidget();
  initFooterYear();
});

/* ---------- Mobile nav toggle ---------- */
function initNav() {
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (!toggle || !links) return;

  toggle.addEventListener("click", () => {
    links.classList.toggle("open");
    toggle.setAttribute(
      "aria-expanded",
      links.classList.contains("open") ? "true" : "false"
    );
  });

  // Close menu after clicking a link (mobile)
  links.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => links.classList.remove("open"))
  );
}

/* ---------- Scroll-triggered reveal animation ---------- */
function initScrollReveal() {
  const items = document.querySelectorAll(".reveal");
  if (!items.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  items.forEach((item) => observer.observe(item));
}

/* ---------- Animated dashboard stat bars / counters ---------- */
function initDashboard() {
  const dash = document.querySelector("[data-dashboard]");
  if (!dash) return;

  // Mock "live" security snapshot. In a real deployment these values
  // could come from stored password checks / scan history.
  const snapshot = {
    threatLevel: { value: "Moderate", percent: 55, color: "var(--warning)" },
    passwordHealth: { value: "72%", percent: 72, color: "var(--green)" },
    scamAlerts: { value: "3 this week", percent: 30, color: "var(--danger)" },
    securityScore: { value: "81 / 100", percent: 81, color: "var(--blue)" },
  };

  Object.entries(snapshot).forEach(([key, data]) => {
    const bar = dash.querySelector(`[data-bar="${key}"]`);
    const val = dash.querySelector(`[data-value="${key}"]`);
    if (val) val.textContent = data.value;
    if (bar) {
      bar.style.background = data.color;
      requestAnimationFrame(() => {
        setTimeout(() => (bar.style.width = data.percent + "%"), 100);
      });
    }
  });
}

/* ---------- Random cyber tip ---------- */
const CYBER_TIPS = [
  "Use a unique password for every account — a password manager makes this painless.",
  "Turn on two-factor authentication anywhere it's offered, especially email and banking.",
  "Never enter an OTP unless you personally started the transaction.",
  "Check the sender's actual email address, not just the display name, before clicking anything.",
  "Public Wi-Fi is fine for browsing, risky for logging into anything sensitive.",
  "Update your phone and apps regularly — most breaches exploit known, already-patched bugs.",
  "A bank will never ask for your PIN, OTP, or password over call, SMS, or email.",
  "Back up your important files in two places: cloud and offline.",
  "Before scanning a QR code, check where it actually leads — malicious QR codes are on the rise.",
  "Lock your SIM with a PIN to make SIM-swap attacks much harder to pull off.",
];

function initTipWidget() {
  const el = document.querySelector("[data-cyber-tip]");
  if (!el) return;
  const tip = CYBER_TIPS[Math.floor(Math.random() * CYBER_TIPS.length)];
  el.textContent = tip;

  const refreshBtn = document.querySelector("[data-tip-refresh]");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      let next = tip;
      while (next === el.textContent) {
        next = CYBER_TIPS[Math.floor(Math.random() * CYBER_TIPS.length)];
      }
      el.textContent = next;
    });
  }
}

/* ---------- Today's security challenge (deterministic by date) ---------- */
const CHALLENGES = [
  "Turn on two-factor authentication for one account you haven't protected yet.",
  "Change any password you've reused across more than one site.",
  "Review which apps have access to your Google or Facebook account, and remove one you don't recognize.",
  "Check your phone's app permissions and revoke camera/mic access from apps that don't need it.",
  "Set up a PIN lock on your SIM card through your carrier's app or dial code.",
  "Enable auto-updates for your phone's operating system.",
  "Search your email for 'password' and delete any messages that contain one in plain text.",
];

function initChallengeWidget() {
  const el = document.querySelector("[data-challenge]");
  if (!el) return;
  const dayIndex = new Date().getDate() % CHALLENGES.length;
  el.textContent = CHALLENGES[dayIndex];
}

/* ---------- Latest cyber news (free RSS-to-JSON proxy, falls back gracefully) ---------- */
function initNewsWidget() {
  const list = document.querySelector("[data-news-list]");
  if (!list) return;

  const feedUrl = encodeURIComponent(
    "https://feeds.feedburner.com/TheHackersNews"
  );
  const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${feedUrl}&count=4`;

  fetch(apiUrl)
    .then((res) => {
      if (!res.ok) throw new Error("news fetch failed");
      return res.json();
    })
    .then((data) => {
      if (!data.items || !data.items.length) throw new Error("empty feed");
      list.innerHTML = "";
      data.items.slice(0, 4).forEach((item) => {
        const li = document.createElement("li");
        li.style.marginBottom = "12px";
        const a = document.createElement("a");
        a.href = item.link;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.style.fontSize = "0.9rem";
        a.textContent = item.title;
        li.appendChild(a);
        list.appendChild(li);
      });
    })
    .catch(() => {
      // Free API can be flaky / rate-limited — fail gracefully.
      list.innerHTML = `
        <li style="color: var(--text-dim); font-size: 0.9rem;">
          Live headlines are temporarily unavailable. Visit
          <a href="https://thehackernews.com" target="_blank" rel="noopener noreferrer" style="color: var(--green);">The Hacker News</a>
          for the latest coverage.
        </li>`;
    });
}

/* ---------- Footer year ---------- */
function initFooterYear() {
  const el = document.querySelector("[data-year]");
  if (el) el.textContent = new Date().getFullYear();
}