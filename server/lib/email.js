const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM   = process.env.RESEND_FROM || 'noreply@getcleanstays.com';

const APP_URL = process.env.CLIENT_URL || 'https://getcleanstays.com';
const API_URL = process.env.API_URL || process.env.RENDER_EXTERNAL_URL || 'https://kasa-workplanner.onrender.com';

function unsubscribeFooter(token) {
  const url = `${API_URL}/api/unsubscribe?token=${token}`;
  return `<p style="margin:8px 0 0;font-size:11px;color:#9ca3af;">
    <a href="${url}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a> from CleanStay email notifications.
  </p>`;
}

/**
 * Send a transactional notification email.
 */
async function sendNotificationEmail({ to, toName, subject, title, message, actionUrl, actionLabel, unsubscribeToken }) {
  if (!process.env.RESEND_API_KEY) return; // skip in dev if not configured

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:540px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#0d9488;padding:24px 32px;">
            <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">
              🧹 CleanStay
            </p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#111827;">${title}</p>
            <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">${message}</p>
            ${actionUrl ? `
            <a href="${actionUrl}" style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
              ${actionLabel || 'View Details'}
            </a>` : ''}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #f3f4f6;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              You're receiving this because you have an account on
              <a href="${APP_URL}" style="color:#0d9488;text-decoration:none;">CleanStay</a>.
            </p>
            ${unsubscribeToken ? unsubscribeFooter(unsubscribeToken) : ''}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await resend.emails.send({
      from: FROM,
      to:   [to],
      subject,
      html,
    });
    console.log(`[email] Sent "${subject}" to ${to}`);
  } catch (err) {
    console.error(`[email] Failed to send to ${to}:`, err.message);
  }
}

/**
 * Send a direct message email from one user to another.
 */
async function sendDirectEmail({ fromName, fromEmail, toName, toEmail, subject, body, listingName }) {
  if (!process.env.RESEND_API_KEY) throw new Error('Email service not configured (missing RESEND_API_KEY)');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:540px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#0d9488;padding:24px 32px;">
            <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">🧹 CleanStay</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">
              Message from <strong>${fromName}</strong>${listingName ? ` · ${listingName}` : ''}
            </p>
            <p style="margin:0 0 20px;font-size:18px;font-weight:700;color:#111827;">${subject}</p>
            <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:24px;">
              <p style="margin:0;font-size:15px;color:#374151;line-height:1.7;white-space:pre-wrap;">${body}</p>
            </div>
            <p style="margin:0;font-size:13px;color:#9ca3af;">
              Reply directly to this email to respond to ${fromName}.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #f3f4f6;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              Sent via <a href="${APP_URL}" style="color:#0d9488;text-decoration:none;">CleanStay</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const result = await resend.emails.send({
    from:       FROM,
    to:         [toEmail],
    reply_to:   fromEmail,
    subject:    `[CleanStay] ${subject}`,
    html,
  });

  if (result.error) {
    console.error(`[email] Resend error to ${toEmail}:`, result.error);
    throw new Error(result.error.message || 'Resend rejected the email');
  }

  console.log(`[email] Direct message sent from ${fromEmail} to ${toEmail}`, result.data?.id);
}

/**
 * Send a co-host invite email.
 */
async function sendInviteEmail({ toEmail, fromName, listingName, role, inviteUrl }) {
  if (!process.env.RESEND_API_KEY) {
    console.error('[email] sendInviteEmail skipped — RESEND_API_KEY is not set');
    return;
  }

  const roleLabel = role === 'COHOST' ? 'Co-host' : 'View Only';
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:540px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#0d9488;padding:24px 32px;">
            <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">🧹 CleanStay</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#111827;">You've been invited to co-host</p>
            <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
              <strong>${fromName}</strong> has invited you to join <strong>${listingName}</strong> as a <strong>${roleLabel}</strong> on CleanStay.
            </p>
            <a href="${inviteUrl}" style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
              Accept Invite
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #f3f4f6;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              If you weren't expecting this, you can ignore this email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  console.log(`[email] Sending invite to ${toEmail} from=${FROM}`);
  const result = await resend.emails.send({
    from: FROM,
    to: [toEmail],
    subject: `${fromName} invited you to co-host "${listingName}" on CleanStay`,
    html,
  });

  if (result.error) {
    console.error(`[email] Resend rejected invite to ${toEmail}:`, result.error);
    throw new Error(result.error.message || 'Resend rejected the invite email');
  }

  console.log(`[email] Invite sent to ${toEmail} id=${result.data?.id}`);
}

