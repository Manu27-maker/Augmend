import { useEffect, useRef, useState } from 'react'
import EmptyState from './components/EmptyState'
import FallacyReference from './components/FallacyReference'
import Footer from './components/Footer'
import Header from './components/Header'
import Hero from './components/Hero'
import InputPanel from './components/InputPanel'
import ResultsSection from './components/ResultsSection'
import { analyzeArgument } from './services/analyzeService'
import { CLEAN_SAMPLE_ARGUMENT, SAMPLE_ARGUMENT } from './data/fallacyBank'

const MIN_LENGTH = 40

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

export default function App() {
  const [text, setText] = useState('')
  const [result, setResult] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeId, setActiveId] = useState(null)
  const resultsRef = useRef(null)

  // Bring the results into view once an analysis finishes.
  useEffect(() => {
    if (!result || !resultsRef.current) return
    resultsRef.current.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    })
  }, [result])

  function resetOutput() {
    setResult(null)
    setActiveId(null)
    setError('')
  }

  function handleTextChange(nextText) {
    setText(nextText)
    if (result) resetOutput()
    else if (error) setError('')
  }

  async function handleAnalyze() {
    const trimmed = text.trim()

    if (!trimmed) {
      setError('Paste an essay or a few sentences first, then run the analysis.')
      return
    }

    if (trimmed.length < MIN_LENGTH) {
      setError('Add a little more text — at least a couple of sentences — for a useful analysis.')
      return
    }

    setError('')
    setIsLoading(true)
    setResult(null)
    setActiveId(null)

    try {
      const response = await analyzeArgument(text)
      setResult(response)
    } catch (error) {
      setError(error?.message || 'Something went wrong while analyzing the text. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  function handleLoadSample() {
    if (isLoading) return
    setText(SAMPLE_ARGUMENT)
    resetOutput()
  }

  function handleLoadClean() {
    if (isLoading) return
    setText(CLEAN_SAMPLE_ARGUMENT)
    resetOutput()
  }

  function handleClear() {
    if (isLoading) return
    setText('')
    resetOutput()
  }

  function handleSelectMark(fallacyId) {
    setActiveId(fallacyId)

    const card = document.getElementById(`finding-${fallacyId}`)
    if (!card) return

    requestAnimationFrame(() => {
      card.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'center',
      })
    })
  }

  return (
    <div className="app" id="top">
      <Header />

      <main>
        <Hero />

        <div className="container analyzer-shell">
          <InputPanel
            value={text}
            onChange={handleTextChange}
            onAnalyze={handleAnalyze}
            onLoadSample={handleLoadSample}
            onLoadClean={handleLoadClean}
            onClear={handleClear}
            isLoading={isLoading}
            error={error}
          />
        </div>

        <ResultsSection
          result={result}
          text={text}
          isLoading={isLoading}
          activeId={activeId}
          onActivate={setActiveId}
          onSelectMark={handleSelectMark}
          resultsRef={resultsRef}
        />

        {!isLoading && !result && <EmptyState onLoadSample={handleLoadSample} />}

        {!isLoading && <FallacyReference collapsible={Boolean(result)} />}
      </main>

      <Footer />
    </div>
  )
}
