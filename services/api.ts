import { AuthError, Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { Patient, Doctor, StageId, PatientStageEvent } from '../types';
import { CLINIC_ID } from '../constants';

export const api = {
  signInStaff: async (email: string, password: string): Promise<{ session: Session | null; error: AuthError | null }> => {
    if (!supabase) return { session: null, error: null };

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { session: data.session, error };
  },

  requestStaffPasswordReset: async (email: string, redirectTo?: string): Promise<{ error: AuthError | null }> => {
    if (!supabase) return { error: null };

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    return { error };
  },

  updateStaffPassword: async (password: string): Promise<{ error: AuthError | null }> => {
    if (!supabase) return { error: null };

    const { error } = await supabase.auth.updateUser({ password });
    return { error };
  },

  inviteStaffMember: async (payload: { name: string; specialty: string; email: string; clinicId?: string }): Promise<{ error?: string; doctorId?: string }> => {
    if (!supabase) return {};

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return { error: 'Your admin session has expired. Please sign in again.' };
    }

    const response = await fetch('/api/invite-staff', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok) {
      return { error: result?.error || 'Unable to invite staff member.' };
    }

    return result;
  },

  signOutStaff: async (): Promise<void> => {
    if (!supabase) return;
    await supabase.auth.signOut();
  },

  getCurrentStaffProfile: async (userId: string, clinicId: string = CLINIC_ID): Promise<Doctor | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('doctors')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) return null;
    return data as Doctor | null;
  },

  loginPatientWithId: async (id: string, code: string): Promise<Patient | null> => {
    if (!supabase) return null;

    const { data, error } = await supabase.rpc('lookup_patient_with_access_code', {
      lookup_patient_id: id,
      lookup_access_code: code,
    });

    if (error || !Array.isArray(data) || data.length === 0) return null;
    return data[0] as Patient;
  },

  getPatientForClient: async (id: string, code: string): Promise<Patient | null> => api.loginPatientWithId(id, code),

  updateStage: async (id: string, stage: StageId, doctorId: string, note?: string): Promise<void> => {
    if (!supabase) return;
    const cleanNote = note?.trim() || null;
    const { data: current } = await supabase.from('patients').select('stage, stage_history').eq('id', id).single();
    let history = (current?.stage_history || []) as PatientStageEvent[];
    if (current?.stage !== stage) {
      const event = {
        from_stage: current?.stage,
        to_stage: stage,
        changed_at: new Date().toISOString(),
        changed_by_doctor_id: doctorId,
      };
      history = [event, ...history].slice(0, 10);
    }
    await supabase
      .from('patients')
      .update({
        stage,
        note: cleanNote,
        updated_at: new Date().toISOString(),
        updated_by_doctor_id: doctorId,
        stage_history: history,
      })
      .eq('id', id);
    window.dispatchEvent(new CustomEvent('vettrack:update', { detail: { id } }));
  },
};
