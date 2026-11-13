import { ArrowRightIcon, CheckIcon, SparkIcon } from './Icons'

const PROMISES = [
  'Pinpoints the exact sentence where reasoning breaks',
  'Names the fallacy and explains the gap',
  'Offers a stronger version of the same point',
]

export default function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="container hero-inner">
        <div className="hero-copy">
          <p className="eyebrow">
            <SparkIcon width={16} height={16} />
            Reasoning review, sentence by sentence
          </p>
          <h1 id="hero-title" className="hero-title">
            Catch the <span className="hero-emphasis">fallacy</span>,
            <br />
            not just the typo.
          </h1>
          <p className="hero-lede">
            Grammar tools check how your essay reads. ArguMend checks whether it holds up — flagging
            false causes, strawmen, slippery slopes, and other reasoning errors before a teacher,
            judge, or opponent does.
          </p>
          <div className="hero-actions">
            <a className="button button--primary" href="#analyzer">
              Analyze an argument
              <ArrowRightIcon />
            </a>
            <a className="text-link" href="#fallacy-library">
              See the fallacy library
            </a>
          </div>
        </div>

        <aside className="hero-panel" aria-label="What ArguMend gives you">
          <p className="hero-panel-title">A first pass for flawed reasoning</p>
          <ul className="hero-list">
            {PROMISES.map((promise) => (
              <li key={promise}>
                <span className="hero-list-icon">
                  <CheckIcon width={14} height={14} />
                </span>
                {promise}
              </li>
            ))}
          </ul>
          <div className="hero-panel-footer">
            <span className="demo-dot" aria-hidden="true" />
            Demo mode — analysis is mocked in the browser
          </div>
        </aside>
      </div>
    </section>
  )
}
