# ArguMend — Fallacy Detection Evaluation

- **Run:** 2026-11-19T14:08:13.572Z
- **Model:** `openai/gpt-oss-120b`
- **Prompt version:** `v2`
- **Dataset:** `precision-heldout.json` 1.0.0 — 16 cases, 4 expected findings, 12 clean/control cases
- **Role:** held-out precision set — written after the verifier prompt was frozen and never used for tuning
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
| Mean latency | 1.1s (max 2.9s) |

## Verification pass

- **Verifier:** `openai/gpt-oss-20b` (prompt `v8`), minimum confidence: **medium**
- **Checked:** 4 | **Confirmed:** 4 | **Rejected:** 0 | **Unverified (kept):** 0 | **Dropped as low confidence:** 0
- **Verifier failures (findings kept, fail-open):** 0

## Per-fallacy performance

| Fallacy | Support | TP | FP | FN | Precision | Recall |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Ad Hominem | 1 | 1 | 0 | 0 | 100.0% | 100.0% |
| Appeal to Authority | 1 | 1 | 0 | 0 | 100.0% | 100.0% |
| False Dilemma | 1 | 1 | 0 | 0 | 100.0% | 100.0% |
| Hasty Generalization | 1 | 1 | 0 | 0 | 100.0% | 100.0% |
| Bandwagon | 0 | 0 | 0 | 0 | — | — |
| Circular Reasoning | 0 | 0 | 0 | 0 | — | — |
| False Cause | 0 | 0 | 0 | 0 | — | — |
| Red Herring | 0 | 0 | 0 | 0 | — | — |
| Slippery Slope | 0 | 0 | 0 | 0 | — | — |
| Strawman | 0 | 0 | 0 | 0 | — | — |

## Per-case results

| Case | Tags | Expected | Predicted | Verdict |
| --- | --- | --- | --- | --- |
| `ph-1` | clean, causal | — | — | ✅ clean |
| `ph-2` | clean, authority | — | — | ✅ clean |
| `ph-3` | clean, reported | — | — | ✅ clean |
| `ph-4` | clean, hedged | — | — | ✅ clean |
| `ph-5` | clean, rhetorical | — | — | ✅ clean |
| `ph-6` | clean, emotional | — | — | ✅ clean |
| `ph-7` | clean, dilemma | — | — | ✅ clean |
| `ph-8` | clean, correlation | — | — | ✅ clean |
| `ph-9` | clean, steelman | — | — | ✅ clean |
| `ph-10` | clean, anecdote | — | — | ✅ clean |
| `ph-11` | clean, expertise | — | — | ✅ clean |
| `ph-12` | clean, conditional | — | — | ✅ clean |
| `pf-h1` | fallacy, ad-hominem | Ad Hominem | Ad Hominem | ✅ exact |
| `pf-h2` | fallacy, appeal-to-authority | Appeal to Authority | Appeal to Authority | ✅ exact |
| `pf-h3` | fallacy, hasty-generalization | Hasty Generalization | Hasty Generalization | ✅ exact |
| `pf-h4` | fallacy, false-dilemma | False Dilemma | False Dilemma | ✅ exact |

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

