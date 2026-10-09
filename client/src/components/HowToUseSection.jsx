import { useState } from 'react';
import './HowToUseSection.css';

// The first video of the "CleanStay Tutorials" playlist is embedded directly. Because the embed carries the
// playlist id, YouTube automatically plays the next video in the series when this one ends.
const PLAYLIST_ID = 'PLHO1unSFsfcc';
const FIRST_VIDEO_ID = 'I7ZngKjrvXk';
const PLAYLIST_URL = `https://www.youtube.com/playlist?list=${PLAYLIST_ID}`;
const EMBED_URL = `https://www.youtube-nocookie.com/embed/${FIRST_VIDEO_ID}?list=${PLAYLIST_ID}&rel=0`;

export default function HowToUseSection({ defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="howto-section">
      <button
        className={`howto-toggle ${open ? 'howto-toggle--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="howto-toggle-label">
          <span className="howto-icon">📖</span> How to Use CleanStay
        </span>
        <span className="howto-chevron">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="howto-body">
          <p className="howto-intro">
            Short videos, about a minute or two each, that walk you through CleanStay step by step.
            The next video plays automatically, or use the playlist button in the player to jump to what you need.
          </p>

          <div className="howto-player">
            <iframe
              src={EMBED_URL}
              title="CleanStay tutorials: welcome tour"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />
          </div>

          <p className="howto-footer">
            <a href={PLAYLIST_URL} target="_blank" rel="noreferrer">Open the full series on YouTube ↗</a>
          </p>
        </div>
      )}
    </section>
  );
}
