import { supabase } from './supabase';
import { Patient, Doctor, StageId, PatientStageEvent } from '../types';
import { CLINIC_ID } from '../constants';

const STORAGE_KEY = 'vet_track_local_data_v4'; // Incremented version for migration

// Defined Doctors for local demo mode
export const DOCTORS: Doctor[] = [
  {
    id: 'doc-internal',
    name: 'Dr. Chen',
    specialty: 'Internal Medicine',
    pin: '111111'
  },
  {
    id: 'doc-onco',
    name: 'Dr. Wilson',
    specialty: 'Oncology',
    pin: '222222'
  },
  {
    id: 'doc-surg',
    name: 'Dr. Shepherd',
    specialty: 'Surgery',
    pin: '333333'
  }
];

// Source of truth flag
const USE_SUPABASE = !!supabase;

// Helper to generate random IDs
const generateId = () => Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 6);

// Helper to generate 6-digit access code
const generateAccessCode = () => Math.floor(100000 + Math.random() * 900000).toString();

// Initial dummy data - Ensure notes are null
const INITIAL_DATA: Patient[] = [
  { id: generateId(), name: 'Bella', owner: 'John Smith', stage: 'checked-in', status: 'active', clinic_id: CLINIC_ID, doctor_id: 'doc-internal', access_code: '123456', created_at: new Date(Date.now() - 3600000).toISOString(), note: null },
  { id: generateId(), name: 'Charlie', owner: 'Alice Cooper', stage: 'pre-op', status: 'active', clinic_id: CLINIC_ID, doctor_id: 'doc-internal', access_code: '234567', created_at: new Date(Date.now() - 7200000).toISOString(), note: null },
  { id: generateId(), name: 'Lucy', owner: 'Bob Dylan', stage: 'recovery', status: 'active', clinic_id: CLINIC_ID, doctor_id: 'doc-internal', access_code: '345678', created_at: new Date(Date.now() - 1800000).toISOString(), note: null },
  { id: generateId(), name: 'Max', owner: 'Diana Ross', stage: 'ready', status: 'active', clinic_id: CLINIC_ID, doctor_id: 'doc-internal', access_code: '456789', created_at: new Date(Date.now() - 900000).toISOString(), note: null },
  { id: generateId(), name: 'Daisy', owner: 'Evan Peters', stage: 'surgery', status: 'active', clinic_id: CLINIC_ID, doctor_id: 'doc-onco', access_code: '567890', created_at: new Date(Date.now() - 4000000).toISOString(), note: null },
  { id: generateId(), name: 'Rocky', owner: 'Fiona Apple', stage: 'pre-op', status: 'active', clinic_id: CLINIC_ID, doctor_id: 'doc-onco', access_code: '678901', created_at: new Date(Date.now() - 5000000).toISOString(), note: null },
  { id: generateId(), name: 'Molly', owner: 'George Lucas', stage: 'checked-in', status: 'active', clinic_id: CLINIC_ID, doctor_id: 'doc-onco', access_code: '789012', created_at: new Date(Date.now() - 600000).toISOString(), note: null },
  { id: generateId(), name: 'Buddy', owner: 'Ian McKellen', stage: 'surgery', status: 'active', clinic_id: CLINIC_ID, doctor_id: 'doc-surg', access_code: '901234', created_at: new Date(Date.now() - 1000000).toISOString(), note: null }
];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const dispatchUpdate = (id?: string) => {
  window.dispatchEvent(new CustomEvent('vettrack:update', { detail: { id } }));
};

const dispatchPatientUpdate = (id: string) => {
  window.dispatchEvent(new CustomEvent('vettrack:patientUpdated', { detail: { id } }));
};

const getLocalData = (): Patient[] => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_DATA));
    return INITIAL_DATA;
  }
  try {
    const patients = JSON.parse(stored) as Patient[];
    
    // Data Hygiene Migration
    let hasChanges = false;
    const migratedPatients = patients.map(p => {
      let changed = false;
      const newP = { ...p };

      if (newP.clinic_id !== CLINIC_ID) {
        newP.clinic_id = CLINIC_ID;
        changed = true;
      }
      
      if (!newP.status) {
        newP.status = 'active';
        changed = true;
      }

      // Cleanup whitespace or legacy notes to null
      if (newP.note !== null && typeof newP.note === 'string' && newP.note.trim() === "") {
        newP.note = null;
        changed = true;
      }

      if (changed) hasChanges = true;
      return newP;
    });

    if (hasChanges) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migratedPatients));
      return migratedPatients;
    }
    
    return patients;
  } catch (error) {
    console.error('Failed to parse local data:', error);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_DATA));
    return INITIAL_DATA;
  }
};

