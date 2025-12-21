const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

const client = twilio(accountSid, authToken);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to, body } = req.body;

  try {
    const messageConfig = {
      to: to,
      body: body,
    };

    // This is the critical part: It tells Twilio to use your A2P Messaging Service
    if (messagingServiceSid) {
      messageConfig.messagingServiceSid = messagingServiceSid;
    } else {
      messageConfig.from = fromNumber;
    }

    const message = await client.messages.create(messageConfig);

    return res.status(200).json({ success: true, sid: message.sid });
  } catch (error) {
    console.error('Twilio Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
