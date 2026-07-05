# CyberShield AI

**Your Personal AI Cybersecurity Guardian**

CyberShield AI is a client-side web app that helps everyday users stay safe online — checking password strength, spotting scam messages, simulating the fallout of a risky click, predicting the risk of an action before you take it, and giving step-by-step recovery help if you've already been hit.

No backend, no signup, no data leaves your browser except for the optional live news widget and the password-strength library, both loaded from public CDNs.

## Features

- **AI Guardian** — real-time password strength meter (powered by [zxcvbn](https://github.com/dropbox/zxcvbn)) with estimated crack time and concrete suggestions.
- **Scam Detector** — paste any SMS, email, or WhatsApp message and get a rule-based risk score with the exact phrases that triggered it (OTP requests, urgency language, shortened links, fake KYC prompts, and more).
- **Cyber Time Machine** — select what just happened (clicked a link, shared an OTP, installed an APK, etc.) and see a simulated timeline of consequences at 5 minutes, 1 hour, 24 hours, and 7 days, plus a recovery plan.
- **Digital Mistake Predictor** — pick an activity you're about to do and get a risk score, the likely attack, a safer alternative, and a prevention checklist before you do it.
- **Cyber Emergency Kit** — eight common incidents (lost phone, hacked email, UPI fraud, SIM swap, and more), each with an ordered recovery checklist and emergency contacts.
- **Live dashboard** — animated snapshot of threat level, password health, scam alerts, and overall security score.
- **Widgets** — a random cyber-safety tip, a daily security challenge, and a live cybersecurity headlines feed.

## Folder structure

```
CyberShield-AI/
├── index.html
├── style.css
├── script.js
├── pages/
│   ├── ai-guardian.html
│   ├── scam-detector.html
│   ├── cyber-time-machine.html
│   ├── digital-mistake-predictor.html
│   └── emergency-kit.html
├── assets/
│   ├── images/
│   ├── icons/
│   └── logo/
└── README.md
```

## How to run

No build step required.

1. Download or clone the project.
2. Open `index.html` directly in a browser, **or** serve it locally for the best experience with fonts/CDN assets:
   ```bash
   npx serve .
   # or
   python3 -m http.server 8000
   ```
3. Visit the printed local URL and navigate through the nav bar.

## Future improvements

- Live cyber attack map showing global threats in real time.
- AI Voice Guardian that reads a suspicious message aloud and explains the risk.
- A combined Digital Safety Score that pulls results from every tool into one personal report.
- Optional HuggingFace inference integration for smarter, model-based scam classification (a slot for an API token already exists in `scam-detector.html`).

## Credits

Built with HTML, CSS, and vanilla JavaScript. Password strength estimation via [zxcvbn](https://github.com/dropbox/zxcvbn) (Dropbox, MIT License). News headlines via [rss2json](https://rss2json.com/).

## License

MIT — free to use, modify, and build on.