import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './AuthLanding.css';

// Landing page wrapped around the sign-in / register card.
const PLAYLIST_ID = 'PLHO1unSFsfcc';
const FIRST_VIDEO_ID = 'I7ZngKjrvXk';

const PERSONAS = [
  {
    tone: 'teal', icon: '🏠', who: 'Hosts & owners',
    line: 'Stay in the loop without the busywork.',
    points: [
      'A dashboard that shows only what needs you: overdue maintenance, quotes to approve, tasks on your plate',
      'Approve quotes and settle invoices in a click',
      'Every turnover tracked from your booking calendar',
    ],
  },
  {
    tone: 'violet', icon: '🤝', who: 'Co-hosts & property managers',
    line: 'Run properties for owners, all in one place.',
    points: [
      'Upcoming turnovers at a glance, flagged when one still needs a cleaner',
      'Send quotes and invoices for the owner to approve',
      'Share tasks and maintenance with the owner, both ways',
    ],
  },
  {
    tone: 'amber', icon: '🧹', who: 'Cleaners & vendors',
    line: 'A simple link. No app, no account.',
    points: [
      'Get a text with the job and a room-by-room checklist',
      'Accept the job, tick off tasks, and you\'re done',
      'Hosts and co-hosts see progress live',
    ],
  },
];

const FEATURES = [
  { icon: '📅', title: 'Calendar sync', text: 'Paste your Airbnb, Vrbo or any iCal link. Bookings and checkouts appear automatically.' },
  { icon: '✨', title: 'Automatic cleaning jobs', text: 'Every checkout creates a room-by-room job, using the checklists you write.' },
  { icon: '📲', title: 'One-tap job links', text: 'Text cleaners and vendors a private link to their task list. Nothing to install.' },
  { icon: '🛠️', title: 'Maintenance reminders', text: 'Recurring reminders for filters, pools, lawns and more, so nothing is ever overdue.' },
  { icon: '💬', title: 'Quotes & invoices', text: 'Co-hosts send quotes, owners approve, and a draft invoice is ready when the work is done.' },
  { icon: '✅', title: 'Tasks & payments', text: 'Hand off to-dos and payment requests between owners and co-hosts, with due dates.' },
  { icon: '🔐', title: 'Co-host access', text: 'Invite co-hosts, or view-only teammates, with exactly the permissions they need.' },
  { icon: '🤖', title: 'Your AI assistant', text: 'Connect Claude, ChatGPT or Gemini and manage your properties just by chatting.' },
];

const STEPS = [
  { n: 1, title: 'Connect your calendar', text: 'Paste the iCal link from Airbnb, Vrbo or any other booking platform.' },
  { n: 2, title: 'Set up your rooms and team', text: 'Add rooms and checklists, then invite co-hosts and add your vendors.' },
  { n: 3, title: 'Let CleanStay keep everyone in sync', text: 'Jobs, reminders, quotes and invoices flow to the right person, automatically.' },
];

const AI_POINTS = [
  'Ask what needs attention across all your properties',
  'Add tasks and vendors, assign cleaners, send job links',
  'Send, approve or decline quotes, and send invoices',
  'It always asks you to confirm anything involving money, messages or deleting',
  'You choose the access: view only, or view and make changes. Disconnect any time',
];

