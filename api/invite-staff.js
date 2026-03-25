import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

const ROLE_BY_ADMIN_FLAG = {
  true: 'admin',
  false: 'standard_user',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase service role configuration missing' });
  }

  const bearerToken = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!bearerToken) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  const { name, specialty, email, clinicId = 'default' } = req.body || {};
  const normalizedName = String(name || '').trim();
  const normalizedSpecialty = String(specialty || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!normalizedName || !normalizedSpecialty || !normalizedEmail) {
    return res.status(400).json({ error: 'Name, specialty, and email are required' });
  }

  try {
    const {
      data: { user: actingUser },
      error: authError,
    } = await supabaseAdmin.auth.getUser(bearerToken);

    if (authError || !actingUser) {
      return res.status(401).json({ error: 'Invalid staff session' });
    }

    const { data: actingRole, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role, is_active')
      .eq('user_id', actingUser.id)
      .eq('clinic_id', clinicId)
      .maybeSingle();

    if (roleError || !actingRole?.is_active || actingRole.role !== 'admin') {
      return res.status(403).json({ error: 'Admin privileges required' });
    }

    const { data: invitedData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail, {
      data: {
        clinic_id: clinicId,
        role: 'standard_user',
        full_name: normalizedName,
      },
    });

    if (inviteError || !invitedData?.user?.id) {
      const message = inviteError?.message || 'Unable to invite user';
      return res.status(400).json({ error: message });
    }

    const invitedUserId = invitedData.user.id;
    const doctorId = `doc-${crypto.randomUUID().slice(0, 8)}`;

    const { error: doctorError } = await supabaseAdmin.from('doctors').upsert(
      {
        id: doctorId,
        name: normalizedName,
        specialty: normalizedSpecialty,
        email: normalizedEmail,
        clinic_id: clinicId,
        user_id: invitedUserId,
        is_active: true,
        is_admin: false,
        app_role: 'standard_user',
      },
      { onConflict: 'user_id' },
    );

    if (doctorError) {
      return res.status(500).json({ error: 'Failed to link invited user to doctors profile' });
    }

    const { error: roleUpsertError } = await supabaseAdmin.from('user_roles').upsert(
      {
        user_id: invitedUserId,
        clinic_id: clinicId,
        role: ROLE_BY_ADMIN_FLAG[false],
        is_active: true,
      },
      { onConflict: 'user_id' },
    );

    if (roleUpsertError) {
      return res.status(500).json({ error: 'Failed to provision staff role' });
    }

    return res.status(200).json({ success: true, doctorId, invitedUserId });
  } catch (error) {
    console.error('Invite staff error:', error);
    return res.status(500).json({ error: 'Unexpected server error while inviting staff.' });
  }
}
