/**
 * ArguMend analysis service — MOCKED.
 *
 * The UI is built against this contract so the real backend can be dropped in
 * later without touching components:
 *
 *   analyzeArgument(text) -> Promise<{
 *     fallacies: Array<{
 *       id, type, category, start, end, sentence, explanation, suggested_rewrite
 *     }>,
 *     meta: { wordCount, sentenceCount, mocked, analyzedAt }
 *   }>
 *
 * `start` / `end` are character offsets into the original text.
 * When wiring the Express API, swap the body of analyzeArgument for:
 *   const res = await fetch('/api/analyze', { method: 'POST', ... })
 */

import { FALLACY_BY_ID } from '../data/fallacyBank'

const ANALYSIS_DELAY_MS = 1400

/** Recognises the "clean" demo text so the zero-findings state is testable. */
const CLEAN_DEMO_MARKER = 'That evidence is suggestive, not conclusive.'

/** Hardcoded demo findings for the sample essay. */
const DEMO_FINDINGS = [
  {
    sentence:
      'Ever since the city introduced the new curfew, crime has gone down — so the curfew is clearly working.',
    fallacyId: 'false-cause',
    explanation:
      'The sentence moves from “the curfew came first” to “the curfew caused the drop,” but no causal link is shown. Crime could have fallen because of changes in policing, the economy, reporting practices, or seasonal variation. Correlation alone cannot carry the claim.',
    suggested_rewrite:
      '“Crime fell after the curfew was introduced. To show the curfew caused that drop, compare districts with and without a curfew and control for changes in policing and reporting.”',
  },
  {
    sentence:
      'My opponent wants to expand the youth program instead, but he has never run a business, so his proposal is worthless.',
    fallacyId: 'ad-hominem',
    explanation:
      'The argument attacks the opponent’s background rather than evaluating the youth program proposal. Whether someone has run a business is not, by itself, evidence that their policy idea is unsound.',
    suggested_rewrite:
      '“My opponent proposes expanding the youth program. Before adopting it, we should examine its cost per participant and whether evaluations show lower reoffending rates.”',
  },
  {
    sentence:
      'Supporters of the policy claim we should consider the evidence, but what they really want is to let criminals walk free.',
    fallacyId: 'strawman',
    explanation:
      'The sentence replaces a careful position (“consider the evidence”) with an extreme motive (“let criminals walk free”). That distorted version is easier to reject, but it is not the position being defended, so the rebuttal misses the actual argument.',
    suggested_rewrite:
      '“Supporters argue that the evidence should guide the decision. I disagree because the studies they cite rely on self-reported data. Here is why that weakens their case…”',
  },
  {
    sentence:
      'If we allow students to revise their essays once, soon they will demand unlimited rewrites, then grades will become meaningless, and eventually no one will learn anything at all.',
    fallacyId: 'slippery-slope',
    explanation:
      'The sentence asserts a chain of escalating consequences — one revision leads to unlimited rewrites, then meaningless grades, then no learning — without evidence that each link must follow. The predicted outcome is treated as inevitable rather than one possibility among several.',
    suggested_rewrite:
      '“Allowing one revision may create pressure for more flexibility. We can test a one-revision policy next term and review how students use it before deciding whether to expand it.”',
  },
]

