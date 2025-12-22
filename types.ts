export type StageId = 'checked-in' | 'doctor-eval' | 'pre-op' | 'surgery' | 'recovery' | 'ready';

export interface PatientStageEvent {
  from_stage: StageId;
  to_stage: StageId;
  changed_at: string;
  changed_by_doctor_id: string;
}

export interface Patient {
  id: string;
  name: string;
  owner: string;
  owner_phone?: string | null;
  stage: StageId;
  status: 'active' | 'discharged';
  clinic_id: string;
  doctor_id: string;
  access_code: string;
  created_at: string;
  updated_at?: string;
  updated_by_doctor_id?: string;
  stage_history?: PatientStageEvent[];
  note?: string | null;
}

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  pin: string;
  clinic_id?: string;
  // NEW FIELDS TO FIX BUILD ERRORS
  is_admin: boolean;
  is_active: boolean;
  email?: string | null;
}

export type ViewState = 'landing' | 'staff-login' | 'patient-login' | 'staff-dashboard' | 'client-tracker';
