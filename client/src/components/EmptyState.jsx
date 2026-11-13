import { CheckIcon, ScanIcon, SparkIcon } from './Icons'

const STEPS = [
  {
    title: 'Paste your draft',
    copy: 'An essay, a debate case, or a paragraph you are unsure about.',
  },
  {
    title: 'Get a reasoning scan',
    copy: 'Flagged sentences are marked in place, with the exact claim quoted.',
  },
  {
    title: 'Strengthen the claim',
    copy: 'Read why the logic breaks, then start from the suggested rewrite.',
  },
]

export default function EmptyState({ onLoadSample }) {
  return (
    <section className="empty-state container" aria-labelledby="empty-title">
      <div className="panel empty-panel">
        <div className="empty-intro">
          <p className="eyebrow eyebrow--muted">
            <SparkIcon width={15} height={15} />
            Before you analyze
          </p>
          <h2 className="empty-title" id="empty-title">
            Start with the argument, not the prose.
          </h2>
          <p className="empty-copy">
            ArguMend does not score grammar. It looks for reasoning moves that make a claim feel
            stronger than it is, then shows you where the support stops.
          </p>
          <button type="button" className="button button--secondary" onClick={onLoadSample}>
            <ScanIcon />
            Load a sample argument
          </button>
        </div>

        <ol className="empty-steps">
          {STEPS.map((step, index) => (
            <li key={step.title} className="empty-step">
              <span className="step-number" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="step-title">{step.title}</h3>
                <p className="step-copy">{step.copy}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="empty-note">
        <span className="empty-note-icon" aria-hidden="true">
          <CheckIcon width={14} height={14} />
        </span>
        <p>
          <strong>Built for the revision stage.</strong> Use it as a first pass, then make the final
          call yourself — a named fallacy is a prompt to check your reasoning, not a verdict.
        </p>
      </div>
    </section>
  )
}
