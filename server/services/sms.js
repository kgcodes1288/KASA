const twilio = require('twilio');

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || 'your_auth_token_here';
const FROM_PHONE = process.env.TWILIO_PHONE || '+15005550006';

const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

/**
 * Send an SMS alert to a cleaner when a cleaning job is created.
 */
async function sendCleaningAlert({ to, cleanerName, listingName, roomName, checkoutDate }) {
  if (!to) {
    console.log(`[SMS] No phone number for cleaner — skipping SMS`);
    return;
  }

  const dateStr = new Date(checkoutDate).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const body =
    `Hi ${cleanerName}! 🧹 New cleaning job: ` +
    `${roomName} at "${listingName}" — ` +
    `guest checks out ${dateStr}. Open the app to get started.`;

  try {
    const msg = await client.messages.create({ body, from: FROM_PHONE, to });
    console.log(`[SMS] Sent to ${to} — SID: ${msg.sid}`);
  } catch (err) {
    console.error(`[SMS] Failed to send to ${to}:`, err.message);
  }
}

module.exports = { sendCleaningAlert };
