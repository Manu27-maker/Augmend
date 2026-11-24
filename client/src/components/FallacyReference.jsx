import { FALLACY_BANK } from '../data/fallacyBank'
import { ChevronDownIcon } from './Icons'

function FallacyGrid() {
  return (
    <ul className="fallacy-grid">
      {FALLACY_BANK.map((fallacy) => (
        <li key={fallacy.id} className="fallacy-item">
          <div className="fallacy-item-head">
            <h3 className="fallacy-name">{fallacy.name}</h3>
            <span className="fallacy-category">{fallacy.category}</span>
          </div>
          <p className="fallacy-definition">{fallacy.definition}</p>
          <p className="fallacy-pattern">{fallacy.pattern}</p>
        </li>
      ))}
    </ul>
  )
}

export default function FallacyReference({ collapsible = false, id = 'fallacy-library' }) {
  if (collapsible) {
    return (
      <section id={id} className="reference container" aria-labelledby={`${id}-title`}>
        <details className="panel reference-details">
          <summary className="reference-summary">
            <div>
              <h2 className="section-heading" id={`${id}-title`}>
                Fallacy library
              </h2>
              <p className="section-copy">
                The {FALLACY_BANK.length} reasoning patterns this demo checks for.
              </p>
            </div>
            <span className="reference-chevron" aria-hidden="true">
              <ChevronDownIcon />
            </span>
          </summary>
          <div className="reference-body">
            <FallacyGrid />
          </div>
        </details>
      </section>
    )
  }

  return (
    <section id={id} className="reference container" aria-labelledby={`${id}-title`}>
      <div className="reference-head">
        <p className="eyebrow eyebrow--muted">
          <span className="eyebrow-dot" aria-hidden="true" />
          Reference bank
        </p>
        <h2 className="reference-title" id={`${id}-title`}>
          What ArguMend looks for
        </h2>
        <p className="reference-copy">
          Ten common ways an argument can sound convincing while its reasoning slips. Each finding in
          your results maps back to one of these patterns.
        </p>
      </div>
      <FallacyGrid />
    </section>
  )
}