/** Keyword cues used only to make the mock feel alive on custom text. */
const CUE_RULES = [
  {
    fallacyId: 'ad-hominem',
    test: /\b(idiot|stupid|liar|clueless|unqualified|never (run|worked)|can't be trusted)\b/i,
  },
  {
    fallacyId: 'slippery-slope',
    test: /\b(if we|eventually|sooner or later|will inevitably|next thing)\b/i,
  },
  {
    fallacyId: 'hasty-generalization',
    test: /\b(everyone|all of them|most people|always|never|two of my)\b/i,
  },
  {
    fallacyId: 'false-dilemma',
    test: /\b(either|only two (choices|options)|you're with us or)\b/i,
  },
  {
    fallacyId: 'false-cause',
    test: /\b(because|since|caused|led to|as a result|after the)\b/i,
  },
  {
    fallacyId: 'bandwagon',
    test: /\b(everybody|everyone else|popular|trending|majority)\b/i,
  },
]

function splitSentences(text) {
  const sentences = []
  const regex = /[^.!?]+[.!?]+(?:["'”’)]*)?(?=\s|$)|[^.!?]+$/g
  let match

  while ((match = regex.exec(text)) !== null) {
    const raw = match[0]
    const leading = raw.length - raw.trimStart().length
    const value = raw.trim()
    if (!value) continue
    const start = match.index + leading
    sentences.push({ text: value, start, end: start + value.length })
  }

  return sentences
}

function buildFinding({ sentence, start, end, fallacyId, explanation, suggested_rewrite }) {
  const fallacy = FALLACY_BY_ID[fallacyId]

  return {
    id: `${fallacyId}-${start}`,
    type: fallacy.name,
    category: fallacy.category,
    fallacyId,
    start,
    end,
    sentence,
    explanation,
    suggested_rewrite,
  }
}

function demoFindings(text) {
  const findings = []

  for (const demo of DEMO_FINDINGS) {
    const start = text.indexOf(demo.sentence)
    if (start === -1) continue
    findings.push(
      buildFinding({
        sentence: demo.sentence,
        start,
        end: start + demo.sentence.length,
        fallacyId: demo.fallacyId,
        explanation: demo.explanation,
        suggested_rewrite: demo.suggested_rewrite,
      }),
    )
  }

  return findings.sort((a, b) => a.start - b.start)
}

/**
 * Fallback for pasted text that is not the sample essay. It maps the demos
 * onto cue-matching sentences so the highlight + card flow stays testable.
 * This is deliberately naive — it is mock UI scaffolding, not detection logic.
 */
function heuristicFindings(text) {
  const sentences = splitSentences(text).filter((sentence) => sentence.text.length > 40)
  const used = new Set()
  const findings = []

  for (const rule of CUE_RULES) {
    const match = sentences.find(
      (sentence) => !used.has(sentence.start) && rule.test.test(sentence.text),
    )
    if (!match) continue

    used.add(match.start)
    const fallacy = FALLACY_BY_ID[rule.fallacyId]

    findings.push(
      buildFinding({
        sentence: match.text,
        start: match.start,
        end: match.end,
        fallacyId: rule.fallacyId,
        explanation: `${fallacy.definition} In this sentence, the wording assumes the pattern above without supplying the missing link. The claim may still be true, but this sentence does not yet show why.`,
        suggested_rewrite: `State what evidence would support the claim, then name it: “${match.text.replace(/[.!?]+$/, '')}” works only if you add a specific comparison, source, or piece of data.`,
      }),
    )

    if (findings.length === 3) break
  }

  // Guarantee at least one finding for non-empty input so the demo is visible.
  if (findings.length === 0 && sentences.length > 0) {
    const longest = [...sentences].sort((a, b) => b.text.length - a.text.length)[0]
    findings.push(
      buildFinding({
        sentence: longest.text,
        start: longest.start,
        end: longest.end,
        fallacyId: 'hasty-generalization',
        explanation:
          'This is a mocked finding. The claim is broad relative to the support offered in the text, so a reader would want to know what sample or evidence justifies the generalisation.',
        suggested_rewrite:
          'Narrow the claim to the evidence you actually have, or add the specific examples, data, or sources that justify the broader conclusion.',
      }),
    )
  }

  return findings.sort((a, b) => a.start - b.start)
}

export async function analyzeArgument(text) {
  const source = typeof text === 'string' ? text : ''

  await new Promise((resolve) => {
    setTimeout(resolve, ANALYSIS_DELAY_MS)
  })

  const baseMeta = {
    wordCount: source.trim() ? source.trim().split(/\s+/).length : 0,
    sentenceCount: source.trim() ? splitSentences(source).length : 0,
    mocked: true,
    analyzedAt: new Date().toISOString(),
  }

  if (!source.trim() || source.includes(CLEAN_DEMO_MARKER)) {
    return { fallacies: [], meta: baseMeta }
  }

  const sampleFindings = demoFindings(source)
  const fallacies = sampleFindings.length > 0 ? sampleFindings : heuristicFindings(source)

  return { fallacies, meta: baseMeta }
}
