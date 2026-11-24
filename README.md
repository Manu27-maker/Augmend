# ArguMend

**Catch the fallacy, not just the typo.**

ArguMend is a reasoning checker for essays, debate cases, and argument drafts. It flags
logical fallacies at the sentence level, explains why the reasoning weakens the claim, and
suggests a stronger version of the same point.

This repository contains the **React + Vite frontend** and a small **Express backend** that
sends the text to **Groq** (default model: `openai/gpt-oss-120b`) and returns
sentence-level fallacies with explanations and suggested rewrites.

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
│       │   └── analyzeService.js # POST /api/analyze client
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
    ├── index.js                  # Express host, CORS, result cache, /api/health, /api/analyze
    ├── analyzer.js               # Groq detector call, validation, offset mapping
    ├── verifier.js               # Verifier prompt, grounding, confidence threshold
    ├── verifier.test.js          # Grounding/threshold unit tests
    ├── cache.js                  # SHA-256 cache keys + bounded TTL/LRU cache
    ├── cache.test.js             # Cache unit tests
    ├── fallacies.js              # Fallacy ids the model may return
    ├── model-json.js             # Tolerant JSON extraction from model output
    ├── .env.example              # Copy to .env and add your Groq key
    └── package.json

evaluation/
├── dataset.json                  # 22-case development / regression benchmark
├── heldout.json                  # 18-case held-out benchmark (not used for tuning)
├── precision-set.json            # 16-case verifier tuning set
├── precision-heldout.json        # 16-case verifier held-out set
├── precision-fresh.json          # 17-case fresh set (partly seen after v11)
├── confidence-cases.json         # 9 target cases for high/medium/low
├── run-eval.mjs                  # Scoring harness, reports, record/replay
├── statistics.mjs                # Wilson score intervals
├── report.md                     # Latest development-set report
└── heldout-report.md             # Latest held-out report
```

## Run locally

Install dependencies once:

```bash
npm install
npm --prefix client install
npm --prefix server install
```

Add your Groq API key (get one at https://console.groq.com/keys):

```bash
cp server/.env.example server/.env
# then edit server/.env and set GROQ_API_KEY to your key
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

## API contract

