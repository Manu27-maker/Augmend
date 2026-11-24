/**
 * Renders the original argument with the flagged spans wrapped in <mark>.
 * Each mark is a keyboard-focusable control that cross-links to its feedback
 * card. Text outside the flags is rendered verbatim.
 */
export default function HighlightedText({ text, fallacies, activeId, onSelect }) {
  const segments = []
  let cursor = 0
  let number = 0

  for (const fallacy of fallacies) {
    const start = Math.max(0, fallacy.start)
    const end = Math.min(text.length, fallacy.end)

    if (start < cursor || end <= start) continue

    if (start > cursor) {
      segments.push({ kind: 'text', content: text.slice(cursor, start), key: `text-${cursor}` })
    }

    number += 1
    segments.push({
      kind: 'mark',
      content: text.slice(start, end),
      key: `mark-${fallacy.id}-${start}`,
      fallacy,
      number,
    })
    cursor = end
  }

  if (cursor < text.length) {
    segments.push({ kind: 'text', content: text.slice(cursor), key: `text-${cursor}` })
  }

  function handleKeyDown(event, fallacyId) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(fallacyId)
    }
  }

  return (
    <div className="highlighted-text">
      {segments.map((segment) =>
        segment.kind === 'text' ? (
          <span key={segment.key}>{segment.content}</span>
        ) : (
          <mark
            key={segment.key}
            className={`fallacy-mark${activeId === segment.fallacy.id ? ' is-active' : ''}`}
            data-category={segment.fallacy.category}
            tabIndex={0}
            role="button"
            aria-label={`Flagged ${segment.fallacy.type} — show feedback`}
            aria-pressed={activeId === segment.fallacy.id}
            onClick={() => onSelect(segment.fallacy.id)}
            onKeyDown={(event) => handleKeyDown(event, segment.fallacy.id)}
          >
            {segment.content}
            <span className="mark-index" aria-hidden="true">
              {segment.number}
            </span>
          </mark>
        ),
      )}
    </div>
  )
}
