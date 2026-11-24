import { Link } from 'react-router-dom'
import emblem from '../assets/chada-emblem.webp'
import diningRoom from '../assets/chada-dining-room.webp'
import sign from '../assets/chada-sign.webp'
import './Landing.css'

const FACTS = [
  { label: 'The deal', text: 'Unlimited Korean grill' },
  { label: 'Find us', text: 'Tagum City' },
  { label: 'At your table', text: 'Scan the QR for the menu and to send requests' },
]

export default function Landing() {
  return (
    <div className="landing">
      <main className="landing-main" aria-labelledby="landing-title">
        {/* Phone: the sign fills the first screen and the red sheet sits on it, button in thumb reach. */}
        <div className="landing-hero">
          <figure className="landing-photo">
            <img
              className="landing-sign"
              src={sign}
              width="1080"
              height="1440"
              fetchPriority="high"
              alt="The Samgyup Chada sign on a blue slatted wall: white brush lettering, a red and yellow Chada! and a flaming grill"
            />
          </figure>

          <div className="landing-copy">
            <div className="landing-brand landing-rise" style={{ '--i': 0 }}>
              <img className="landing-emblem" src={emblem} width="360" height="360" alt="" />
              <p className="landing-kicker ticket">Samgyup Chada</p>
            </div>
            <h1 id="landing-title" className="landing-title">
              <span className="landing-rise" style={{ '--i': 1 }}>Meat Me</span>
              <span className="landing-rise" style={{ '--i': 2 }}>at Chada</span>
            </h1>
            <div className="landing-actions landing-rise" style={{ '--i': 3 }}>
              <Link className="landing-btn" to="/reserve">Reserve a table</Link>
              <Link className="landing-link" to="/reserve">Have a reservation ID?</Link>
            </div>
          </div>
        </div>

        <figure className="landing-room landing-rise" style={{ '--i': 4 }}>
          <img
            src={diningRoom}
            width="1568"
            height="673"
            loading="lazy"
            alt="The Samgyup Chada dining room: black marble tables with tabletop grills, a neon-lit counter and a mural"
          />
        </figure>
      </main>

      <footer className="landing-facts">
        <dl>
          {FACTS.map((fact) => (
            <div key={fact.label}>
              <dt className="ticket">{fact.label}</dt>
              <dd>{fact.text}</dd>
            </div>
          ))}
        </dl>
      </footer>
    </div>
  )
}
