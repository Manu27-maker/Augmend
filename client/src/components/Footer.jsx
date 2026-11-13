import { LogoMark } from './Icons'

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <span className="footer-mark">
            <LogoMark size={28} />
          </span>
          <div>
            <p className="footer-name">ArguMend</p>
            <p className="footer-tagline">Logic feedback as immediate as a spell check.</p>
          </div>
        </div>

        <div className="footer-meta">
          <p>React + Vite demo · mocked analysis</p>
          <p className="footer-fine">
            Detects patterns, not verdicts. Always review the suggested rewrite in context.
          </p>
        </div>
      </div>
    </footer>
  )
}
