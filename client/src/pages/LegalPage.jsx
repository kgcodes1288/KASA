import './LegalPage.css';

export default function LegalPage() {
  const effectiveDate = 'March 20, 2026';

  return (
    <div className="legal-container">
      <h1 className="legal-title">Legal</h1>

      {/* ─── PRIVACY POLICY ─── */}
      <section className="legal-section" id="privacy-policy">
        <h2>Privacy Policy</h2>
        <p className="legal-effective">Effective Date: {effectiveDate}</p>

        <h3>1. Overview</h3>
        <p>
          CleanStay ("we", "us", or "our") is a property management application that helps
          Airbnb hosts coordinate cleaning and property access. This Privacy Policy explains
          how we collect, use, and protect your personal information.
        </p>

        <h3>2. Information We Collect</h3>
        <ul>
          <li>Name and email address (account registration)</li>
          <li>Phone number (for SMS notifications and co-host invitations)</li>
          <li>Property and listing information entered by hosts</li>
          <li>Job and scheduling data related to cleaning assignments</li>
        </ul>

        <h3>3. How We Use Your Information</h3>
        <ul>
          <li>To create and manage your account</li>
          <li>To send SMS notifications for cleaning job assignments</li>
          <li>To send co-host invitations via SMS when added by a property owner</li>
          <li>To coordinate scheduling between hosts and cleaners</li>
        </ul>

        <h3>4. SMS Messaging</h3>
        <p>
          CleanStay sends SMS messages for two purposes: (1) to notify assigned cleaners of
          new cleaning jobs, and (2) to invite co-hosts to manage shared property listings.
          Messages are only sent to users who have been explicitly added by a property owner.
          You may opt out at any time by replying <strong>STOP</strong> to any message.
        </p>

        <h3>5. Data Sharing</h3>
        <p>
          We do not sell or share your personal data with third parties for marketing purposes.
          We use Twilio to deliver SMS messages. Your phone number is transmitted to Twilio
          solely for the purpose of message delivery.
        </p>

        <h3>6. Data Security</h3>
        <p>
          We use industry-standard security practices including encrypted passwords (bcrypt)
          and JWT-based authentication. Your data is stored securely on our servers.
        </p>

        <h3>7. Contact</h3>
        <p>
          If you have any questions about this Privacy Policy, please contact us at{' '}
          <a href="mailto:support@cleanstay.app">support@cleanstay.app</a>.
        </p>
      </section>

      <hr className="legal-divider" />

      {/* ─── TERMS & CONDITIONS ─── */}
      <section className="legal-section" id="terms-conditions">
        <h2>Terms &amp; Conditions</h2>
        <p className="legal-effective">Effective Date: {effectiveDate}</p>

        <h3>1. Acceptance of Terms</h3>
        <p>
          By creating an account and using CleanStay, you agree to these Terms & Conditions.
          If you do not agree, please do not use the application.
        </p>

        <h3>2. User Roles</h3>
        <p>
          CleanStay has two user roles: <strong>Hosts</strong> and <strong>Cleaners</strong>.
          Hosts are responsible for managing listings, adding cleaners, and inviting co-hosts.
          Cleaners are responsible for completing assigned cleaning jobs.
        </p>

        <h3>3. SMS Consent</h3>
        <p>
          By accepting a co-host invitation or registering as a cleaner assigned to a property,
          you consent to receive SMS messages from CleanStay related to your role. You may opt
          out at any time by replying <strong>STOP</strong> to any message. Message and data
          rates may apply.
        </p>

        <h3>4. Acceptable Use</h3>
        <p>You agree not to:</p>
        <ul>
          <li>Use CleanStay for any unlawful purpose</li>
          <li>Add phone numbers of individuals without their knowledge</li>
          <li>Attempt to reverse engineer or compromise the application</li>
        </ul>

        <h3>5. Limitation of Liability</h3>
        <p>
          CleanStay is provided "as is" without warranties of any kind. We are not liable for
          any missed cleaning jobs, scheduling errors, or losses resulting from use of the
          application.
        </p>

        <h3>6. Changes to Terms</h3>
        <p>
          We may update these Terms at any time. Continued use of CleanStay after changes
          constitutes acceptance of the updated Terms.
        </p>

        <h3>7. Contact</h3>
        <p>
          For questions about these Terms, contact us at{' '}
          <a href="mailto:support@cleanstay.app">support@cleanstay.app</a>.
        </p>
      </section>
    </div>
  );
}