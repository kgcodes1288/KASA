import { useState } from 'react';
import './HowToUseSection.css';

const steps = [
  {
    number: 1,
    title: 'Create a Listing',
    description:
      'Start by creating a listing for your property. Give it a name, add the address, and paste your Airbnb iCal URL — found in Airbnb → Listing → Availability → Export calendar. This syncs your guest bookings automatically.',
    image: '/how-to/step1-new-listing.png',
    alt: 'New listing modal',
  },
  {
    number: 2,
    title: 'Add Rooms, Appliances & Spaces',
    description:
      'Inside your listing, add every room, appliance, or outdoor space you want to track. Choose the type (Room, Appliance, or Space) and give it a name. These become the building blocks for your cleaning and maintenance tasks.',
    image: '/how-to/step2-add-room.png',
    alt: 'Add room, appliance or space modal',
  },
  {
    number: 3,
    title: 'Set Up Cleaning Tasks',
    description:
      'For each room, add cleaning tasks that should be completed every time a guest checks out — things like "Vacuum floor" or "Replace sheets". These tasks automatically appear on every future cleaning job.',
    image: '/how-to/step3-cleaning-task.png',
    alt: 'Add cleaning task modal',
  },
  {
    number: 4,
    title: 'Schedule Maintenance Tasks',
    description:
      'For appliances and spaces, add recurring maintenance tasks like filter replacements or deep cleans. Set an interval in months and a last serviced date — CleanStay will auto-calculate the next due date.',
    image: '/how-to/step4-maintenance.png',
    alt: 'Appliance scheduled maintenance panel',
  },
  {
    number: 5,
    title: 'Jobs Appear Automatically',
    description:
      'Once your iCal is connected, a cleaning job is automatically created for every guest checkout. Each job shows the checkout date, all rooms, and their task completion status.',
    image: '/how-to/step5-jobs.png',
    alt: 'Jobs list with pending status',
  },
  {
    number: 6,
    title: 'Assign a Contractor',
    description:
      'When a job is ready, hit Assign and select a contractor from your list — or enter a one-off number. They\'ll receive an SMS with a link to view and check off every room for that checkout.',
    image: '/how-to/step6-assign.png',
    alt: 'Assign job to contractor modal',
  },
];

export default function HowToUseSection({ defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [lightbox, setLightbox] = useState(null);

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
            Get up and running in minutes. Follow these steps to set up your first property.
          </p>

          <div className="howto-steps">
            {steps.map((step) => (
              <div className="howto-step" key={step.number}>
                <div className="howto-step-number">{step.number}</div>
                <div className="howto-step-content">
                  <h3 className="howto-step-title">{step.title}</h3>
                  <p className="howto-step-desc">{step.description}</p>
                  <img
                    src={step.image}
                    alt={step.alt}
                    className="howto-step-img"
                    onClick={() => setLightbox(step)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {lightbox && (
        <div className="howto-lightbox" onClick={() => setLightbox(null)}>
          <div className="howto-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <button className="howto-lightbox-close" onClick={() => setLightbox(null)}>✕</button>
            <p className="howto-lightbox-title">{lightbox.title}</p>
            <img src={lightbox.image} alt={lightbox.alt} className="howto-lightbox-img" />
          </div>
        </div>
      )}
    </section>
  );
}