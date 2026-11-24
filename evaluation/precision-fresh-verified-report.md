# ArguMend — Fallacy Detection Evaluation

- **Run:** 2026-11-19T16:02:49.573Z
- **Model:** `openai/gpt-oss-20b`
- **Prompt version:** `v2`
- **Dataset:** `precision-fresh.json` 1.0.0 — 17 cases, 5 expected findings, 12 clean/control cases
- **Role:** fresh precision set — written after verifier prompt v8 was frozen, never used for tuning
- **Matching rule:** a prediction is a true positive when the fallacy id matches and its highlighted span covers ≥50% of the labeled sentence.

## Headline metrics

| Metric | Value |
| --- | --- |
| Precision (micro) | 71.4% |
| Recall (micro) | 100.0% |
| F1 (micro) | 83.3% |
| Precision (macro over label classes) | 80.0% |
| Recall (macro over label classes) | 100.0% |
| Document accuracy (exact label set) | 88.2% (15/17) |
| Highlight span exact match | 100.0% of TPs |
| Mean labeled-span coverage | 100.0% |
| Clean-case false-positive rate | 16.7% (2/12 clean cases flagged) |
| Findings: TP / FP / FN | 5 / 2 / 0 |
| Mean latency | 1.1s (max 2.2s) |

## Verification pass

- **Verifier:** `openai/gpt-oss-20b` (prompt `v10`), minimum confidence: **medium**
- **Checked:** 7 | **Confirmed:** 7 | **Rejected:** 0 | **Unverified (kept):** 0 | **Dropped as low confidence:** 0
- **Unsupported rejections (kept):** 0 | **Contradictory confirmations (kept):** 0
- **Verifier failures (findings kept, fail-open):** 0

## Confidence calibration

Each kept finding carries the verifier’s confidence. Precision is the share of kept findings that matched a labeled sentence.

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

Recall is measured against all expected findings. Threshold policies exclude unverified findings, so a failed or partial verification pass lowers recall rather than hiding it.

## Per-fallacy performance

| Fallacy | Support | TP | FP | FN | Precision | Recall |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Ad Hominem | 1 | 1 | 0 | 0 | 100.0% | 100.0% |
| Appeal to Authority | 1 | 1 | 0 | 0 | 100.0% | 100.0% |
| False Cause | 1 | 1 | 1 | 0 | 50.0% | 100.0% |
| False Dilemma | 1 | 1 | 1 | 0 | 50.0% | 100.0% |
| Slippery Slope | 1 | 1 | 0 | 0 | 100.0% | 100.0% |
| Bandwagon | 0 | 0 | 0 | 0 | — | — |
| Circular Reasoning | 0 | 0 | 0 | 0 | — | — |
| Hasty Generalization | 0 | 0 | 0 | 0 | — | — |
| Red Herring | 0 | 0 | 0 | 0 | — | — |
| Strawman | 0 | 0 | 0 | 0 | — | — |

## Per-case results

| Case | Tags | Expected | Predicted | Verdict |
| --- | --- | --- | --- | --- |
| `fx-1` | clean, causal | — | False Cause | ❌ false positive |
| `fx-2` | clean, authority | — | — | ✅ clean |
| `fx-3` | clean, reported | — | — | ✅ clean |
| `fx-4` | clean, hedged | — | — | ✅ clean |
| `fx-5` | clean, rhetorical | — | — | ✅ clean |
| `fx-6` | clean, emotional | — | — | ✅ clean |
| `fx-7` | clean, dilemma | — | False Dilemma | ❌ false positive |
| `fx-8` | clean, correlation | — | — | ✅ clean |
| `fx-9` | clean, steelman | — | — | ✅ clean |
| `fx-10` | clean, anecdote | — | — | ✅ clean |
| `fx-11` | clean, expertise | — | — | ✅ clean |
| `fx-12` | clean, conditional | — | — | ✅ clean |
| `ff-1` | fallacy, ad-hominem | Ad Hominem | Ad Hominem | ✅ exact |
| `ff-2` | fallacy, appeal-to-authority | Appeal to Authority | Appeal to Authority | ✅ exact |
| `ff-3` | fallacy, false-cause | False Cause | False Cause | ✅ exact |
| `ff-4` | fallacy, false-dilemma | False Dilemma | False Dilemma | ✅ exact |
| `ff-5` | fallacy, slippery-slope | Slippery Slope | Slippery Slope | ✅ exact |

## False positives

- `fx-1` (clean control) — **False Cause**: “The plant's output fell 12 percent after the conveyor motor failed; m…”
- `fx-7` (clean control) — **False Dilemma**: “The lease allows either a one-year renewal or a month-to-month extens…”

## Missed findings

None on this run.

## Interpretation and limitations

- This is a small, author-labeled benchmark (17 cases). It is a regression signal, not a publishable accuracy claim.
- Labels follow the app taxonomy in `server/fallacies.js`; reasonable annotators may disagree on borderline rhetoric.
- Clean controls deliberately include valid causal claims, legitimate expertise, hedged generalizations, reported speech, and emotional-but-evidenced writing to punish over-triggering.
- Each document is sent once. LLM sampling means scores can move a few points between runs; temperature is 0.1.
- The model reports 'verbatim' sentences, and the server computes offsets, so a finding can be dropped if the quote cannot be located. Dropped quotes count as misses here.

## Fine-tuning decision

- **Not performed.** Groq serves these models inference-only; there is no fine-tuning endpoint for `gpt-oss-120b`.
- Prompt-level controls (explicit taxonomy, verbatim-quote requirement, clean-text caution) are the cheaper first lever. Revisit fine-tuning only if the error budget below is unacceptable and a self-hosted/open-weight training path is available.

