import { CLINIC_ID } from '../constants';
import { supabase } from './supabase';

export interface AuditLogEvent {
  action: string;
  clinicId?: string;
  metadata?: Record<string, unknown> | null;
  targetId?: string | null;
  targetType?: string | null;
  actorDoctorId?: string | null;
}

export const logAuditEvent = async ({
  action,
  clinicId = CLINIC_ID,
  metadata = null,
  targetId = null,
  targetType = null,
  actorDoctorId = null,
}: AuditLogEvent): Promise<void> => {
  if (!supabase) return;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.from('audit_logs').insert([
      {
        clinic_id: clinicId,
        actor_user_id: user?.id || null,
        actor_doctor_id: actorDoctorId,
        action,
        target_type: targetType,
        target_id: targetId,
        metadata,
      },
    ]);
  } catch (error) {
    console.warn('Audit logging skipped:', error);
  }
};
