import type { LucideIcon } from 'lucide-react';
import { STAGES } from './constants';

export type StageId = typeof STAGES[number]['id'];

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  pin: string;
}

export interface PatientStageEvent {
  from_stage: StageId | null;
  to_stage: StageId;
  changed_at: string;
  changed_by_doctor_id?: string;
}

export interface Patient {
  id: string; // UUID
  name: string;
  owner: string;
  phone?: string; // Optional/Deprecated for pilot
  stage: StageId;
  status: 'active' | 'discharged';
  clinic_id: string;
  doctor_id: string;
  access_code: string; // New 6-digit login code for patients
  created_at: string;
  updated_at?: string;
  updated_by_doctor_id?: string; // Audit field
  note?: string; // Short note from staff about the current stage
  stage_history?: PatientStageEvent[]; // Last 5 stage transitions
}

export interface StageConfig {
  id: StageId;
  label: string;
  color: string;
  textColor: string;
  icon: LucideIcon;
  description: string;
}

export type ViewState = 'landing' | 'staff-login' | 'staff-dashboard' | 'client-tracker' | 'patient-login';