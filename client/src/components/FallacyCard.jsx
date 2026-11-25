import { useEffect, useRef, useState } from 'react'
import { AlertIcon, CheckIcon, CopyIcon, PenIcon } from './Icons'

const CONFIDENCE_RANK = { low: 1, medium: 2, high: 3 }

export default function FallacyCard({ fallacy, index, isActive, onActivate }) {
  const [copyState, setCopyState] = useState('idle')
  const timeoutRef = useRef(null)

  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  const confidence = fallacy.verified ? fallacy.confidence || 'medium' : null
  const confidenceRank = CONFIDENCE_RANK[confidence] ?? 0

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(fallacy.suggested_rewrite)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }

    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setCopyState('idle'), 2200)
  }

  const badgeTitle = fallacy.verified
    ? confidence === 'high'
      ? 'Second-model review kept this finding: no supporting text was found. This is a review status, not a probability.'
      : confidence === 'low'
        ? 'Second-model review kept this finding, but the label itself may not apply. This is a review status, not a probability.'
        : 'Second-model review kept this finding: partial or ambiguous support exists. This is a review status, not a probability.'
    : 'Detector finding, not reviewed by the second model'

  return (
    <article
      id={`finding-${fallacy.id}`}
      className={`fallacy-card${isActive ? ' is-active' : ''}`}
      data-category={fallacy.category}
      onMouseEnter={() => onActivate(fallacy.id)}
    >
      <header className="card-head">
        <span className="card-number" aria-hidden="true">
          {index + 1}
        </span>
        <div className="card-heading">
          <h3 className="card-title">{fallacy.type}</h3>
          <p className="card-category">{fallacy.category}</p>
        </div>
        <span
          className={`card-badge${fallacy.verified ? ' card-badge--verified' : ''}`}
          title={badgeTitle}
        >
          {fallacy.verified && (
            <span className="conf-meter" aria-hidden="true">
              {[1, 2, 3].map((step) => (
                <span
                  key={step}
                  className={`conf-meter__seg${confidenceRank >= step ? ' is-on' : ''}`}
                />
              ))}
            </span>
          )}
          {fallacy.verified ? `Verified · ${confidence}` : 'Flagged'}
        </span>
      </header>

      <blockquote className="card-quote">
        <span className="sr-only">Flagged sentence: </span>
        {fallacy.sentence}
      </blockquote>

      <section className="card-block" aria-label="Explanation">
        <h4 className="card-block-title">
          <AlertIcon width={17} height={17} />
          Why it weakens the argument
        </h4>
        <p>{fallacy.explanation}</p>
      </section>

      <section className="card-block card-block--rewrite" aria-label="Suggested rewrite">
        <div className="card-block-head">
          <h4 className="card-block-title">
            <PenIcon width={17} height={17} />
            Suggested rewrite
          </h4>
          <button
            type="button"
            className="copy-button"
            onClick={handleCopy}
            aria-label={`Copy suggested rewrite for ${fallacy.type}`}
          >
            {copyState === 'copied' ? <CheckIcon width={15} height={15} /> : <CopyIcon width={15} height={15} />}
            {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy'}
          </button>
        </div>
        <p className="rewrite-text">{fallacy.suggested_rewrite}</p>
        <span className="sr-only" aria-live="polite">
          {copyState === 'copied' ? 'Rewrite copied to clipboard.' : ''}
          {copyState === 'error' ? 'Copy failed. Select the text manually.' : ''}
        </span>
      </section>
    </article>
  )
}
