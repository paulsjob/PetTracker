import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import twilio from 'twilio';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

const CHANNEL_BY_CONTACT = {
  email: 'resend',
  sms: 'twilio',
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[1-9]\d{9,14}$/;

const normalizeContact = (value) => String(value || '').trim();
const normalizePhone = (value) => String(value || '').replace(/[^\d+]/g, '');
const isEmail = (value) => EMAIL_PATTERN.test(normalizeContact(value));
const isPhone = (value) => PHONE_PATTERN.test(normalizePhone(value));

const buildTrackingUrl = (baseUrl, patientId, accessCode) =>
  `${baseUrl.replace(/\/$/, '')}/?id=${encodeURIComponent(patientId)}&code=${encodeURIComponent(accessCode)}`;

const createNotificationPayload = ({ template, patient, trackingUrl, clinicName }) => {
  if (template === 'ready-for-pickup') {
    return {
      subject: 'Pickup Ready',
      body: `Great news! ${patient.name} is ready for pickup.`,
      html: createReadyForPickupEmail({ clinicName, petName: patient.name, trackingUrl }),
      sms: `PetTracker: ${patient.name} ready at ${clinicName}. Track: ${trackingUrl}`,
    };
  }

  return {
    subject: 'Live Tracking Link',
    body: `${patient.name} is checked in! Track their status live: ${trackingUrl}`,
    html: createCheckInEmail({ clinicName, petName: patient.name, trackingUrl }),
    sms: `PetTracker: ${patient.name} checked in at ${clinicName}. Track: ${trackingUrl}`,
  };
};

const brandStyles = {
  purple: '#6D28D9',
  purpleDark: '#5B21B6',
  text: '#111827',
  muted: '#4B5563',
  background: '#F5F3FF',
  card: '#FFFFFF',
};

const createHtmlShell = ({ title, subtitle, ctaLabel, trackingUrl }) => `
  <div style="margin:0;padding:24px;background:${brandStyles.background};font-family:Inter,Segoe UI,Arial,sans-serif;color:${brandStyles.text};">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;">
      <tr>
        <td style="background:${brandStyles.card};border-radius:16px;padding:32px;border:1px solid #E9D5FF;">
          <div style="display:inline-block;background:#EDE9FE;color:${brandStyles.purpleDark};font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:6px 10px;border-radius:999px;">
            PetTracker Update
          </div>
          <h1 style="margin:18px 0 8px;font-size:24px;line-height:1.3;color:${brandStyles.purpleDark};">${title}</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:${brandStyles.muted};">${subtitle}</p>
          <a href="${trackingUrl}" style="display:inline-block;background:${brandStyles.purple};color:#FFFFFF;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px;">
            ${ctaLabel}
          </a>
          <p style="margin:24px 0 0;font-size:13px;color:${brandStyles.muted};line-height:1.6;">
            If the button does not work, use this secure tracking link:<br />
            <a href="${trackingUrl}" style="color:${brandStyles.purple};word-break:break-all;">${trackingUrl}</a>
          </p>
        </td>
      </tr>
    </table>
  </div>
`;

const createCheckInEmail = ({ clinicName, petName, trackingUrl }) =>
  createHtmlShell({
    title: `${petName} is checked in at ${clinicName}`,
    subtitle: `We’ve started your pet’s visit. You can follow each step in real time with the secure tracker.`,
    ctaLabel: 'Track Visit Status',
    trackingUrl,
  });

const createReadyForPickupEmail = ({ clinicName, petName, trackingUrl }) =>
  createHtmlShell({
    title: `${petName} is ready for pickup`,
    subtitle: `${clinicName} has completed today’s visit. View final status updates before you head over.`,
    ctaLabel: 'View Final Updates',
    trackingUrl,
  });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase service role configuration missing' });
  }

  const { patientId, template = 'check-in-link' } = req.body || {};
  if (!patientId || !['check-in-link', 'ready-for-pickup'].includes(template)) {
    return res.status(400).json({ error: 'Invalid patientId or template' });
  }

  const { data: patient, error } = await supabaseAdmin
    .from('patients')
    .select('id, name, owner, owner_contact, owner_phone, access_code, clinic_id')
    .eq('id', patientId)
    .maybeSingle();

  if (error || !patient) {
    return res.status(404).json({ error: 'Patient not found' });
  }

  const ownerContact = normalizeContact(patient.owner_contact || patient.owner_phone);
  if (!ownerContact) {
    return res.status(400).json({ error: 'Patient has no owner contact on file' });
  }

  const channel = isEmail(ownerContact) ? 'email' : isPhone(ownerContact) ? 'sms' : null;
  if (!channel) {
    return res.status(400).json({ error: 'Owner contact must be a valid email address or phone number' });
  }

  const baseUrl = process.env.PUBLIC_APP_URL
    || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
  const trackingUrl = buildTrackingUrl(baseUrl, patient.id, patient.access_code);
  const { data: clinicSettings } = await supabaseAdmin
    .from('clinic_settings')
    .select('name')
    .eq('clinic_id', patient.clinic_id || 'default')
    .maybeSingle();
  const clinicName = clinicSettings?.name || 'PetTracker';
  const payload = createNotificationPayload({ template, patient, trackingUrl, clinicName });
  const provider = CHANNEL_BY_CONTACT[channel];

  if (channel === 'email') {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      try {
        const resend = new Resend(resendApiKey);
        const result = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'PetTracker <notifications@pettracker.local>',
          to: ownerContact,
          subject: payload.subject,
          html: payload.html,
          text: payload.body,
        });

        return res.status(200).json({
          success: true,
          provider,
          channel,
          to: ownerContact,
          message: payload.body,
          delivery: result,
        });
      } catch (sendError) {
        console.error('[notify-parent:resend-error]', {
          patientId: patient.id,
          to: ownerContact,
          template,
          error: sendError,
        });

        return res.status(200).json({
          success: true,
          provider,
          channel,
          to: ownerContact,
          message: payload.body,
          warning: 'Email delivery failed. Check logs for details.',
        });
      }
    }

    console.log('[notify-parent:mock-provider]', {
      provider: 'resend-mock',
      channel,
      to: ownerContact,
      patientId: patient.id,
      template,
      message: payload.body,
    });

    return res.status(200).json({
      success: true,
      provider: 'resend-mock',
      channel,
      to: ownerContact,
      message: payload.body,
    });
  }

  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
  const normalizedPhone = normalizePhone(ownerContact);

  if (twilioAccountSid && twilioAuthToken && twilioPhoneNumber) {
    const twilioClient = twilio(twilioAccountSid, twilioAuthToken);

    try {
      const result = await twilioClient.messages.create({
        from: twilioPhoneNumber,
        to: normalizedPhone,
        body: payload.sms,
      });

      return res.status(200).json({
        success: true,
        provider,
        channel,
        to: normalizedPhone,
        message: payload.sms,
        delivery: { sid: result.sid },
      });
    } catch (sendError) {
      console.error('[notify-parent:twilio-error]', {
        patientId: patient.id,
        to: normalizedPhone,
        template,
        error: sendError,
      });

      return res.status(200).json({
        success: true,
        provider,
        channel,
        to: normalizedPhone,
        message: payload.sms,
        warning: 'SMS delivery failed. Check logs for details.',
      });
    }
  }

  console.log('[notify-parent:mock-provider]', {
    provider: 'twilio-mock',
    channel,
    to: normalizedPhone,
    patientId: patient.id,
    template,
    message: payload.sms,
  });

  return res.status(200).json({
    success: true,
    provider: 'twilio-mock',
    channel,
    to: normalizedPhone,
    message: payload.sms,
  });
}
