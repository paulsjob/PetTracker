import { CLINIC_CONFIG, CLINIC_ID } from '../constants';
import { supabase } from './supabase';

export interface ClinicContactSettings {
  name: string;
  phone: string;
  hours: string;
  email: string;
}

const STORAGE_PREFIX = 'pettracker:clinic-contact-settings';
const UPDATE_EVENT = 'pettracker:clinic-contact-updated';
const CLINIC_SETTINGS_TABLE = 'clinic_settings';

const DEFAULT_SETTINGS: ClinicContactSettings = {
  name: CLINIC_CONFIG.name,
  phone: CLINIC_CONFIG.phone,
  hours: CLINIC_CONFIG.hours,
  email: CLINIC_CONFIG.email,
};

const getStorageKey = (clinicId: string) => `${STORAGE_PREFIX}:${clinicId}`;

const normalizeClinicContactSettings = (settings?: Partial<ClinicContactSettings>): ClinicContactSettings => ({
  name: settings?.name?.trim() || DEFAULT_SETTINGS.name,
  phone: settings?.phone?.trim() || DEFAULT_SETTINGS.phone,
  hours: settings?.hours?.trim() || DEFAULT_SETTINGS.hours,
  email: settings?.email?.trim() || DEFAULT_SETTINGS.email,
});

const readLocalSettings = (clinicId: string): ClinicContactSettings => {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;

  try {
    const raw = window.localStorage.getItem(getStorageKey(clinicId));
    if (!raw) return DEFAULT_SETTINGS;
    return normalizeClinicContactSettings(JSON.parse(raw) as Partial<ClinicContactSettings>);
  } catch {
    return DEFAULT_SETTINGS;
  }
};

const writeLocalSettings = (clinicId: string, settings: ClinicContactSettings): ClinicContactSettings => {
  const normalized = normalizeClinicContactSettings(settings);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(getStorageKey(clinicId), JSON.stringify(normalized));
  }
  return normalized;
};

const dispatchSettingsUpdate = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
};

export const getClinicContactSettings = (clinicId: string = CLINIC_ID): ClinicContactSettings => readLocalSettings(clinicId);

export const loadClinicContactSettings = async (clinicId: string = CLINIC_ID): Promise<ClinicContactSettings> => {
  if (!supabase) return readLocalSettings(clinicId);

  try {
    const { data, error } = await supabase
      .from(CLINIC_SETTINGS_TABLE)
      .select('name, phone, hours, email')
      .eq('clinic_id', clinicId)
      .maybeSingle();

    if (error || !data) return readLocalSettings(clinicId);

    return writeLocalSettings(clinicId, normalizeClinicContactSettings(data));
  } catch {
    return readLocalSettings(clinicId);
  }
};

export const saveClinicContactSettings = async (
  settings: ClinicContactSettings,
  clinicId: string = CLINIC_ID,
): Promise<{ settings: ClinicContactSettings; source: 'remote' | 'local' }> => {
  const normalized = writeLocalSettings(clinicId, settings);

  if (!supabase) {
    dispatchSettingsUpdate();
    return { settings: normalized, source: 'local' };
  }

  try {
    const { error } = await supabase
      .from(CLINIC_SETTINGS_TABLE)
      .upsert(
        {
          clinic_id: clinicId,
          ...normalized,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'clinic_id' },
      );

    dispatchSettingsUpdate();
    if (error) return { settings: normalized, source: 'local' };
    return { settings: normalized, source: 'remote' };
  } catch {
    dispatchSettingsUpdate();
    return { settings: normalized, source: 'local' };
  }
};

export const subscribeToClinicContactSettings = (
  clinicId: string,
  onUpdate: (settings: ClinicContactSettings) => void,
): (() => void) => {
  if (!supabase) return () => {};

  const channel = supabase
    .channel(`clinic-settings-${clinicId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: CLINIC_SETTINGS_TABLE,
        filter: `clinic_id=eq.${clinicId}`,
      },
      async () => {
        onUpdate(await loadClinicContactSettings(clinicId));
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

export const clinicContactUpdateEvent = UPDATE_EVENT;
