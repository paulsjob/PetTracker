import { CLINIC_ID } from '../constants';
import { supabase } from './supabase';

export interface AuditLogEvent {
  actorDoctorId?: string | null;
  action: string;
  clinicId?: string;
  metadata?: Record<string, unknown> | null;
  targetId?: string | null;
  targetType?: string | null;
}

export const logAuditEvent = async ({
  actorDoctorId = null,
  action,
  clinicId = CLINIC_ID,
  metadata = null,
  targetId = null,
  targetType = null,
}: AuditLogEvent): Promise<void> => {
  if (!supabase) return;

  try {
    await supabase.from('audit_logs').insert([
      {
        clinic_id: clinicId,
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
