export default function ComplianceTerms() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px', fontFamily: 'sans-serif', color: '#111' }}>

      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>SMS Consent & Compliance</h1>
        <p style={{ fontSize: 15, color: '#555' }}>
          This page documents how <strong>CleanStay</strong> collects SMS consent from recipients
          before sending any messages. It is intended for carrier and compliance verification purposes.
        </p>
        <p style={{ fontSize: 13, color: '#888', marginTop: 8 }}>
          App URL: <a href="https://getcleanstays.com" style={{ color: '#2563eb' }}>https://getcleanstays.com</a>
        </p>
      </div>

      {/* Divider */}
      <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', marginBottom: 40 }} />

      {/* Section 1 — Contractor Consent */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>1. Contractor SMS Consent</h2>
        <p style={{ fontSize: 14, color: '#555', marginBottom: 20, lineHeight: 1.6 }}>
          When a host adds a contractor to their CleanStay account, they must check the following
          consent checkbox before the contractor can be saved and receive any SMS messages.
          The <strong>Add Contractor</strong> button remains disabled until the box is checked.
        </p>

        {/* Live UI mockup */}
        <div style={{
          border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden',
          boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: 20,
        }}>
          <div style={{
            background: '#f9fafb', borderBottom: '1px solid #e5e7eb',
            padding: '10px 16px', fontSize: 13, fontWeight: 600, color: '#374151',
          }}>
            CleanStay App — Add Contractor Form (Contractors tab → Account page)
          </div>
          <div style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Name *</div>
                <div style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 10px', fontSize: 13, color: '#9ca3af' }}>Jane Smith</div>
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Phone *</div>
                <div style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 10px', fontSize: 13, color: '#9ca3af' }}>+1 555 000 0000</div>
              </div>
            </div>

            {/* Consent checkbox */}
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '12px 14px', borderRadius: 8,
              background: '#f0fdf4', border: '1px solid #86efac', marginBottom: 14,
            }}>
              <input type="checkbox" defaultChecked readOnly
                style={{ marginTop: 2, width: 15, height: 15, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: '#166534', lineHeight: 1.5 }}>
                I confirm this person has agreed to receive SMS job assignment notifications from CleanStay.
                Message and data rates may apply. Message frequency varies.
                Reply STOP to opt out. View our{' '}
                <a href="/privacy-terms" style={{ color: '#15803d', fontWeight: 600 }}>Terms &amp; Privacy Policy</a>.
              </span>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{
                padding: '7px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                background: '#2563eb', color: '#fff', display: 'inline-block',
              }}>
                Add Contractor
              </div>
              <div style={{
                padding: '7px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', display: 'inline-block',
              }}>
                Cancel
              </div>
            </div>
            <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>
              * The "Add Contractor" button is disabled until the consent checkbox is checked.
            </p>
          </div>
        </div>

        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 18px' }}>
          <p style={{ fontSize: 13, color: '#374151', marginBottom: 6, fontWeight: 600 }}>Consent language shown to host:</p>
          <p style={{ fontSize: 13, color: '#555', fontStyle: 'italic', lineHeight: 1.6 }}>
            "I confirm this person has agreed to receive SMS job assignment notifications from CleanStay.
            Message and data rates may apply. Message frequency varies. Reply STOP to opt out."
          </p>
        </div>
      </section>

      {/* Section 2 — Co-host Consent */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>2. Co-host Invite SMS Consent</h2>
        <p style={{ fontSize: 14, color: '#555', marginBottom: 20, lineHeight: 1.6 }}>
          When a host invites a co-host to manage a property, they must check the following consent
          checkbox before the invite SMS can be sent. The <strong>Send Invite</strong> button remains
          disabled until the box is checked.
        </p>

        {/* Live UI mockup */}
        <div style={{
          border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden',
          boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: 20,
        }}>
          <div style={{
            background: '#f9fafb', borderBottom: '1px solid #e5e7eb',
            padding: '10px 16px', fontSize: 13, fontWeight: 600, color: '#374151',
          }}>
            CleanStay App — Co-host Invite Form (Co-hosts tab → Account page)
          </div>
          <div style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 10px', fontSize: 13, color: '#9ca3af' }}>+1 555 000 0000</div>
              </div>
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 10px', fontSize: 13, color: '#9ca3af' }}>Select role…</div>
              </div>
              <div style={{
                padding: '7px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                background: '#2563eb', color: '#fff', display: 'inline-flex', alignItems: 'center',
              }}>
                Send Invite
              </div>
            </div>

            {/* Consent checkbox */}
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '12px 14px', borderRadius: 8,
              background: '#f0fdf4', border: '1px solid #86efac', marginBottom: 8,
            }}>
              <input type="checkbox" defaultChecked readOnly
                style={{ marginTop: 2, width: 15, height: 15, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: '#166534', lineHeight: 1.5 }}>
                I confirm this person has agreed to receive an SMS invite from CleanStay.
                Message and data rates may apply. Message frequency varies.
                Reply STOP to opt out. View our{' '}
                <a href="/privacy-terms" style={{ color: '#15803d', fontWeight: 600 }}>Terms &amp; Privacy Policy</a>.
              </span>
            </div>

            <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
              * The "Send Invite" button is disabled until the consent checkbox is checked.
            </p>
          </div>
        </div>

        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 18px' }}>
          <p style={{ fontSize: 13, color: '#374151', marginBottom: 6, fontWeight: 600 }}>Consent language shown to host:</p>
          <p style={{ fontSize: 13, color: '#555', fontStyle: 'italic', lineHeight: 1.6 }}>
            "I confirm this person has agreed to receive an SMS invite from CleanStay.
            Message and data rates may apply. Message frequency varies. Reply STOP to opt out."
          </p>
        </div>
      </section>

      {/* Section 3 — Required Disclosures */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>3. Required Disclosures</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { label: 'Brand identification',     value: 'CleanStay — included in every SMS message and in consent checkbox language' },
            { label: 'Message frequency',         value: 'Low volume, transactional only. Estimated under 10 messages per recipient per month.' },
            { label: 'Rates disclosure',          value: '"Message and data rates may apply" — included in consent checkbox language' },
            { label: 'Opt-out instructions',      value: '"Reply STOP to opt out" — included in consent checkbox language and in every SMS message' },
            { label: 'Terms & Privacy Policy',    value: 'https://getcleanstays.com/privacy-terms' },
            { label: 'Consent method',            value: 'Web form checkbox — host must check before SMS is sent' },
            { label: 'Recipient relationship',    value: 'All recipients have a pre-existing professional relationship with the host' },
          ].map(({ label, value }) => (
            <div key={label} style={{
              display: 'flex', gap: 12, padding: '12px 16px',
              background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb',
              flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', minWidth: 180, flexShrink: 0 }}>{label}</span>
              <span style={{ fontSize: 13, color: '#555', flex: 1 }}>{value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Section 4 — Sample Messages */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>4. Sample Messages</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '14px 18px' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#1e40af', marginBottom: 6 }}>Co-host Invite</p>
            <p style={{ fontSize: 13, color: '#1e3a8a', lineHeight: 1.6 }}>
              CleanStay: [Host Name] has invited you to co-host "[Property Name]" as Co-host.
              Tap to join: https://getcleanstays.com/login?redirect=/account. Reply STOP to opt out.
            </p>
          </div>
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '14px 18px' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#166534', marginBottom: 6 }}>Contractor Job Notification</p>
            <p style={{ fontSize: 13, color: '#14532d', lineHeight: 1.6 }}>
              CleanStay: Hi! A new cleaning job has been assigned to you. Property: [Listing Name].
              Checkout Date: [Date]. Log in to view details: https://getcleanstays.com. Reply STOP to opt out.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', marginBottom: 24 }} />
      <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>
        CleanStay · <a href="/privacy-terms" style={{ color: '#6b7280' }}>Terms &amp; Privacy Policy</a> · https://getcleanstays.com
      </p>
    </div>
  );
}