export default function AuthLanding({ mode = 'login', children }) {
  const [playing, setPlaying] = useState(false);
  const [aiSeen, setAiSeen] = useState(false);
  const aiRef = useRef(null);

  // start the chat animation when the section scrolls into view
  useEffect(() => {
    const el = aiRef.current;
    if (!el || !('IntersectionObserver' in window)) { setAiSeen(true); return undefined; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setAiSeen(true); io.disconnect(); } }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="landing">
      {/* ── Top bar ── */}
      <header className="landing-nav">
        <Link to="/login" className="landing-brand">🧹 CleanStay<span>.</span></Link>
        <nav className="landing-links">
          <a href="#ai">AI assistant</a>
          <a href="#who">Who it's for</a>
          <a href="#features">Features</a>
          <a href="#watch">Watch</a>
          {mode === 'login'
            ? <Link to="/register" className="landing-cta">Create account</Link>
            : <Link to="/login" className="landing-cta">Sign in</Link>}
        </nav>
      </header>

      {/* ── Hero + auth card ── */}
      <section className="landing-hero">
        <div className="landing-blob landing-blob--a" />
        <div className="landing-blob landing-blob--b" />
        <div className="landing-hero-inner">
          <div className="landing-copy">
            <span className="landing-eyebrow">Short-term rental management platform</span>
            <h1>Short-term rentals, <em>run together.</em></h1>
            <p className="landing-lead">
              CleanStay enables seamless communication between hosts and their property managers
              or co-hosts, from booking to turnover to invoice.
            </p>
            <a href="#ai" className="landing-new">
              <b>NEW</b> Run it all by chatting with your AI assistant: Claude, ChatGPT or Gemini <span aria-hidden="true">→</span>
            </a>
            <div className="landing-platforms">
              <span>Works with</span>
              <b className="pill pill--rose">Airbnb</b>
              <b className="pill pill--blue">Vrbo</b>
              <b className="pill pill--teal">Any iCal link</b>
            </div>
            <ul className="landing-checks">
              <li><i>✓</i> A portal tailored to your role: owner, co-host or cleaner</li>
              <li><i>✓</i> Cleaning, maintenance, tasks, quotes and invoices in one place</li>
              <li><i>✓</i> Set up in minutes, with short video walkthroughs to guide you</li>
            </ul>
          </div>
          <div className="landing-card-wrap">{children}</div>
        </div>
      </section>

      {/* ── AI assistant ── */}
      <section id="ai" className="landing-ai" ref={aiRef}>
        <div className="landing-ai-glow landing-ai-glow--a" /><div className="landing-ai-glow landing-ai-glow--b" />
        <div className="landing-ai-inner">
          <div className="landing-ai-copy">
            <span className="landing-ai-badge">✨ New</span>
            <h2>Run your properties by just chatting</h2>
            <p className="landing-ai-lead">
              Connect CleanStay to your AI assistant and get things done in plain English, from your phone or your desk.
              No menus to learn, no screens to hunt through.
            </p>
            <div className="landing-ai-assistants">
              <b>Claude</b><b>ChatGPT</b><b>Gemini</b><span>and any assistant that supports custom connectors</span>
            </div>
            <ul className="landing-ai-points">
              {AI_POINTS.map((t) => <li key={t}><i>✓</i>{t}</li>)}
            </ul>
            <p className="landing-ai-foot">Connect in about a minute, from <b>Account → Chat assistants</b> after you sign up.</p>
          </div>

          <div className={`chat-mock ${aiSeen ? 'chat-mock--in' : ''}`} aria-label="Example conversation">
            <div className="chat-bar"><span>🧹</span> Your AI assistant <small>connected to CleanStay</small></div>
            <div className="chat-body">
              <div className="chat-b chat-u" style={{ '--d': '0.2s' }}>What needs my attention at Lakeview Cabin this week?</div>
              <div className="chat-b chat-a" style={{ '--d': '1.2s' }}>
                Here's what needs you at Lakeview Cabin:
                <ul>
                  <li style={{ '--d': '1.9s' }}>Pool cleaning is <b>6 days overdue</b></li>
                  <li style={{ '--d': '2.6s' }}>The AC filter is due in <b>5 days</b></li>
                  <li style={{ '--d': '3.3s' }}>The <b>Oct 19</b> checkout still needs a cleaner</li>
                  <li style={{ '--d': '4.0s' }}><b>2 quotes</b> are waiting for you, <b>$1,730</b> in total</li>
                </ul>
              </div>
              <div className="chat-b chat-u" style={{ '--d': '5.2s' }}>Text Maria the cleaning link for the Oct 19 checkout</div>
              <div className="chat-b chat-a" style={{ '--d': '6.3s' }}>
                I'm ready to text <b>Maria's Cleaning</b> the job link for Oct 19. Shall I send it?
                <div className="chat-btns"><span className="chat-btn chat-btn--p">Send it</span><span className="chat-btn">Not yet</span></div>
              </div>
            </div>
            <div className="chat-note">Illustrative example</div>
          </div>
        </div>
      </section>

      {/* ── Personas ── */}
      <section id="who" className="landing-section">
        <div className="landing-head">
          <span className="landing-kicker">Built around your role</span>
          <h2>One platform, a portal for everyone involved</h2>
          <p>Everyone sees what matters to them, and nothing that doesn't.</p>
        </div>
        <div className="landing-personas">
          {PERSONAS.map((p) => (
            <article key={p.who} className={`persona persona--${p.tone}`}>
              <div className="persona-icon">{p.icon}</div>
              <h3>{p.who}</h3>
              <p className="persona-line">{p.line}</p>
              <ul>{p.points.map((t) => <li key={t}>{t}</li>)}</ul>
            </article>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="landing-section landing-section--tint">
        <div className="landing-head">
          <span className="landing-kicker">Everything in one place</span>
          <h2>From the first booking to the final invoice</h2>
        </div>
        <div className="landing-features">
          {FEATURES.map((f, i) => (
            <article key={f.title} className={`feature feature--${i % 4}`}>
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="landing-section">
        <div className="landing-head">
          <span className="landing-kicker">How it works</span>
          <h2>Up and running in three steps</h2>
        </div>
        <div className="landing-steps">
          {STEPS.map((s) => (
            <div key={s.n} className="step">
              <div className="step-n">{s.n}</div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Video ── */}
      <section id="watch" className="landing-section landing-section--navy">
        <div className="landing-head landing-head--light">
          <span className="landing-kicker">See it in action</span>
          <h2>A two-minute tour</h2>
          <p>Short videos walk you through every step of CleanStay.</p>
        </div>
        <div className="landing-video">
          {playing ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${FIRST_VIDEO_ID}?list=${PLAYLIST_ID}&autoplay=1&rel=0`}
              title="CleanStay tour"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />
          ) : (
            <button type="button" className="landing-poster" onClick={() => setPlaying(true)} aria-label="Play the CleanStay tour">
              <img src={`https://i.ytimg.com/vi/${FIRST_VIDEO_ID}/hqdefault.jpg`} alt="" loading="lazy" />
              <span className="landing-play" aria-hidden="true">▶</span>
            </button>
          )}
        </div>
      </section>

      {/* ── Closing call to action ── */}
      <section className="landing-final">
        <h2>Ready to make turnovers effortless?</h2>
        <p>Bring your hosts, co-hosts and cleaners onto the same page.</p>
        <div className="landing-final-actions">
          <Link to="/register" className="landing-big landing-big--solid">Create your account</Link>
          <Link to="/login" className="landing-big landing-big--ghost">Sign in</Link>
        </div>
      </section>

      <footer className="landing-footer">
        <span>© {new Date().getFullYear()} CleanStay</span>
        <span><Link to="/privacy-terms">Privacy &amp; Terms</Link></span>
      </footer>
    </div>
  );
}
