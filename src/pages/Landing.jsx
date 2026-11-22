import { Link } from 'react-router-dom'
import emblem from '../assets/chada-emblem.webp'
import diningRoom from '../assets/chada-dining-room.webp'
import './Landing.css'

const FACTS = [
  { label: 'The deal', text: 'Unlimited Korean grill' },
  { label: 'Find us', text: 'Tagum City' },
  { label: 'At your table', text: 'Scan the QR for the menu and refills' },
]

export default function Landing() {
  return (
    <div className="landing">


      <main className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-copy">
          <p className="landing-kicker ticket landing-brand landing-rise" style={{ '--i': 0 }}>SAMGYUP CHADA</p>
          <h1 id="landing-title" className="landing-title">
            <span className="landing-rise" style={{ '--i': 1 }}>Meat Me</span>
            <span className="landing-rise" style={{ '--i': 2 }}>at Chada</span>
          </h1>
          <div className="landing-actions landing-rise" style={{ '--i': 3 }}>
            <Link className="landing-btn" to="/reserve">Reserve a table</Link>
            <Link className="landing-link" to="/reserve">Have a reservation ID?</Link>
          </div>
        </div>

        <figure className="landing-photo landing-rise" style={{ '--i': 2 }}>
          <img
            className="landing-room"
            src={diningRoom}
            width="1568"
            height="673"
            fetchPriority="high"
            alt="The Samgyup Chada dining room: black marble tables with tabletop grills, a neon-lit counter and a mural"
          />
          <img className="landing-emblem" src={emblem} width="360" height="360" alt="Samgyup Chada emblem" />
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
