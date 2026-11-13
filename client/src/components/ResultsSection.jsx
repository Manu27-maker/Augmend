import FallacyCard from './FallacyCard'
import HighlightedText from './HighlightedText'
import { CheckIcon, InfoIcon } from './Icons'

function LoadingState() {
  return (
    <div className="panel results-loading" role="status" aria-live="polite">
      <span className="spinner spinner--dark" aria-hidden="true" />
      <div>
        <p className="results-loading-title">Analyzing your reasoning...</p>
        <p className="results-loading-copy">
          Scanning each claim for causal leaps, misrepresented positions, and other common
          fallacies.
        </p>
      </div>
      <div className="skeleton-lines" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}

function CleanResult({ fallacies }) {
  return (
    <div className="panel clean-result">
      <span className="clean-icon" aria-hidden="true">
        <CheckIcon width={22} height={22} />
      </span>
      <div>
        <h3 className="clean-title">No clear fallacies detected</h3>
        <p className="clean-copy">
          The mock analyzer did not flag a reasoning pattern in this argument. A real pass would
          still check for unsupported claims, missing evidence, and unstated assumptions — absence
          of a named fallacy is not proof of a sound argument.
        </p>
        {fallacies.length === 0 && (
          <p className="clean-note">
            <InfoIcon width={15} height={15} />
            This is a clean sample, so there are no highlights to inspect.
          </p>
        )}
      </div>
    </div>
  )
}

export default function ResultsSection({
  result,
  text,
  isLoading,
  activeId,
  onActivate,
  onSelectMark,
  resultsRef,
}) {
  const showResults = !isLoading && Boolean(result)
  const fallacies = result
    ? [...result.fallacies].sort((a, b) => a.start - b.start)
    : []

  const counts = new Map()
  for (const fallacy of fallacies) {
    counts.set(fallacy.type, (counts.get(fallacy.type) ?? 0) + 1)
  }

  return (
    <section
      id="results"
      ref={resultsRef}
      className="results container"
      aria-label="Analysis results"
      aria-busy={isLoading}
    >
      {isLoading && <LoadingState />}

      {showResults && (
        <>
          <p className="sr-only" aria-live="polite">
            {`${fallacies.length} reasoning ${fallacies.length === 1 ? 'issue' : 'issues'} found. Results are ready.`}
          </p>

          <div className="results-summary">
            <div className="results-summary-copy">
              <p className="eyebrow eyebrow--muted">
                <span className="eyebrow-dot" aria-hidden="true" />
                Analysis complete
              </p>
              <h2 className="results-title">
                {fallacies.length === 0
                  ? 'No reasoning issues flagged'
                  : `${fallacies.length} reasoning ${fallacies.length === 1 ? 'issue' : 'issues'} found`}
              </h2>
              <p className="results-subtitle">
                {result.meta.wordCount.toLocaleString()} words reviewed
                <span aria-hidden="true"> · </span>
                {result.meta.sentenceCount} sentences scanned
                <span aria-hidden="true"> · </span>
                Mock analysis
              </p>
            </div>

            <div className="results-summary-side">
              {counts.size > 0 && (
                <ul className="summary-pills" aria-label="Fallacies by type">
                  {[...counts.entries()].map(([type, count]) => (
                    <li key={type} className="summary-pill">
                      {type}
                      {count > 1 && <span className="pill-count">×{count}</span>}
                    </li>
                  ))}
                </ul>
              )}
              <a className="text-link results-edit-link" href="#analyzer">
                Edit argument
              </a>
            </div>
          </div>

          {fallacies.length === 0 ? (
            <CleanResult fallacies={fallacies} />
          ) : (
            <>
              <div className="panel text-panel">
                <div className="text-panel-head">
                  <div>
                    <h3 className="section-heading">Highlighted argument</h3>
                    <p className="section-copy">
                      Flagged sentences are marked. Click a highlight to open its feedback.
                    </p>
                  </div>
                  <span className="flag-count">
                    {fallacies.length} {fallacies.length === 1 ? 'flag' : 'flags'}
                  </span>
                </div>

                <HighlightedText
                  text={text}
                  fallacies={fallacies}
                  activeId={activeId}
                  onSelect={onSelectMark}
                />

                <p className="text-panel-foot">
                  <InfoIcon width={15} height={15} />
                  Highlights come from a mocked analyzer for UI testing — not final detection
                  output.
                </p>
              </div>

              <section className="feedback" aria-labelledby="feedback-title">
                <div className="feedback-head">
                  <div>
                    <h3 className="section-heading" id="feedback-title">
                      Fallacy feedback
                    </h3>
                    <p className="section-copy">Each card names the flaw and offers a stronger claim.</p>
                  </div>
                  <span className="flag-count">{fallacies.length} to review</span>
                </div>

                <div className="feedback-list">
                  {fallacies.map((fallacy, index) => (
                    <FallacyCard
                      key={fallacy.id}
                      fallacy={fallacy}
                      index={index}
                      isActive={activeId === fallacy.id}
                      onActivate={onActivate}
                    />
                  ))}
                </div>
              </section>
            </>
          )}
        </>
      )}
    </section>
  )
}
