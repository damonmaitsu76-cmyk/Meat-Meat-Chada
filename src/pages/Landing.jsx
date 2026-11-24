import { Link } from 'react-router-dom'
import diningRoom from '../assets/chada-dining-room.webp'
import sign from '../assets/chada-sign.webp'
import './Landing.css'

const FACTS = [
  { label: 'Schedule', text: 'Open Mon-Sun from 11AM to 11PM.' },
  { label: 'Find us', text: 'Rotary Park, Tagum City. Beside NOVO.' },
  { label: 'At your table', text: 'Scan the QR for the menu and to send requests' },
]

export default function Landing() {
  return (
    <main className="landing" aria-labelledby="landing-title">
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
          <h1 id="landing-title" className="landing-title">
            <span>Meat Me</span>
            <span>at Chada</span>
          </h1>
          <div className="landing-actions">
            <Link className="landing-btn" to="/reserve">Reserve a table</Link>
            <Link className="landing-link" to="/reserve">Have a reservation ID?</Link>
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
