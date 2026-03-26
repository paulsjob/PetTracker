import twilio from 'twilio';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { phoneNumber, petName, trackingId, accessCode } = req.body ?? {};

  if (!phoneNumber || !petName || !trackingId || !accessCode) {
    return res.status(400).json({
      error: 'Missing required fields: phoneNumber, petName, trackingId, accessCode',
    });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  const client = twilio(accountSid, authToken);
  const trackingUrl = `https://pettracker.io/?id=${encodeURIComponent(
    trackingId,
  )}&code=${encodeURIComponent(accessCode)}`;

  try {
    const message = await client.messages.create({
      to: phoneNumber,
      from,
      body: `PetTracker: ${petName} is checked in! Track their live status here: ${trackingUrl}. Reply STOP to cancel.`,
    });

    return res.status(200).json({ success: true, messageId: message.sid });
  } catch (error) {
    console.error('Twilio send error:', error);
    return res.status(500).json({ error: 'Failed to send SMS' });
  }
}
