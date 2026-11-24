import { useId } from 'react'
import { CloseIcon, ScanIcon } from './Icons'

const MAX_LENGTH = 12000

export default function InputPanel({
  value,
  onChange,
  onAnalyze,
  onLoadSample,
  onLoadClean,
  onClear,
  isLoading,
  error,
}) {
  const textareaId = useId()
  const hintId = useId()
  const errorId = useId()

  const trimmed = value.trim()
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0

  function handleKeyDown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      onAnalyze()
    }
  }

  return (
    <section className="panel input-panel" id="analyzer" aria-labelledby="input-title">
      <div className="panel-header">
        <div>
          <h2 id="input-title" className="panel-title">
            Your argument
          </h2>
          <p className="panel-subtitle">Paste an essay, debate case, or a single paragraph.</p>
        </div>
        <div className="input-stats" aria-live="polite">
          <span>{wordCount.toLocaleString()} words</span>
          <span aria-hidden="true">·</span>
          <span>
            {value.length.toLocaleString()}/{MAX_LENGTH.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="input-toolbar" role="group" aria-label="Sample arguments">
        <span className="toolbar-label">Need something to test?</span>
        <div className="toolbar-actions">
          <button type="button" className="chip-button" onClick={onLoadSample} disabled={isLoading}>
            Load sample with fallacies
          </button>
          <button type="button" className="chip-button" onClick={onLoadClean} disabled={isLoading}>
            Try a clean argument
          </button>
          {value.length > 0 && (
            <button
              type="button"
              className="chip-button chip-button--quiet"
              onClick={onClear}
              disabled={isLoading}
            >
              <CloseIcon width={14} height={14} />
              Clear
            </button>
          )}
        </div>
      </div>

      <div className={`textarea-wrap${isLoading ? ' is-loading' : ''}`}>
        <label className="sr-only" htmlFor={textareaId}>
          Argument text
        </label>
        <textarea
          id={textareaId}
          className="argument-textarea"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Paste your essay or argument here. For example: “Ever since the new policy was introduced, crime has gone down — so the policy is clearly working.”"
          rows={9}
          maxLength={MAX_LENGTH}
          readOnly={isLoading}
          aria-describedby={`${hintId}${error ? ` ${errorId}` : ''}`}
          aria-invalid={Boolean(error)}
          spellCheck="true"
        />
        {isLoading && (
          <div className="textarea-loading" aria-hidden="true">
            <span className="spinner spinner--dark" />
          </div>
        )}
      </div>

      <div className="input-footer">
        <p className="input-hint" id={hintId}>
          <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd> to analyze
          <span className="hint-separator" aria-hidden="true">
            ·
          </span>
          Your text is sent to Groq for analysis.
        </p>

        <button
          type="button"
          className="button button--primary analyze-button"
          onClick={onAnalyze}
          disabled={isLoading}
          aria-busy={isLoading}
        >
          {isLoading ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Analyzing...
            </>
          ) : (
            <>
              <ScanIcon />
              Analyze Argument
            </>
          )}
        </button>
      </div>

      {error && (
        <p className="input-error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
