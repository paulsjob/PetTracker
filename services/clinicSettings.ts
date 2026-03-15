import { CLINIC_CONFIG } from '../constants';

export interface ClinicContactSettings {
  name: string;
  phone: string;
  hours: string;
  email: string;
}

const STORAGE_KEY = 'pettracker:clinic-contact-settings';
const UPDATE_EVENT = 'pettracker:clinic-contact-updated';

const DEFAULT_SETTINGS: ClinicContactSettings = {
  name: CLINIC_CONFIG.name,
  phone: CLINIC_CONFIG.phone,
  hours: CLINIC_CONFIG.hours,
  email: CLINIC_CONFIG.email,
};

export const getClinicContactSettings = (): ClinicContactSettings => {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;

    const parsed = JSON.parse(raw) as Partial<ClinicContactSettings>;
    return {
      name: parsed.name?.trim() || DEFAULT_SETTINGS.name,
      phone: parsed.phone?.trim() || DEFAULT_SETTINGS.phone,
      hours: parsed.hours?.trim() || DEFAULT_SETTINGS.hours,
      email: parsed.email?.trim() || DEFAULT_SETTINGS.email,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const setClinicContactSettings = (settings: ClinicContactSettings): void => {
  if (typeof window === 'undefined') return;

  const normalized: ClinicContactSettings = {
    name: settings.name.trim(),
    phone: settings.phone.trim(),
    hours: settings.hours.trim(),
    email: settings.email.trim(),
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
};

export const clinicContactUpdateEvent = UPDATE_EVENT;
