import twilio from 'twilio';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { phoneNumber, petName, trackingId, accessCode } = await request.json();

    if (!phoneNumber || !petName || !trackingId || !accessCode) {
      return NextResponse.json(
        { error: 'Missing required fields: phoneNumber, petName, trackingId, accessCode' },
        { status: 400 },
      );
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !from) {
      return NextResponse.json({ error: 'Twilio configuration is missing' }, { status: 500 });
    }

    const client = twilio(accountSid, authToken);

    const trackingUrl = `https://pettracker.io/?id=${encodeURIComponent(String(trackingId))}&code=${encodeURIComponent(String(accessCode))}`;
    const body = `PetTracker: ${petName} is checked in! Track their live status here: ${trackingUrl}. Reply STOP to cancel.`;

    const message = await client.messages.create({
      to: phoneNumber,
      from,
      body,
    });

    return NextResponse.json({ sid: message.sid }, { status: 200 });
  } catch (error) {
    console.error('Twilio API error:', error);
    return NextResponse.json({ error: 'Failed to send SMS' }, { status: 500 });
  }
}
