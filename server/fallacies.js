/**
 * Fallacy taxonomy exposed to the model.
 *
 * Keep this in sync with `client/src/data/fallacyBank.js` — the client uses the
 * ids here to look up display names and reference copy.
 */
export const FALLACIES = [
  {
    id: 'false-cause',
    name: 'False Cause',
    category: 'Causal reasoning',
    definition:
      'Assumes that because one event happened before another — or alongside it — the first event caused the second.',
  },
  {
    id: 'strawman',
    name: 'Strawman',
    category: 'Argument representation',
    definition:
      'Replaces someone’s actual position with a distorted or exaggerated version, then attacks the distortion.',
  },
  {
    id: 'slippery-slope',
    name: 'Slippery Slope',
    category: 'Causal reasoning',
    definition:
      'Claims that one small step will inevitably trigger a chain of increasingly extreme consequences, without justifying the chain.',
  },
  {
    id: 'ad-hominem',
    name: 'Ad Hominem',
    category: 'Relevance',
    definition:
      'Attacks the person making the argument — their character, background, or motives — instead of the argument itself.',
  },
  {
    id: 'hasty-generalization',
    name: 'Hasty Generalization',
    category: 'Evidence',
    definition:
      'Draws a broad conclusion from a small or unrepresentative sample of evidence.',
  },
  {
    id: 'false-dilemma',
    name: 'False Dilemma',
    category: 'Framing',
    definition:
      'Presents a situation as having only two options when other possibilities exist.',
  },
  {
    id: 'appeal-to-authority',
    name: 'Appeal to Authority',
    category: 'Evidence',
    definition:
      'Treats a claim as true simply because an authority figure said it, even when they lack relevant expertise or evidence is missing.',
  },
  {
    id: 'circular-reasoning',
    name: 'Circular Reasoning',
    category: 'Structure',
    definition:
      'Uses the conclusion as its own evidence, so the argument goes in a circle instead of supporting the claim.',
  },
  {
    id: 'bandwagon',
    name: 'Bandwagon',
    category: 'Evidence',
    definition:
      'Argues that a claim must be true or a choice must be good because many people believe or do it.',
  },
  {
    id: 'red-herring',
    name: 'Red Herring',
    category: 'Relevance',
    definition:
      'Introduces an unrelated issue to distract from the claim under discussion.',
  },
]

export const FALLACY_BY_ID = Object.fromEntries(
  FALLACIES.map((fallacy) => [fallacy.id, fallacy]),
)
