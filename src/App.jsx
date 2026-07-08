import { useEffect, useState } from 'react'
import GridWright from './apps/GridWright.jsx'
import SketchMentor from './apps/SketchMentor.jsx'

const ROUTES = {
  home: '/',
  gridwright: '/gridwright',
  sketchmentor: '/sketchmentor',
}

function normalizePath(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/'

  if (path === ROUTES.home || path === ROUTES.gridwright) {
    return ROUTES.gridwright
  }

  if (path === ROUTES.sketchmentor) {
    return path
  }

  return ROUTES.gridwright
}

function navigate(path) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new Event('popstate'))
}

function AppChooser() {
  return (
    <main className="app-shell hub-shell">
      <section className="hub-hero" aria-labelledby="hub-title">
        <div className="brand-lockup">
          <p className="section-kicker">Studio tools</p>
          <h1 id="hub-title">Choose your workspace</h1>
          <p>Pick a focused utility for planning, studying, and improving artwork.</p>
        </div>

        <div className="app-card-grid" aria-label="Available apps">
          <button type="button" className="app-card" onClick={() => navigate(ROUTES.gridwright)}>
            <span>GridWright</span>
            <strong>Image gridline processor</strong>
            <small>Build a printable grid over an image or blank canvas, then export a PNG.</small>
          </button>

          <button type="button" className="app-card" onClick={() => navigate(ROUTES.sketchmentor)}>
            <span>SketchMentor</span>
            <strong>Constructive sketch feedback</strong>
            <small>Upload a sketch, get streamed critique through Mesh, ask follow-ups, and export a PDF.</small>
          </button>
        </div>
      </section>
    </main>
  )
}

export default function App() {
  const [route, setRoute] = useState(() => normalizePath(window.location.pathname))

  useEffect(() => {
    function handlePopState() {
      setRoute(normalizePath(window.location.pathname))
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  if (route === ROUTES.gridwright) {
    return <GridWright />
  }

  if (route === ROUTES.sketchmentor) {
    return <SketchMentor />
  }

  return <GridWright />
}
