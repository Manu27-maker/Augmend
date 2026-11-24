# ArguMend — Fallacy Detection Evaluation

- **Run:** 2026-11-19T10:44:17.036Z
- **Model:** `openai/gpt-oss-120b`
- **Prompt version:** `v2`
- **Dataset:** `precision-set.json` 1.0.0 — 16 cases, 4 expected findings, 12 clean/control cases
- **Role:** development/tuning set — verifier prompt iterations were guided by these cases
- **Matching rule:** a prediction is a true positive when the fallacy id matches and its highlighted span covers ≥50% of the labeled sentence.

## Headline metrics

| Metric | Value |
| --- | --- |
| Precision (micro) | 100.0% |
| Recall (micro) | 100.0% |
| F1 (micro) | 100.0% |
| Precision (macro over label classes) | 100.0% |
| Recall (macro over label classes) | 100.0% |
| Document accuracy (exact label set) | 100.0% (16/16) |
| Highlight span exact match | 100.0% of TPs |
| Mean labeled-span coverage | 100.0% |
| Clean-case false-positive rate | 0.0% (0/12 clean cases flagged) |
| Findings: TP / FP / FN | 4 / 0 / 0 |
| Mean latency | 2.0s (max 4.6s) |

## Verification pass

- **Verifier:** `openai/gpt-oss-20b` (prompt `v6`), minimum confidence: **medium**
- **Checked:** 9 | **Confirmed:** 4 | **Rejected:** 5 | **Unverified (kept):** 0 | **Dropped as low confidence:** 0
- **Verifier failures (findings kept, fail-open):** 0

## Per-fallacy performance

| Fallacy | Support | TP | FP | FN | Precision | Recall |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Ad Hominem | 1 | 1 | 0 | 0 | 100.0% | 100.0% |
| Bandwagon | 1 | 1 | 0 | 0 | 100.0% | 100.0% |
| Circular Reasoning | 1 | 1 | 0 | 0 | 100.0% | 100.0% |
| Slippery Slope | 1 | 1 | 0 | 0 | 100.0% | 100.0% |
| Appeal to Authority | 0 | 0 | 0 | 0 | — | — |
| False Cause | 0 | 0 | 0 | 0 | — | — |
| False Dilemma | 0 | 0 | 0 | 0 | — | — |
| Hasty Generalization | 0 | 0 | 0 | 0 | — | — |
| Red Herring | 0 | 0 | 0 | 0 | — | — |
| Strawman | 0 | 0 | 0 | 0 | — | — |

## Per-case results

| Case | Tags | Expected | Predicted | Verdict |
| --- | --- | --- | --- | --- |
| `pn-1` | clean, causal | — | — | ✅ clean |
| `pn-2` | clean, authority | — | — | ✅ clean |
| `pn-3` | clean, adversarial, reported | — | — | ✅ clean |
| `pn-4` | clean, hedged | — | — | ✅ clean |
| `pn-5` | clean, rhetorical | — | — | ✅ clean |
| `pn-6` | clean, emotional | — | — | ✅ clean |
| `pn-7` | clean, dilemma | — | — | ✅ clean |
| `pn-8` | clean, correlation | — | — | ✅ clean |
| `pn-9` | clean, steelman | — | — | ✅ clean |
| `pn-10` | clean, anecdote | — | — | ✅ clean |
| `pn-11` | clean, expertise | — | — | ✅ clean |
| `pn-12` | clean, conditional | — | — | ✅ clean |
| `pf-1` | fallacy, ad-hominem | Ad Hominem | Ad Hominem | ✅ exact |
| `pf-2` | fallacy, bandwagon | Bandwagon | Bandwagon | ✅ exact |
| `pf-3` | fallacy, slippery-slope | Slippery Slope | Slippery Slope | ✅ exact |
| `pf-4` | fallacy, circular-reasoning | Circular Reasoning | Circular Reasoning | ✅ exact |

## False positives

None on this run.

## Missed findings

None on this run.

## Interpretation and limitations

- This is a small, author-labeled benchmark (16 cases). It is a regression signal, not a publishable accuracy claim.
- Labels follow the app taxonomy in `server/fallacies.js`; reasonable annotators may disagree on borderline rhetoric.
- Clean controls deliberately include valid causal claims, legitimate expertise, hedged generalizations, reported speech, and emotional-but-evidenced writing to punish over-triggering.
- Each document is sent once. LLM sampling means scores can move a few points between runs; temperature is 0.1.
- The model reports 'verbatim' sentences, and the server computes offsets, so a finding can be dropped if the quote cannot be located. Dropped quotes count as misses here.

## Fine-tuning decision

- **Not performed.** Groq serves these models inference-only; there is no fine-tuning endpoint for `gpt-oss-120b`.
- Prompt-level controls (explicit taxonomy, verbatim-quote requirement, clean-text caution) are the cheaper first lever. Revisit fine-tuning only if the error budget below is unacceptable and a self-hosted/open-weight training path is available.

