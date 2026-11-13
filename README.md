# ArguMend

**Catch the fallacy, not just the typo.**

ArguMend is a reasoning checker for essays, debate cases, and argument drafts. It flags
logical fallacies at the sentence level, explains why the reasoning weakens the claim, and
suggests a stronger version of the same point.

This repository contains the **frontend UI** built with React + Vite. Analysis is currently
**mocked in the browser** so the full interaction can be tested without a detection engine.

## Project structure

```
ArguMend/
├── package.json                  # Root scripts (runs client + server together)
├── client/
│   ├── index.html
│   ├── vite.config.js            # /api proxy → http://localhost:5000
│   └── src/
│       ├── main.jsx
│       ├── App.jsx               # Composes input, results, empty state, reference
│       ├── index.css             # Design tokens, reset, header/hero/footer
│       ├── App.css               # Input, results, highlights, cards, responsive rules
│       ├── data/
│       │   └── fallacyBank.js    # 10 fallacies + sample arguments
│       ├── services/
│       │   └── analyzeService.js # Mocked analyzeArgument() API contract
│       └── components/
│           ├── Header.jsx
│           ├── Hero.jsx
│           ├── InputPanel.jsx
│           ├── ResultsSection.jsx
│           ├── HighlightedText.jsx
│           ├── FallacyCard.jsx
│           ├── EmptyState.jsx
│           ├── FallacyReference.jsx
│           ├── Footer.jsx
│           └── Icons.jsx         # Inline SVG icons (no icon library)
└── server/
    ├── index.js                  # Express host, CORS, /api/health
    └── package.json
```

## Run locally

Install dependencies once:

```bash
npm install
npm --prefix client install
npm --prefix server install
```

Then start both apps from the repo root:

```bash
npm run dev
```

- Client: http://localhost:5173
- API: http://localhost:5000 (health check at `/api/health`)

You can also run each side independently:

```bash
npm run dev:client
npm run dev:server
```

Production build of the UI:

```bash
npm run build
```

## What the UI includes

- **Input panel** — large textarea, live word/character count, sample arguments, keyboard
  shortcut (`Ctrl`/`⌘` + `Enter`), inline validation, and a button that disables while
  loading and reads "Analyzing...".
- **Highlighted argument** — the original text rendered with `<mark>` elements around every
  flagged sentence. Marks are keyboard-focusable; selecting one scrolls to and activates its
  feedback card.
- **Fallacy cards** — type, category, exact quoted sentence, explanation of why the reasoning
  fails, and a copyable suggested rewrite.
- **States** — idle/empty state with a 10-item fallacy reference, loading skeleton, zero
  findings state, and an error state.
- **Responsive + accessible** — fluid container, mobile breakpoint, visible focus rings,
  ARIA labels/live regions, `prefers-reduced-motion`, and light/dark theme tokens.

## Mock API contract

`analyzeArgument(text)` resolves after a short delay with:

```js
{
  fallacies: [
    {
      id: "false-cause-142",
      type: "False Cause",
      category: "Causal reasoning",
      fallacyId: "false-cause",
      start: 142,        // character offset into the original text
      end: 253,
      sentence: "Ever since ... clearly working.",
      explanation: "Why the reasoning breaks...",
      suggested_rewrite: "A stronger version of the claim..."
    }
  ],
  meta: {
    wordCount: 96,
    sentenceCount: 12,
    mocked: true,
    analyzedAt: "2026-11-12T..."
  }
}
```

The sample essay returns four hardcoded findings. Other pasted text is mapped to findings
with simple keyword cues so highlights remain testable — this is deliberately naive mock
logic, not detection.

To connect the real backend, replace the body of `analyzeArgument` in
`client/src/services/analyzeService.js` with a `fetch('/api/analyze', ...)` call and keep the
same response shape. The Vite proxy already forwards `/api` to port 5000.

## Notes

- The server's `/api/analyze` route returns `501` on purpose; no real detection endpoint is
  built yet.
- All styles are plain CSS. Design tokens live at the top of `client/src/index.css`.
