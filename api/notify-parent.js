import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

const CHANNEL_BY_CONTACT = {
  email: 'resend-mock',
  sms: 'twilio-mock',
};

const normalizeContact = (value) => String(value || '').trim();
const isEmail = (value) => value.includes('@');

const buildTrackingUrl = (baseUrl, patientId, accessCode) =>
  `${baseUrl.replace(/\/$/, '')}/?id=${encodeURIComponent(patientId)}&code=${encodeURIComponent(accessCode)}`;

const createNotificationPayload = ({ template, patient, trackingUrl }) => {
  if (template === 'ready-for-pickup') {
    return {
      subject: 'Pickup Ready',
      body: 'Great news! Your pet is ready for pickup.',
    };
  }

  return {
    subject: 'Live Tracking Link',
    body: `Your pet is checked in! Track their status live: ${trackingUrl}`,
  };
};

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
    .select('id, name, owner, owner_contact, owner_phone, access_code')
    .eq('id', patientId)
    .maybeSingle();

  if (error || !patient) {
    return res.status(404).json({ error: 'Patient not found' });
  }

  const ownerContact = normalizeContact(patient.owner_contact || patient.owner_phone);
  if (!ownerContact) {
    return res.status(400).json({ error: 'Patient has no owner contact on file' });
  }

  const baseUrl = process.env.PUBLIC_APP_URL
    || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
  const trackingUrl = buildTrackingUrl(baseUrl, patient.id, patient.access_code);
  const payload = createNotificationPayload({ template, patient, trackingUrl });
  const channel = isEmail(ownerContact) ? 'email' : 'sms';
  const provider = CHANNEL_BY_CONTACT[channel];

  console.log('[notify-parent:mock-provider]', {
    provider,
    channel,
    to: ownerContact,
    patientId: patient.id,
    template,
    message: payload.body,
  });

  return res.status(200).json({
    success: true,
    provider,
    channel,
    to: ownerContact,
    message: payload.body,
  });
}