`POST /api/analyze` accepts `{ "text": "..." }` (40–12,000 characters) and returns:

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
      suggested_rewrite: "A stronger version of the claim...",
      verified: true,    // present only when the second pass kept the finding
      confidence: "high", // high | medium; "low" is dropped by the default threshold
      verification_note: undefined, // "unsupported_rejection" | "contradictory_verdict" when a verdict could not be applied
      verification_reason: "The sentence asserts causation from timing alone."
    }
  ],
  meta: {
    wordCount: 96,
    sentenceCount: 12,
    mocked: false,
    analyzedAt: "2026-11-12T...",
    model: "openai/gpt-oss-120b",
    promptVersion: "v2",
    verification: {
      enabled: true,
      status: "ok",                 // ok | failed
      model: "openai/gpt-oss-20b",
      promptVersion: "v12",
      minConfidence: "medium",
      checked: 3,
      confirmed: 2,
      rejected: 1,
      unverified: 0,
      unsupportedRejections: 0,
      contradictoryConfirmations: 0,
      lowConfidence: 0,
      dropped: 1,                   // rejected + below confidence threshold
      latencyMs: 780,
      usage: { promptTokens: 619, completionTokens: 247, totalTokens: 866 }
    },
    usage: { promptTokens: 812, completionTokens: 240, totalTokens: 1052 },
    cached: true // present only on a cache hit
  }
}
```

How the backend keeps highlights accurate:

1. The model is asked to return the **verbatim sentence** plus a fallacy id from the allowed
   list — it never returns character offsets.
2. The server locates each quoted sentence in the submitted text (exact match first, then a
   whitespace/quote/case-insensitive pass) and computes `start` / `end` itself.
3. Findings whose quote cannot be located, or whose fallacy id is unknown, are dropped.

### Verification pass

The detector is tuned for recall, so a single call occasionally flags rhetoric that is
actually valid. After normalization, an optional second call reviews each finding and can
only confirm or reject it — it never adds findings or changes labels. The verifier sees the
quoted sentence, its label definition, and a small context window around the highlight.

- Findings the verifier rejects are removed.
- Findings below `MIN_VERIFIER_CONFIDENCE` (default `medium`) are removed.
- Kept findings carry `verified: true` and a `confidence` value, which the UI shows as a badge.
  `high` means the defect is unmistakable and the text supplies no support; `medium` means the
  label is defensible but the text supplies partial, ambiguous, or incomplete support.
- **Rejections must be grounded.** When the verifier rejects a finding, its `justification` must
  be a verbatim quote from the submitted text (case, punctuation, and whitespace are ignored
  when matching). If the quote is missing from the input — for example, an invented study or a
  paraphrase — the rejection is not applied: the finding is kept with `verified: false` and
  `verification_note: "unsupported_rejection"`. This prevents a hallucinated justification from
  silently costing recall.
- **Contradictory confirmations are not trusted.** A confirmation is told to report `"none"` as
  its justification and to describe partial support only in `reason`. If it nevertheless claims
  supporting text exists, the finding is kept as `verified: false` with
  `verification_note: "contradictory_verdict"`, so a confused verdict never raises confidence.
- **Fail-open:** if the verifier is rate limited, times out, or returns malformed or partial
  JSON, the detector findings are returned unchanged and `meta.verification.status` is
  `failed`. A failed second pass never hides results.
- Disable the pass with `VERIFY_FINDINGS=false`; choose the model with `VERIFIER_MODEL`.

### Result cache

Identical submissions are served from a bounded in-memory cache instead of calling Groq again.
The key is a SHA-256 of the passage plus every setting that changes the answer: detector model,
detector prompt version, whether verification is on, verifier model, and minimum confidence. A
cache hit returns the stored result with `meta.cached: true`; the passage text itself is never
stored in the key.

- Defaults: 100 entries, 1 hour TTL, least-recently-used eviction.
- Tune with `CACHE_MAX_ENTRIES` and `CACHE_TTL_MS`, or disable with `CACHE_RESULTS=false`.
- Results from a failed verification pass are not cached, so a Groq outage cannot pin a degraded
  answer for the whole TTL.
- `GET /api/health` reports `cache.entries` and the configured limits.

```json
{
  "status": "ok",
  "service": "argumend-server",
  "analysis": "groq",
  "model": "openai/gpt-oss-120b",
  "verification": { "enabled": true, "model": "openai/gpt-oss-20b", "minConfidence": "medium" },
  "cache": { "enabled": true, "entries": 0, "maxEntries": 100, "ttlMs": 3600000 }
}
```

Error responses use `{ "error": "code", "message": "..." }`. Notable codes:
`invalid_request` (400), `text_too_long` (413), `rate_limited` (429),
`upstream_auth` / `bad_model` / `timeout` (502/504), `not_configured` (503).

## Evaluation

Five labeled benchmarks live in `evaluation/`. The harness starts the API if needed, scores
each finding against the labeled sentence (label + ≥50% span overlap), and writes a Markdown
report plus raw JSON.

| File | Cases | Role |
| --- | ---: | --- |
| `dataset.json` | 22 | Development set used to tune the detector prompt |
| `heldout.json` | 18 | Detector held-out set, frozen before prompt v2 |
| `precision-set.json` | 16 | Adversarial set used to tune the verifier prompt |
| `precision-heldout.json` | 16 | First verifier held-out set |
| `precision-fresh.json` | 17 | Fresh set written after verifier prompt v8; two cases later informed v11, so partly seen |

```bash
npm test                        # verifier grounding, replay, calibration, and confidence fixture tests
npm run eval                    # detector dev set
npm run eval:heldout            # detector held-out set
npm run eval:precision          # verifier tuning set
npm run eval:precision:heldout  # first verifier held-out set
npm run eval:precision:fresh    # fresh verifier estimate

