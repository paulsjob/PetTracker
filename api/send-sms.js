import twilio from 'twilio';

export default async function handler(req, res) {
  // 1. Check that the request is a POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 2. Get the phone number and message from the request
  const { to, body } = req.body;

  if (!to || !body) {
    return res.status(400).json({ error: 'Missing "to" phone number or "body" message' });
  }

  try {
    // 3. Connect to Twilio using your hidden Vercel keys
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    // 4. Send the message
    const message = await client.messages.create({
      body: body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to,
    });

    // 5. Tell the frontend it worked
    return res.status(200).json({ success: true, sid: message.sid });

  } catch (error) {
    console.error('Twilio Error:', error);
    return res.status(500).json({ error: 'Failed to send SMS', details: error.message });
  }
}A
