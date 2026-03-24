import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;
const MAX_MESSAGE_LENGTH = 320;
const PHONE_PATTERN = /^\+?[1-9]\d{9,14}$/;

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

  if (!client || (!messagingServiceSid && !fromNumber)) {
    return res.status(500).json({ success: false, error: 'SMS service is not configured' });
  }

  const normalizedPhone = String(to).replace(/[^\d+]/g, '');
  const normalizedBody = String(body).trim();

  if (!PHONE_PATTERN.test(normalizedPhone)) {
    return res.status(400).json({ success: false, error: 'Invalid phone number format' });
  }

  if (!normalizedBody || normalizedBody.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ success: false, error: 'Message body must be between 1 and 320 characters' });
  }

  try {
    const messageConfig = {
      to: normalizedPhone,
      body: normalizedBody,
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
    return res.status(500).json({ success: false, error: 'SMS delivery failed' });
  }
}
