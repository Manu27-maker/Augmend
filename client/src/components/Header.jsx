import { LogoMark } from './Icons'

export default function Header() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <a className="brand" href="#top" aria-label="ArguMend — back to top">
          <span className="brand-mark">
            <LogoMark />
          </span>
          <span className="brand-copy">
            <span className="brand-name">ArguMend</span>
            <span className="brand-tagline">Catch the fallacy, not just the typo</span>
          </span>
        </a>

        <nav className="site-nav" aria-label="Primary">
          <a className="nav-link" href="#analyzer">
            Analyzer
          </a>
          <a className="nav-link" href="#fallacy-library">
            Fallacy library
          </a>
          <a className="nav-cta" href="#analyzer">
            Check my argument
          </a>
        </nav>
      </div>
    </header>
  )
}