# A/B a single dataset
node evaluation/run-eval.mjs --dataset precision-set.json --verify off --tag baseline
node evaluation/run-eval.mjs --dataset precision-set.json --verify on  --tag verified
```

### Record once, replay the verifier cheaply

Every full run pays for the detector and the verifier. To iterate on the verifier prompt without
re-paying for detection, record the detector's raw output once and replay the verifier against it:

```bash
npm run record:precision:fresh          # writes evaluation/precision-fresh-detector-v2.json
npm run replay:precision:fresh          # replays the newest fixture through the verifier
npm run replay:precision:fresh -- --min-confidence high
```

`--record` calls the detector in-process with verification disabled, so the fixture holds raw
detector findings, not verifier-filtered ones. `--replay latest` picks the highest recorded prompt
version for the dataset (`v12` beats `v9`), and replay refuses a fixture whose text or dataset
version no longer matches. Fixtures are named `<dataset>-detector-<prompt-version>.json`; use
`--out <file>` to override. The replay report records the fixture name in its source line so a
number can always be traced back to the exact detector output that produced it.

The `--verify` flag refuses to reuse an already-running API whose verification setting does not
match. `evaluation/probe-verifier.mjs` prints the verifier's per-finding verdict and quoted
justification:

```bash
node evaluation/probe-verifier.mjs --case pf-4
node evaluation/probe-verifier.mjs --text "..." --fallacy false-cause
```

`evaluation/confidence-cases.json` holds nine target passages for the confidence levels, with the
expected verdict and the reasoning written next to each one:

```bash
npm run probe:confidence                            # all nine, 20s pacing
npm run probe:confidence -- --case me-1 --case lo-1 # a subset
```

The runner calls the verifier with `MIN_VERIFIER_CONFIDENCE=low` so a `low` verdict is visible
instead of being dropped, and exits non-zero when a case does not land on its expected level.
Treat a mismatch as a prompt signal, not a broken test — the cases are deliberately borderline.

| Level | Case | Passage | Why it targets that level |
| --- | --- | --- | --- |
| high | `hi-1` | “The new safety training is pointless because the trainer has a tattoo and rides a motorcycle.” | Personal facts are the whole argument; no support exists. |
| high | `hi-2` | “The consultant's report is right because it is the most accurate report available.” | “Most accurate” restates “right”. |
| high | `hi-3` | “Every company is moving to four-day weeks, so ours should too; that many companies cannot be wrong.” | Popularity is the only support. |
| medium | `me-1` | “Sales rose after the ad campaign; the campaign reached 40,000 people, though we did not track conversions.” | Reach is partial evidence, but causation is still unmeasured. |
| medium | `me-2` | “We surveyed 120 customers across three stores and 70% preferred the new layout, so customers nationwide will prefer it.” | A real sample supports the claim, but the national conclusion outruns it. |
| medium | `me-3` | “We can either cut the marketing budget or miss payroll; the spreadsheet shows a $40,000 gap.” | The gap is real, but it does not prove only two options exist. |
| low | `lo-1` | “If we let one team work from home, soon the whole company will be remote.” | The chain is unsupported, but the sentence may be hyperbole. |
| low | `lo-2` | “The policy is fair because everyone pays the same rate.” | Equal rates may define fairness rather than restate a conclusion. |
| low | `lo-3` | “The senator's vote on the bill is suspect because the industry donated to his campaign.” | A donation can bear on motive; the sentence never shows it changed the vote. |

Generated `*-results.json` and `*-report.md` files are artifacts of the latest run for that set
and print their prompt version at the top. The tables below are the authoritative summary.

### Confidence calibration

Every run reports precision per confidence bucket and what would happen under each
`MIN_VERIFIER_CONFIDENCE` setting. The report includes:

| Confidence | Kept | TP | FP | Precision |
| --- | ---: | ---: | ---: | ---: |
| high | … | … | … | … |
| medium | … | … | … | … |
| low | … | … | … | … |
| unverified (fail-open) | … | … | … | … |

| Policy | Precision | Recall | F1 |
| --- | ---: | ---: | ---: |
| high only | … | … | … |
| medium and above | … | … | … |
| all verified | … | … | … |

Precision, recall, the clean-case false-positive rate, and every bucket and policy row are printed
with a 95% Wilson score interval, because these sets are small. Treat two configurations whose
intervals overlap as unresolved, rather than declaring the one with the higher point estimate the
winner. The interval math and the bucket/threshold math are pinned by
`evaluation/statistics.test.mjs` and `evaluation/calibration.test.mjs`.

This is the calibration signal: `high` should be more precise than `medium`, and the threshold
table shows the recall cost of raising the bar. Recall is measured against all labeled
findings, so unverified findings count as misses under a threshold policy rather than being
hidden. Use the table to choose the threshold instead of guessing.

### Model selection

- **Detector:** `openai/gpt-oss-120b` — the strongest general-reasoning model available to this
  Groq key, with JSON-object response mode, `temperature: 0`, a fixed `seed`, and
  `reasoning_effort: "low"` to keep latency and token use down. Mean latency is ~1.5–2s.
- **Verifier:** `openai/gpt-oss-20b` by default. It is cheaper and nearly as accurate as the
  120b model on the precision benchmarks once the rubric is explicit. Raise it with
  `VERIFIER_MODEL=openai/gpt-oss-120b` if your quota allows.
- **Alternatives on the key:** `qwen/qwen3.8-27b`, `allam-2-7b`.
  `llama-3.3-70b-versatile` is not enabled for this account.
- **Switch models** with `GROQ_MODEL` / `VERIFIER_MODEL`; every response reports the model and
  both prompt versions in `meta`.

The fixed seed makes repeated runs more reproducible, but Groq does not guarantee bit-identical
output; expect occasional changes on borderline cases even at `temperature: 0`.

### Results (detector `openai/gpt-oss-120b`)

| Run | Dataset | Precision | Recall | F1 | Clean-case FP rate | Mean latency |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Detector prompt v1 | dev, 22 cases | 88.9% | 94.1% | 91.4% | 12.5% | 1.50s |
| Detector prompt v2 | dev, 22 cases | 100.0% | 100.0% | 100.0% | 0.0% | 1.35s |
| Detector prompt v2 | held-out, 18 cases | 92.9% | 92.9% | 92.9% | 0.0% | 1.63s |

**Use the held-out row as the detector accuracy estimate.** The dev row was used to tune the
prompt, so it is optimistic by construction. The held-out set was frozen before prompt v2 and
run once: 17/18 cases exact, one strawman misclassified as slippery slope. Highlight spans
were 100% exact on every true positive in all runs.

Prompt v2 improved on v1 by:

- separating ad hominem (attacks person/motive) from strawman (distorts the position);
- excluding legitimate citations of qualified experts, official records, and documented data
  from `appeal-to-authority`;
- excluding text that merely names or reports a fallacy, and hedged claims that acknowledge
  their own limits.

### Verification results

The verification pass was measured on adversarial precision sets: passages that tempt a
detector into false positives (reported fallacies, rhetorical questions, genuine constraints,
hedged samples, stated mechanisms) plus a few unambiguous fallacies to catch over-filtering.
Each set is scored on the **final output** after verification.

| Configuration | Dataset | Precision | Recall | F1 | Clean-case FP rate |
| --- | --- | ---: | ---: | ---: | ---: |
| Detector only | precision, 16 cases | 44.4% | 100.0% | 61.5% | 41.7% |
| + verifier v3, 20b | precision, 16 cases | 100.0% | 100.0% | 100.0% | 0.0% |
| + verifier v3, 120b | precision, 16 cases | 100.0% | 100.0% | 100.0% | 0.0% |
| + verifier v8, 20b | precision held-out, 16 cases | 100.0% | 100.0% | 100.0% | 0.0% |
| + verifier v10, 20b | fresh, 17 cases | 71.4% | 100.0% | 83.3% | 16.7% |

On the tuning set, verification removed every false positive (5/5) and kept all four clear
fallacies. On the first held-out set, it again kept 4/4 fallacies and dropped 0 clean cases.
Verifier latency was ~0.6–0.8s, added to a ~1.5–2s detector call.

The fresh row is the honest out-of-sample result. The 20b detector proposed seven findings: five
correct and two hard negatives (`fx-1`, a causal claim backed by a maintenance log; `fx-7`, a
contract that fixes an either/or). The v10 verifier confirmed both, which is why the fresh-set
precision is 71.4% rather than 100%.

Prompt v11 added the two general escape conditions those cases exposed: records that
independently establish a mechanism, and an external constraint that fixes an option set, both
count as support. Spot checks then rejected `fx-1` and `fx-7` with grounded quotes, still kept
the four clear fallacies, and rejected a rhetorical question, a steelman, an anecdote with a
stated mechanism, and two genuine constraints. One acknowledged-confound case was still
confirmed; the detector did not propose it, so it does not affect current output. A full v11 run
could not be completed: the free-tier daily cap was exhausted by the investigation itself. The
table therefore keeps the v10 fresh row and reports v11 as a targeted fix, not a measured
improvement.

Prompt v12 changes only the confidence semantics described below. It does not relax the
rejection rules; `high` is reserved for “no support at all”, and partial support stays in the
output as `medium` instead of being forced to `high`.

#### Confidence calibration

The evaluation harness reports precision per confidence bucket and the precision/recall of each
possible `MIN_VERIFIER_CONFIDENCE` policy. The first complete fresh run (v10) produced:

| Confidence | Kept | TP | FP | Precision |
| --- | ---: | ---: | ---: | ---: |
| high | 7 | 5 | 2 | 71.4% |
| medium | 0 | 0 | 0 | — |
| low | 0 | 0 | 0 | — |
| unverified (fail-open) | 0 | 0 | 0 | — |

| Policy | Precision | Recall | F1 |
| --- | ---: | ---: | ---: |
| high only | 71.4% | 100.0% | 83.3% |
| medium and above | 71.4% | 100.0% | 83.3% |
| all verified | 71.4% | 100.0% | 83.3% |

This is the key calibration finding: on the fresh set the confidence label had **no usable
dynamic range**. Every kept finding was `high`, including both false positives, so raising the
threshold changed nothing. Combined with the earlier 4/4 held-out run, `high` was 9/11 (81.8%)
precise on adversarial sets — useful, but not the guarantee the word suggests.

The cause was a rubric defect, not a model defect. The v10 prompt told the reviewer to “use
confidence medium and still reject” when support was weak or partial. Rejection removes the
finding, so a confirmation could only ever be `high`. v12 fixes this: partial or ambiguous
support produces a confirmed finding at `medium`, and `high` is reserved for an unmistakable
defect with no support. Until v12 is benchmarked, keep the default threshold at `medium` and
treat the badge as “reviewed by a second model”, not as a probability.

### Error analysis and limitations

- The detector held-out miss is a real taxonomy boundary: “a pilot bike lane … a sneaky way to
  ban cars from downtown” exaggerates a proposal, which the model read as a slippery slope
  rather than a strawman.
- The benchmarks are small (16–22 cases per set) and author-labeled. They are regression
  signals, not a publishable accuracy claim; reasonable annotators may disagree on borderline
  rhetoric.
- Groq does not guarantee bit-identical output even at `temperature: 0` with a fixed seed, so
  scores can move by a case or two between runs. Prompt versions v1–v12 were iterated during
  development; the tuning sets are optimistic by construction.
- The free tier is limited to 8,000 tokens/minute and 200,000 tokens/day per model. Benchmark
  runs and verifier probing exhausted both the 120b and 20b daily caps, which is why v11 and v12
  are validated by targeted probes rather than full runs.
- Findings whose quoted sentence cannot be located in the input are dropped and count as
  misses, which keeps highlighting trustworthy.
- Only one finding is kept per sentence span. If one sentence commits two different fallacies,
  the second can be dropped, which costs recall.
- `confidence` is an ordinal review signal, not a calibrated probability. The measured buckets
  are reported in every evaluation run; the first fresh run showed `high` at 71.4% precision
  with no `medium` or `low` findings, which is why v12 separates “no support” from “partial
  support”. Do not treat `high` as a statistical guarantee.
- The fresh set is no longer strictly untouched: its `fx-1` and `fx-7` cases motivated the v11
  rules. Future estimates should use a new, never-inspected set.
- The verifier fails open. If it is unavailable, results are returned unverified rather than
  being silently hidden; `meta.verification.status` records the failure.
- **Fine-tuning was not performed.** Groq serves these models inference-only, and prompt-level
  controls already reach the target error budget on the held-out set. Revisit fine-tuning only
  if a larger benchmark shows the remaining errors are systematic and a self-hosted training
  path is available.

## Notes

- The Groq key lives **only** in `server/.env` (gitignored). The browser never sees it; the
  client calls the local Express API.
- Analysis quality depends on the model. Treat findings as suggestions, not verdicts.
- All styles are plain CSS. Design tokens live at the top of `client/src/index.css`.
