import { Fragment, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { withViewTransition } from '../lib/viewTransition.js'
import diningRoom from '../assets/chada-dining-room.webp'
import sign from '../assets/chada-sign.webp'
import './Landing.css'

const FACTS = [
  { label: 'Schedule', text: 'Open Mon-Sun from 11AM to 11PM.' },
  { label: 'Find us', text: 'Rotary Park, Tagum City. Beside NOVO.' },
  { label: 'At your table', text: 'Scan the QR for the menu and to send requests' },
]

// The title is cut into lines, words and letters, so each letter can drop in on its own.
// `order` is the letter's place in the whole title; motion.css turns it into a delay.
let letterCount = 0
const TITLE = ['Meat Me', 'at Chada'].map((line) => ({
  line,
  words: line.split(' ').map((word) => ({
    word,
    letters: Array.from(word).map((letter) => ({ letter, order: letterCount++ })),
  })),
}))

export default function Landing() {
  const rootRef = useRef(null)
  const navigate = useNavigate()

  // The pointer nudges the sign and the title a little (see motion.css). Only on screens with a
  // real pointer, and not for people who asked for less motion.
  useEffect(() => {
    const root = rootRef.current
    const wantsMotion = window.matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)')
    if (!root || !wantsMotion.matches) return undefined

    let frame = 0
    const lean = (x, y) => {
      root.style.setProperty('--px', x.toFixed(3))
      root.style.setProperty('--py', y.toFixed(3))
    }
    const onMove = (event) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => lean(event.clientX / window.innerWidth - 0.5, event.clientY / window.innerHeight - 0.5))
    }
    const onLeave = () => {
      cancelAnimationFrame(frame)
      lean(0, 0)
    }
    root.addEventListener('pointermove', onMove)
    root.addEventListener('pointerleave', onLeave)
    return () => {
      cancelAnimationFrame(frame)
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return (
    <main className="landing" aria-labelledby="landing-title" ref={rootRef}>
      {/* One order ticket: the sign, the title and the action, with the facts on the tear-off stub. */}
      <div className="landing-ticket">
        <figure className="landing-sign">
          <img
            src={sign}
            width="1080"
            height="1440"
            fetchPriority="high"
            alt="The Samgyup Chada sign on a blue slatted wall: white brush lettering, a red and yellow Chada! and a flaming grill"
          />
        </figure>

        <div className="landing-main">
          <h1 id="landing-title" className="landing-title" aria-label="Meat Me at Chada">
            {TITLE.map(({ line, words }) => (
              <span className="line" aria-hidden="true" key={line}>
                {words.map(({ word, letters }, index) => (
                  <Fragment key={word}>
                    {index > 0 && ' '}
                    <span className="word">
                      {letters.map(({ letter, order }) => (
                        <span className="ch" style={{ '--c': order }} key={order}>{letter}</span>
                      ))}
                    </span>
                  </Fragment>
                ))}
              </span>
            ))}
          </h1>
          <div className="landing-actions">
            <Link className="landing-btn" to="/reserve" onClick={withViewTransition(navigate, '/reserve')}>Reserve a table</Link>
            <Link className="landing-link" to="/reserve" onClick={withViewTransition(navigate, '/reserve')}>Have a reservation ID?</Link>
          </div>
        </div>

        <dl className="landing-stub">
          {FACTS.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.text}</dd>
            </div>
          ))}
        </dl>
      </div>

      <figure className="landing-room">
        <img
          src={diningRoom}
          width="1568"
          height="673"
          loading="lazy"
          alt="The Samgyup Chada dining room: black marble tables with tabletop grills, a neon-lit counter and a mural"
        />
      </figure>
    </main>
  )
}
