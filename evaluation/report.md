# ArguMend — Fallacy Detection Evaluation

- **Run:** 2026-11-19T10:10:41.749Z
- **Model:** `openai/gpt-oss-120b`
- **Prompt version:** `v2`
- **Dataset:** `dataset.json` 1.1.0 — 22 cases, 17 expected findings, 8 clean/control cases
- **Role:** development/tuning set — detector prompt iterations were guided by these cases
- **Matching rule:** a prediction is a true positive when the fallacy id matches and its highlighted span covers ≥50% of the labeled sentence.

## Headline metrics

| Metric | Value |
| --- | --- |
| Precision (micro) | 100.0% |
| Recall (micro) | 100.0% |
| F1 (micro) | 100.0% |
| Precision (macro over label classes) | 100.0% |
| Recall (macro over label classes) | 100.0% |
| Document accuracy (exact label set) | 100.0% (22/22) |
| Highlight span exact match | 100.0% of TPs |
| Mean labeled-span coverage | 100.0% |
| Clean-case false-positive rate | 0.0% (0/8 clean cases flagged) |
| Findings: TP / FP / FN | 17 / 0 / 0 |
| Mean latency | 2.2s (max 7.7s) |

## Verification pass

- **Verifier:** `openai/gpt-oss-20b` (prompt `v3`), minimum confidence: **medium**
- **Checked:** 17 | **Confirmed:** 17 | **Rejected:** 0 | **Dropped as low confidence:** 0
- **Verifier failures (findings kept, fail-open):** 0

## Per-fallacy performance

| Fallacy | Support | TP | FP | FN | Precision | Recall |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Ad Hominem | 3 | 3 | 0 | 0 | 100.0% | 100.0% |
| Bandwagon | 3 | 3 | 0 | 0 | 100.0% | 100.0% |
| False Cause | 3 | 3 | 0 | 0 | 100.0% | 100.0% |
| False Dilemma | 2 | 2 | 0 | 0 | 100.0% | 100.0% |
| Appeal to Authority | 1 | 1 | 0 | 0 | 100.0% | 100.0% |
| Circular Reasoning | 1 | 1 | 0 | 0 | 100.0% | 100.0% |
| Hasty Generalization | 1 | 1 | 0 | 0 | 100.0% | 100.0% |
| Red Herring | 1 | 1 | 0 | 0 | 100.0% | 100.0% |
| Slippery Slope | 1 | 1 | 0 | 0 | 100.0% | 100.0% |
| Strawman | 1 | 1 | 0 | 0 | 100.0% | 100.0% |

## Per-case results

| Case | Tags | Expected | Predicted | Verdict |
| --- | --- | --- | --- | --- |
| `fc-1` | single, false-cause | False Cause | False Cause | ✅ exact |
| `fc-2` | single, false-cause, typography | False Cause | False Cause | ✅ exact |
| `ad-1` | single, ad-hominem | Ad Hominem | Ad Hominem | ✅ exact |
| `ss-1` | single, slippery-slope | Slippery Slope | Slippery Slope | ✅ exact |
| `hg-1` | single, hasty-generalization | Hasty Generalization | Hasty Generalization | ✅ exact |
| `fd-1` | single, false-dilemma | False Dilemma | False Dilemma | ✅ exact |
| `aa-1` | single, appeal-to-authority | Appeal to Authority | Appeal to Authority | ✅ exact |
| `cr-1` | single, circular-reasoning | Circular Reasoning | Circular Reasoning | ✅ exact |
| `bw-1` | single, bandwagon | Bandwagon | Bandwagon | ✅ exact |
| `st-1` | single, strawman | Strawman | Strawman | ✅ exact |
| `rh-1` | single, red-herring | Red Herring | Red Herring | ✅ exact |
| `multi-1` | multi | False Cause, Ad Hominem | False Cause, Ad Hominem | ✅ exact |
| `multi-2` | multi | False Dilemma, Bandwagon | False Dilemma, Bandwagon | ✅ exact |
| `multi-3` | multi | Bandwagon, Ad Hominem | Bandwagon, Ad Hominem | ✅ exact |
| `clean-1` | clean | — | — | ✅ clean |
| `clean-2` | clean | — | — | ✅ clean |
| `clean-3` | clean, causal | — | — | ✅ clean |
| `clean-4` | clean, authority | — | — | ✅ clean |
| `clean-5` | clean, generalization | — | — | ✅ clean |
| `clean-6` | clean | — | — | ✅ clean |
| `clean-7` | clean, adversarial | — | — | ✅ clean |
| `clean-8` | clean, emotional | — | — | ✅ clean |

## False positives

None on this run.

## Missed findings

None on this run.

## Interpretation and limitations

- This is a small, author-labeled benchmark (22 cases). It is a regression signal, not a publishable accuracy claim.
- Labels follow the app taxonomy in `server/fallacies.js`; reasonable annotators may disagree on borderline rhetoric.
- Clean controls deliberately include valid causal claims, legitimate expertise, hedged generalizations, reported speech, and emotional-but-evidenced writing to punish over-triggering.
- Each document is sent once. LLM sampling means scores can move a few points between runs; temperature is 0.1.
- The model reports 'verbatim' sentences, and the server computes offsets, so a finding can be dropped if the quote cannot be located. Dropped quotes count as misses here.

## Fine-tuning decision

- **Not performed.** Groq serves these models inference-only; there is no fine-tuning endpoint for `gpt-oss-120b`.
- Prompt-level controls (explicit taxonomy, verbatim-quote requirement, clean-text caution) are the cheaper first lever. Revisit fine-tuning only if the error budget below is unacceptable and a self-hosted/open-weight training path is available.

