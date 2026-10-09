const twilio = require('twilio');

let client;

// Sends an SMS via Twilio. With SMS_DISABLED=true (staging/demo environments) the message
// is only logged, so flows that text people can be exercised without real credentials.
async function sendSms({ to, body }) {
  if (process.env.SMS_DISABLED === 'true') {
    console.log(`[SMS disabled] would send to ${to}: ${body}`);
    return { sid: 'SM_disabled' };
  }
  client ||= twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return client.messages.create({ to, from: process.env.TWILIO_PHONE, body });
}

module.exports = { sendSms };
