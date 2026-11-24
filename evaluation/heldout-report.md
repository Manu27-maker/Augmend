# ArguMend — Fallacy Detection Evaluation

- **Run:** 2026-11-19T10:33:15.568Z
- **Model:** `openai/gpt-oss-120b`
- **Prompt version:** `v2`
- **Dataset:** `heldout.json` 1.0.0 — 18 cases, 14 expected findings, 6 clean/control cases
- **Role:** held-out set — written after the detector prompt was frozen and never used for tuning
- **Matching rule:** a prediction is a true positive when the fallacy id matches and its highlighted span covers ≥50% of the labeled sentence.

## Headline metrics

| Metric | Value |
| --- | --- |
| Precision (micro) | 92.3% |
| Recall (micro) | 85.7% |
| F1 (micro) | 88.9% |
| Precision (macro over label classes) | 85.0% |
| Recall (macro over label classes) | 85.0% |
| Document accuracy (exact label set) | 88.9% (16/18) |
| Highlight span exact match | 100.0% of TPs |
| Mean labeled-span coverage | 100.0% |
| Clean-case false-positive rate | 0.0% (0/6 clean cases flagged) |
| Findings: TP / FP / FN | 12 / 1 / 2 |
| Mean latency | 2.0s (max 3.8s) |

## Verification pass

- **Verifier:** `openai/gpt-oss-20b` (prompt `v3`), minimum confidence: **medium**
- **Checked:** 14 | **Confirmed:** 13 | **Rejected:** 1 | **Unverified (kept):** 0 | **Dropped as low confidence:** 0
- **Verifier failures (findings kept, fail-open):** 0

## Per-fallacy performance

| Fallacy | Support | TP | FP | FN | Precision | Recall |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Ad Hominem | 3 | 3 | 0 | 0 | 100.0% | 100.0% |
| Appeal to Authority | 2 | 2 | 0 | 0 | 100.0% | 100.0% |
| False Cause | 2 | 1 | 0 | 1 | 100.0% | 50.0% |
| Bandwagon | 1 | 1 | 0 | 0 | 100.0% | 100.0% |
| Circular Reasoning | 1 | 1 | 0 | 0 | 100.0% | 100.0% |
| False Dilemma | 1 | 1 | 0 | 0 | 100.0% | 100.0% |
| Hasty Generalization | 1 | 1 | 0 | 0 | 100.0% | 100.0% |
| Red Herring | 1 | 1 | 0 | 0 | 100.0% | 100.0% |
| Slippery Slope | 1 | 1 | 1 | 0 | 50.0% | 100.0% |
| Strawman | 1 | 0 | 0 | 1 | — | 0.0% |

## Per-case results

| Case | Tags | Expected | Predicted | Verdict |
| --- | --- | --- | --- | --- |
| `h-fc-1` | single, false-cause | False Cause | — | ❌ missed |
| `h-st-1` | single, strawman | Strawman | Slippery Slope | ❌ missed |
| `h-ss-1` | single, slippery-slope | Slippery Slope | Slippery Slope | ✅ exact |
| `h-ad-1` | single, ad-hominem | Ad Hominem | Ad Hominem | ✅ exact |
| `h-hg-1` | single, hasty-generalization | Hasty Generalization | Hasty Generalization | ✅ exact |
| `h-fd-1` | single, false-dilemma | False Dilemma | False Dilemma | ✅ exact |
| `h-aa-1` | single, appeal-to-authority | Appeal to Authority | Appeal to Authority | ✅ exact |
| `h-cr-1` | single, circular-reasoning | Circular Reasoning | Circular Reasoning | ✅ exact |
| `h-bw-1` | single, bandwagon | Bandwagon | Bandwagon | ✅ exact |
| `h-rh-1` | single, red-herring | Red Herring | Red Herring | ✅ exact |
| `h-multi-1` | multi | False Cause, Ad Hominem | False Cause, Ad Hominem | ✅ exact |
| `h-multi-2` | multi | Appeal to Authority, Ad Hominem | Appeal to Authority, Ad Hominem | ✅ exact |
| `h-clean-1` | clean | — | — | ✅ clean |
| `h-clean-2` | clean, hedged | — | — | ✅ clean |
| `h-clean-3` | clean | — | — | ✅ clean |
| `h-clean-4` | clean, emotional | — | — | ✅ clean |
| `h-clean-5` | clean, adversarial | — | — | ✅ clean |
| `h-clean-6` | clean, authority | — | — | ✅ clean |

## False positives

- `h-st-1` — **Slippery Slope**: “The mayor supports a pilot bike lane, which is just a sneaky way to b…”

## Missed findings

- `h-fc-1` — **False Cause**: “The redesign is obviously what brought in all the new users.”
- `h-st-1` — **Strawman**: “The mayor supports a pilot bike lane, which is just a sneaky way to b…”

## Interpretation and limitations

- This is a small, author-labeled benchmark (18 cases). It is a regression signal, not a publishable accuracy claim.
- Labels follow the app taxonomy in `server/fallacies.js`; reasonable annotators may disagree on borderline rhetoric.
- Clean controls deliberately include valid causal claims, legitimate expertise, hedged generalizations, reported speech, and emotional-but-evidenced writing to punish over-triggering.
- Each document is sent once. LLM sampling means scores can move a few points between runs; temperature is 0.1.
- The model reports 'verbatim' sentences, and the server computes offsets, so a finding can be dropped if the quote cannot be located. Dropped quotes count as misses here.

## Fine-tuning decision

- **Not performed.** Groq serves these models inference-only; there is no fine-tuning endpoint for `gpt-oss-120b`.
- Prompt-level controls (explicit taxonomy, verbatim-quote requirement, clean-text caution) are the cheaper first lever. Revisit fine-tuning only if the error budget below is unacceptable and a self-hosted/open-weight training path is available.