const setLocalData = (data: Patient[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

export const api = {
  login: async (pin: string): Promise<Doctor | null> => {
    if (USE_SUPABASE) {
      try {
        const { data, error } = await supabase!
          .from('doctors')
          .select('*')
          .eq('clinic_id', CLINIC_ID)
          .eq('pin', pin)
          .maybeSingle();

        if (error) return null;
        return (data as Doctor) || null;
      } catch (err) {
        return null;
      }
    }
    await delay(300);
    return DOCTORS.find(d => d.pin === pin) || null;
  },

  getPatientForClient: async (id: string, code: string): Promise<Patient | null> => {
    if (USE_SUPABASE) {
      try {
        const { data, error } = await supabase!
          .from('patients')
          .select('*')
          .eq('id', id)
          .eq('access_code', code)
          .eq('clinic_id', CLINIC_ID)
          .maybeSingle();

        if (error) return null;
        return (data as Patient) || null;
      } catch (err) {
        return null;
      }
    }
    await delay(400);
    const patients = getLocalData();
    return patients.find(p => p.id === id && p.access_code === code && p.clinic_id === CLINIC_ID) || null;
  },

  loginPatientWithId: async (id: string, code: string): Promise<Patient | null> => {
    return api.getPatientForClient(id, code);
  },

  getPatients: async (doctorId: string): Promise<Patient[]> => {
    if (USE_SUPABASE) {
      try {
        const { data, error } = await supabase!
          .from('patients')
          .select('*')
          .eq('clinic_id', CLINIC_ID)
          .eq('doctor_id', doctorId)
          .order('updated_at', { ascending: false });
        
        if (error) return [];
        return (data || []) as Patient[];
      } catch (err) {
        return [];
      }
    }
    await delay(400); 
    const allPatients = getLocalData();
    return allPatients.filter(p => p.doctor_id === doctorId && p.clinic_id === CLINIC_ID);
  },

  createPatient: async (patient: Partial<Patient>, doctorId: string): Promise<Patient | null> => {
    const newPatient: Patient = {
      id: generateId(),
      name: patient.name || 'Unknown',
      owner: patient.owner || 'Unknown',
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
      try {
        const { data, error } = await supabase!
          .from('patients')
          .insert([newPatient])
          .select('*')
          .single();

        if (error) return null;
        const created = data as Patient;
        dispatchUpdate(created.id);
        dispatchPatientUpdate(created.id);
        return created;
      } catch (err) {
        return null;
      }
    }
    await delay(500);
    const patients = getLocalData();
    setLocalData([newPatient, ...patients]);
    dispatchUpdate(newPatient.id);
    dispatchPatientUpdate(newPatient.id);
    return newPatient;
  },

  updateStage: async (id: string, stage: StageId, doctorId: string, note?: string): Promise<void> => {
    const cleanNote = note?.trim() || null;

    if (USE_SUPABASE) {
      try {
        const { data: current, error: fetchErr } = await supabase!
          .from('patients')
          .select('stage, stage_history')
          .eq('id', id)
          .eq('clinic_id', CLINIC_ID)
          .single();

        if (fetchErr) return;

        let history = (current.stage_history || []) as PatientStageEvent[];
        if (current.stage !== stage) {
          const event: PatientStageEvent = {
            from_stage: current.stage,
            to_stage: stage,
            changed_at: new Date().toISOString(),
            changed_by_doctor_id: doctorId
          };
          history = [event, ...history].slice(0, 10);
        }

        const { error: updateErr } = await supabase!
          .from('patients')
          .update({
            stage,
            note: cleanNote,
            updated_at: new Date().toISOString(),
            updated_by_doctor_id: doctorId,
            stage_history: history
          })
          .eq('id', id)
          .eq('clinic_id', CLINIC_ID);

        if (updateErr) return;

        dispatchUpdate(id);
        dispatchPatientUpdate(id);
        return;
      } catch (err) {
        return;
      }
    }

    await delay(300);
    const patients = getLocalData();
    const updatedPatients = patients.map(p => {
      if (p.id !== id) return p;

      let history = p.stage_history || [];
      if (p.stage !== stage) {
          const event: PatientStageEvent = {
              from_stage: p.stage,
              to_stage: stage,
              changed_at: new Date().toISOString(),
              changed_by_doctor_id: doctorId
          };
          history = [event, ...history].slice(0, 10);
      }

      return { 
        ...p, 
        stage, 
        note: cleanNote, 
        updated_at: new Date().toISOString(), 
        updated_by_doctor_id: doctorId,
        stage_history: history
      };
    });
    setLocalData(updatedPatients);
    dispatchUpdate(id);
    dispatchPatientUpdate(id);
  },

  dischargePatient: async (id: string, doctorId: string): Promise<void> => {
    if (USE_SUPABASE) {
      try {
        const { error } = await supabase!
          .from('patients')
          .update({
            status: 'discharged',
            updated_at: new Date().toISOString(),
            updated_by_doctor_id: doctorId
          })
          .eq('id', id)
          .eq('clinic_id', CLINIC_ID);

        if (error) return;
        dispatchUpdate(id);
        dispatchPatientUpdate(id);
        return;
      } catch (err) {
        return;
      }
    }
    await delay(300);
    const patients = getLocalData();
    const updatedPatients = patients.map(p => 
      p.id === id 
        ? { ...p, status: 'discharged' as const, updated_at: new Date().toISOString(), updated_by_doctor_id: doctorId }
        : p
    );
    setLocalData(updatedPatients);
    dispatchUpdate(id);
    dispatchPatientUpdate(id);
  },

  deletePatient: async (id: string): Promise<void> => {
    await delay(300);
    const patients = getLocalData();
    const filtered = patients.filter(p => p.id !== id);
    setLocalData(filtered);
    dispatchUpdate(id);
    dispatchPatientUpdate(id);
  },

  getAllPatients: async (): Promise<Patient[]> => {
    await delay(300);
    const allPatients = getLocalData();
    return allPatients.filter(p => p.clinic_id === CLINIC_ID);
  },

  resetDemoData: async (): Promise<void> => {
    await delay(500);
    localStorage.removeItem(STORAGE_KEY);
    getLocalData();
    dispatchUpdate();
  }
};