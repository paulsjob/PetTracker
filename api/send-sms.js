import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

const client = twilio(accountSid, authToken);

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to, body } = req.body;

  // Validation
  if (!to || !body) {
    return res.status(400).json({ success: false, error: 'Missing phone number or message body' });
  }

  try {
    const messageConfig = {
      to: to,
      body: body,
    };

    // Use Messaging Service SID if available (highly recommended for A2P compliance)
    if (messagingServiceSid) {
      messageConfig.messagingServiceSid = messagingServiceSid;
    } else {
      messageConfig.from = fromNumber;
    }

    const message = await client.messages.create(messageConfig);

    return res.status(200).json({ success: true, sid: message.sid });
  } catch (error) {
    console.error('Twilio Server Error:', error);
    // Return the specific Twilio error message to the dashboard
    return res.status(500).json({ success: false, error: error.message });
  }
}
