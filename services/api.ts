import { supabase } from './supabase';
import { Patient, Doctor, StageId, PatientStageEvent } from '../types';

// We hardcode this to match exactly what is in your Supabase 'clinic_id' column
const CLINIC_ID = 'default';

export const DOCTORS: Doctor[] = [
  { id: 'doc-internal', name: 'Dr. Chen', specialty: 'Internal Medicine', pin: '9999' },
  { id: 'doc-onco', name: 'Dr. Wilson', specialty: 'Oncology', pin: '2121' },
  { id: 'doc-surg', name: 'Dr. Shepherd', specialty: 'Surgery', pin: '1221' }
];

const USE_SUPABASE = !!supabase;

const generateId = () => Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 6);
const generateAccessCode = () => Math.floor(100000 + Math.random() * 900000).toString();

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const dispatchUpdate = (id?: string) => {
  window.dispatchEvent(new CustomEvent('vettrack:update', { detail: { id } }));
};

const dispatchPatientUpdate = (id: string) => {
  window.dispatchEvent(new CustomEvent('vettrack:patientUpdated', { detail: { id } }));
};

export const api = {
  login: async (pin: string): Promise<Doctor | null> => {
    if (USE_SUPABASE) {
      const { data, error } = await supabase!
        .from('doctors')
        .select('*')
        .eq('clinic_id', CLINIC_ID)
        .eq('pin', pin)
        .maybeSingle();
      
      if (error) {
        console.error("Supabase Login Error:", error);
        return null;
      }
      return (data as Doctor) || null;
    }
    await delay(300);
    return DOCTORS.find(d => d.pin === pin) || null;
  },

  getPatientForClient: async (id: string, code: string): Promise<Patient | null> => {
    if (USE_SUPABASE) {
      const { data, error } = await supabase!
        .from('patients')
        .select('*')
        .eq('id', id)
        .eq('access_code', code)
        .eq('clinic_id', CLINIC_ID)
        .maybeSingle();
      if (error) return null;
      return (data as Patient) || null;
    }
    return null;
  },

  getPatients: async (doctorId: string): Promise<Patient[]> => {
    if (USE_SUPABASE) {
      const { data, error } = await supabase!
        .from('patients')
        .select('*')
        .eq('clinic_id', CLINIC_ID)
        .eq('doctor_id', doctorId)
        .order('updated_at', { ascending: false });
      if (error) return [];
      return (data || []) as Patient[];
    }
    return [];
  },

  createPatient: async (patient: Partial<Patient>, doctorId: string): Promise<Patient | null> => {
    const newPatient: Patient = {
      id: generateId(),
      name: patient.name || 'Unknown',
      owner: patient.owner || 'Unknown',
      owner_phone: (patient as any).owner_phone || null,
      stage: 'checked-in',
      status: 'active',
      clinic_id: CLINIC_ID,
      doctor_id: doctorId,
      access_code: generateAccessCode(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by_doctor_id: doctorId,
      stage_history: [],
      note: null
    };

    if (USE_SUPABASE) {
      const { data, error } = await supabase!
        .from('patients')
        .insert([newPatient])
        .select('*')
        .single();

      if (error) {
        console.error("Supabase Insert Error:", error);
        return null;
      }
      dispatchUpdate(data.id);
      dispatchPatientUpdate(data.id);
      return data as Patient;
    }
    return newPatient;
  },

  updateStage: async (id: string, stage: StageId, doctorId: string, note?: string): Promise<void> => {
    const cleanNote = note?.trim() || null;
    if (USE_SUPABASE) {
      const { data: current } = await supabase!.from('patients').select('stage, stage_history').eq('id', id).single();
      let history = (current.stage_history || []) as PatientStageEvent[];
      if (current.stage !== stage) {
        const event = { from_stage: current.stage, to_stage: stage, changed_at: new Date().toISOString(), changed_by_doctor_id: doctorId };
        history = [event, ...history].slice(0, 10);
      }
      await supabase!.from('patients').update({ stage, note: cleanNote, updated_at: new Date().toISOString(), updated_by_doctor_id: doctorId, stage_history: history }).eq('id', id);
      dispatchUpdate(id);
      dispatchPatientUpdate(id);
    }
  }
};
