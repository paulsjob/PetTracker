import { supabase } from './supabase';
import { Patient, Doctor, StageId, PatientStageEvent } from '../types';

// Matches exactly what is in your Supabase 'clinic_id' column
const CLINIC_ID = 'default';

export const api = {
  login: async (pin: string): Promise<Doctor | null> => {
    if (!supabase) return null;
    
    const { data, error } = await supabase
      .from('doctors')
      .select('*')
      .eq('clinic_id', CLINIC_ID)
      .eq('pin', pin)
      .maybeSingle();
    
    if (error) {
      console.error("Supabase Login Error:", error);
      return null;
    }
    return data as Doctor | null;
  },

  getPatientForClient: async (id: string, code: string): Promise<Patient | null> => {
    if (!supabase) return null;
    
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .eq('id', id)
      .eq('access_code', code)
      .eq('clinic_id', CLINIC_ID)
      .maybeSingle();
      
    if (error) return null;
    return data as Patient | null;
  },

  getPatients: async (doctorId: string): Promise<Patient[]> => {
    if (!supabase) return [];
    
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .eq('clinic_id', CLINIC_ID)
      .eq('doctor_id', doctorId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false });
      
    if (error) return [];
    return (data || []) as Patient[];
  },

  createPatient: async (patient: Partial<Patient>, doctorId: string): Promise<Patient | null> => {
    if (!supabase) return null;

    const accessCode = Math.floor(100000 + Math.random() * 900000).toString();
    const newPatient = {
      name: patient.name || 'Unknown',
      owner: patient.owner || 'Unknown',
      owner_phone: (patient as any).owner_phone || null,
      stage: 'checked-in',
      status: 'active',
      clinic_id: CLINIC_ID,
      doctor_id: doctorId,
      access_code: accessCode,
      stage_history: []
    };

    const { data, error } = await supabase
      .from('patients')
      .insert([newPatient])
      .select('*')
      .single();

    if (error) {
      console.error("Supabase Insert Error:", error);
      return null;
    }
    
    // Trigger live updates
    window.dispatchEvent(new CustomEvent('vettrack:update', { detail: { id: data.id } }));
    return data as Patient;
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

    await supabase
      .from('patients')
      .update({ 
        stage, 
        note: cleanNote, 
        updated_at: new Date().toISOString(), 
        updated_by_doctor_id: doctorId, 
        stage_history: history 
      })
      .eq('id', id);

    window.dispatchEvent(new CustomEvent('vettrack:update', { detail: { id } }));
  }
};