/**
 * Send a digest email for newly created cleaning jobs (one email per sync, per listing).
 * jobs: [{ checkoutDate, roomCount }]
 */
async function sendCleaningDigestEmail({ toEmail, toName, listingName, listingId, jobs, unsubscribeToken }) {
  if (!process.env.RESEND_API_KEY) {
    console.error('[email] sendCleaningDigestEmail skipped — RESEND_API_KEY not set');
    return;
  }

  const actionUrl = `${APP_URL}/listings/${listingId}?tab=jobs`;
  const fmt = (d) => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

  const rows = jobs.map((j) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#111827;">📅 ${fmt(j.checkoutDate)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">${j.roomCount} room${j.roomCount !== 1 ? 's' : ''}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:540px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
        <tr><td style="background:#0d9488;padding:24px 32px;">
          <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">🧹 CleanStay</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#111827;">${jobs.length} new cleaning job${jobs.length !== 1 ? 's' : ''} added</p>
          <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
            The following checkout dates were synced for <strong>${listingName}</strong>:
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
            <thead>
              <tr style="background:#f9fafb;">
                <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Checkout Date</th>
                <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Rooms</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <a href="${actionUrl}" style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
            View Jobs
          </a>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #f3f4f6;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            You're receiving this because you manage <a href="${actionUrl}" style="color:#0d9488;text-decoration:none;">${listingName}</a> on CleanStay.
          </p>
          ${unsubscribeToken ? unsubscribeFooter(unsubscribeToken) : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const result = await resend.emails.send({
    from: FROM,
    to: [toEmail],
    subject: `${jobs.length} new cleaning job${jobs.length !== 1 ? 's' : ''} added — ${listingName}`,
    html,
  });

  if (result.error) throw new Error(result.error.message);
  console.log(`[email] Cleaning digest sent to ${toEmail} (${jobs.length} jobs)`);
}

/**
 * Send a same-day reminder email for jobs checking out today.
 * jobs: [{ checkoutDate, roomCount }]
 */
async function sendCleaningReminderEmail({ toEmail, toName, listingName, listingId, jobs, unsubscribeToken }) {
  if (!process.env.RESEND_API_KEY) return;

  const actionUrl = `${APP_URL}/listings/${listingId}?tab=jobs`;
  const fmt = (d) => new Date(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });

  const jobList = jobs.map((j) => `<li style="margin-bottom:6px;font-size:14px;color:#111827;">📅 ${fmt(j.checkoutDate)} — ${j.roomCount} room${j.roomCount !== 1 ? 's' : ''}</li>`).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:540px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
        <tr><td style="background:#0d9488;padding:24px 32px;">
          <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">🧹 CleanStay</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#111827;">🔔 Cleaning reminder for today</p>
          <p style="margin:0 0 16px;font-size:15px;color:#6b7280;line-height:1.6;">
            You have ${jobs.length > 1 ? `${jobs.length} checkouts` : 'a checkout'} today at <strong>${listingName}</strong>:
          </p>
          <ul style="margin:0 0 24px;padding-left:20px;">${jobList}</ul>
          <a href="${actionUrl}" style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
            View Jobs
          </a>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #f3f4f6;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            Sent via <a href="${APP_URL}" style="color:#0d9488;text-decoration:none;">CleanStay</a>
          </p>
          ${unsubscribeToken ? unsubscribeFooter(unsubscribeToken) : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const result = await resend.emails.send({
    from: FROM,
    to: [toEmail],
    subject: `🔔 Cleaning reminder today — ${listingName}`,
    html,
  });

  if (result.error) throw new Error(result.error.message);
  console.log(`[email] Reminder sent to ${toEmail} for ${listingName}`);
}

module.exports = { sendNotificationEmail, sendDirectEmail, sendInviteEmail, sendCleaningDigestEmail, sendCleaningReminderEmail };
