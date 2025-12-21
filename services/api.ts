import { supabase } from './supabase';
import { Patient, Doctor, StageId, PatientStageEvent } from '../types';

const CLINIC_ID = 'default';

export const api = {
  login: async (pin: string, clinicId: string = CLINIC_ID): Promise<Doctor | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('doctors')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('pin', pin)
      .maybeSingle();
    if (error) return null;
    return data as Doctor | null;
  },

  // RESTORED: App.tsx requires this function for parent logins
  loginPatientWithId: async (id: string, code: string): Promise<Patient | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .eq('id', id)
      .eq('access_code', code)
      .maybeSingle();
    if (error) return null;
    return data as Patient | null;
  },

  getPatientForClient: async (id: string, code: string): Promise<Patient | null> => {
    return api.loginPatientWithId(id, code);
  },

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
        changed_by_doctor_id: doctorId 
      };
      history = [event, ...history].slice(0, 10);
    }
    await supabase.from('patients').update({ 
      stage, 
      note: cleanNote, 
      updated_at: new Date().toISOString(), 
      updated_by_doctor_id: doctorId, 
      stage_history: history 
    }).eq('id', id);
    window.dispatchEvent(new CustomEvent('vettrack:update', { detail: { id } }));
  }
};
