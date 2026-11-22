import { Link } from 'react-router-dom'
import './Home.css'

const STEPS = [
  {
    title: 'Reserve a table',
    text: 'Choose a date, time and party size. Keep your reservation ID to check or cancel later.',
  },
  {
    title: 'Scan the code at your table',
    text: 'Every table has its own QR code. It opens the menu in your browser, with nothing to install.',
  },
  {
    title: 'Send refill requests',
    text: 'Add dishes to your tray and send it. Follow the request until it reaches your table.',
  },
]

// Pork belly strips on the grill, seen from above. x/y place the strip's centre
// on the 640x640 plate, r tilts it, w is its length.
const STRIPS = [
  { x: 306, y: 128, r: -7, w: 236, state: 'cooked' },
  { x: 346, y: 212, r: 5, w: 262, state: 'cooked' },
  { x: 314, y: 298, r: -3, w: 244, state: 'raw' },
  { x: 348, y: 384, r: 8, w: 226, state: 'raw' },
  { x: 304, y: 470, r: -5, w: 254, state: 'raw' },
]

const STRIP_H = 58
const GRATE_LINES = Array.from({ length: 19 }, (_, k) => 320 + (k - 9) * 34)

function Strip({ x, y, r, w, state, index }) {
  const clipId = `chada-strip-${index}`
  const left = -w / 2
  const top = -STRIP_H / 2
  return (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <g className={`home-strip ${state}`} style={{ '--i': index }}>
        <clipPath id={clipId}>
          <rect x={left} y={top} width={w} height={STRIP_H} rx="13" />
        </clipPath>
        <g clipPath={`url(#${clipId})`}>
          <rect className="fat" x={left} y={top} width={w} height={STRIP_H} />
          <rect className="meat" x={left} y={top + 12} width={w} height="14" />
          <rect className="meat" x={left} y={top + 32} width={w} height="12" />
          {state === 'cooked' &&
            [0, 1, 2, 3].map((k) => (
              <rect
                key={k}
                className="mark"
                x={left + 44 + k * 48}
                y={top - 20}
                width="9"
                height={STRIP_H + 40}
                transform={`rotate(24 ${left + 48 + k * 48} 0)`}
              />
            ))}
        </g>
        <rect className="edge" x={left} y={top} width={w} height={STRIP_H} rx="13" />
      </g>
    </g>
  )
}

function Grill() {
  return (
    <svg className="home-grill" viewBox="0 0 640 640" aria-hidden="true" focusable="false">
      <clipPath id="chada-plate">
        <circle cx="320" cy="320" r="286" />
      </clipPath>
      <circle className="plate" cx="320" cy="320" r="300" />
      <g clipPath="url(#chada-plate)">
        <g transform="rotate(-22 320 320)">
          {GRATE_LINES.map((y) => (
            <line key={y} className="grate" x1="-40" x2="680" y1={y} y2={y} />
          ))}
        </g>
      </g>
      <circle className="rim" cx="320" cy="320" r="286" />
      {STRIPS.map((strip, index) => (
        <Strip key={index} index={index} {...strip} />
      ))}
    </svg>
  )
}

export default function Home() {
  return (
    <div className="home">
      <header className="home-top">
        <span className="home-brand">Samgyup Chada</span>
      </header>

      <main>
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero-copy">
            <h1 id="home-title" className="home-title">
              <span>Meat Me</span>
              <span>at Chada</span>
            </h1>
            <p className="home-lede">
              Reserve your table online. When you sit down, scan the QR code to see the menu and ask for refills.
            </p>
            <Link className="home-btn" to="/reserve">Reserve a table</Link>
          </div>
          <Grill />
        </section>

        <section className="home-steps" aria-labelledby="home-steps-title">
          <div className="home-wrap">
            <h2 id="home-steps-title" className="home-h2">How your visit works</h2>
            <ol className="home-step-list">
              {STEPS.map((step, index) => (
                <li key={step.title} className="home-step">
                  <span className="home-step-n" aria-hidden="true">{index + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="home-end">
        <div className="home-wrap">
          <div className="home-end-cta">
            <h2 className="home-h2">Pick a date and time.</h2>
            <Link className="home-btn" to="/reserve">Reserve a table</Link>
          </div>
          <div className="home-end-meta">
            <span>Samgyup Chada</span>
            <span>Tagum City</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
