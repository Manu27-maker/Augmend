/**
 * Fallacy reference bank.
 * A structured list of common fallacies used by the analyzer and by the
 * "What we look for" panel in the UI. Each entry pairs a plain-language
 * definition with a recognisable reasoning pattern.
 */
export const FALLACY_BANK = [
  {
    id: 'false-cause',
    name: 'False Cause',
    category: 'Causal reasoning',
    definition:
      'Assumes that because one event happened before another — or alongside it — the first event caused the second.',
    pattern: '“A happened, then B happened, so A caused B.”',
  },
  {
    id: 'strawman',
    name: 'Strawman',
    category: 'Argument representation',
    definition:
      'Replaces someone’s actual position with a distorted or exaggerated version, then attacks the distortion.',
    pattern: '“They say X, but what they really want is the extreme version of X.”',
  },
  {
    id: 'slippery-slope',
    name: 'Slippery Slope',
    category: 'Causal reasoning',
    definition:
      'Claims that one small step will inevitably trigger a chain of increasingly extreme consequences, without justifying the chain.',
    pattern: '“If we allow A, then eventually catastrophic Z will happen.”',
  },
  {
    id: 'ad-hominem',
    name: 'Ad Hominem',
    category: 'Relevance',
    definition:
      'Attacks the person making the argument — their character, background, or motives — instead of the argument itself.',
    pattern: '“You can’t trust their point because of who they are.”',
  },
  {
    id: 'hasty-generalization',
    name: 'Hasty Generalization',
    category: 'Evidence',
    definition:
      'Draws a broad conclusion from a small or unrepresentative sample of evidence.',
    pattern: '“Two examples prove that this is always true.”',
  },
  {
    id: 'false-dilemma',
    name: 'False Dilemma',
    category: 'Framing',
    definition:
      'Presents a situation as having only two options when other possibilities exist.',
    pattern: '“Either you support this policy or you don’t care about the issue.”',
  },
  {
    id: 'appeal-to-authority',
    name: 'Appeal to Authority',
    category: 'Evidence',
    definition:
      'Treats a claim as true simply because an authority figure said it, even when they lack relevant expertise or evidence is missing.',
    pattern: '“A famous person said it, so it must be correct.”',
  },
  {
    id: 'circular-reasoning',
    name: 'Circular Reasoning',
    category: 'Structure',
    definition:
      'Uses the conclusion as its own evidence, so the argument goes in a circle instead of supporting the claim.',
    pattern: '“It’s true because it’s true.”',
  },
  {
    id: 'bandwagon',
    name: 'Bandwagon',
    category: 'Evidence',
    definition:
      'Argues that a claim must be true or a choice must be good because many people believe or do it.',
    pattern: '“Everyone is doing it, so it must be right.”',
  },
  {
    id: 'red-herring',
    name: 'Red Herring',
    category: 'Relevance',
    definition:
      'Introduces an unrelated issue to distract from the claim under discussion.',
    pattern: '“Before we talk about that, consider this other problem.”',
  },
]

export const FALLACY_BY_ID = Object.fromEntries(
  FALLACY_BANK.map((fallacy) => [fallacy.id, fallacy]),
)

/** A short essay seeded with four recognisable reasoning errors. */
export const SAMPLE_ARGUMENT = `Cities should adopt a citywide curfew for teenagers. Ever since the city introduced the new curfew, crime has gone down — so the curfew is clearly working.

My opponent wants to expand the youth program instead, but he has never run a business, so his proposal is worthless. Supporters of the policy claim we should consider the evidence, but what they really want is to let criminals walk free.

The stakes could not be higher. If we allow students to revise their essays once, soon they will demand unlimited rewrites, then grades will become meaningless, and eventually no one will learn anything at all.

A curfew keeps young people safe and gives parents peace of mind. The council should vote yes.`

/** Example of an argument with no flagged fallacies, for the empty state. */
export const CLEAN_SAMPLE_ARGUMENT = `Cities should adopt a limited curfew for teenagers under sixteen. A 2023 review of nine municipal programs found that nighttime incidents involving minors fell by 12 percent in the first year, though the authors noted that police staffing also increased during the same period.

That evidence is suggestive, not conclusive. A reasonable next step is a one-year pilot in two districts, with an independent evaluation that controls for policing levels. If the pilot shows a meaningful safety benefit, the council should expand it; if not, it should end the program.`
