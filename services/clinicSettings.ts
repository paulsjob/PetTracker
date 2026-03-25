import { CLINIC_CONFIG, CLINIC_ID } from '../constants';
import { supabase } from './supabase';

export interface ClinicContactSettings {
  name: string;
  phone: string;
  supportPhoneNumber: string;
  hours: string;
  email: string;
  enableSmsNotifications: boolean;
  brandColor: string;
  logoUrl: string;
}

const STORAGE_PREFIX = 'pettracker:clinic-contact-settings';
const UPDATE_EVENT = 'pettracker:clinic-contact-updated';
const CLINIC_SETTINGS_TABLE = 'clinic_settings';
const CLINIC_ASSETS_BUCKET = 'clinic_assets';
const DEFAULT_BRAND_COLOR = '#4f46e5';

const DEFAULT_SETTINGS: ClinicContactSettings = {
  name: CLINIC_CONFIG.name,
  phone: CLINIC_CONFIG.phone,
  supportPhoneNumber: CLINIC_CONFIG.phone,
  hours: CLINIC_CONFIG.hours,
  email: CLINIC_CONFIG.email,
  enableSmsNotifications: true,
  brandColor: DEFAULT_BRAND_COLOR,
  logoUrl: '',
};

const getStorageKey = (clinicId: string) => `${STORAGE_PREFIX}:${clinicId}`;

const normalizeClinicContactSettings = (settings?: Partial<ClinicContactSettings>): ClinicContactSettings => ({
  name: settings?.name?.trim() || DEFAULT_SETTINGS.name,
  phone: settings?.supportPhoneNumber?.trim() || settings?.phone?.trim() || DEFAULT_SETTINGS.phone,
  supportPhoneNumber: settings?.supportPhoneNumber?.trim() || settings?.phone?.trim() || DEFAULT_SETTINGS.supportPhoneNumber,
  hours: settings?.hours?.trim() || DEFAULT_SETTINGS.hours,
  email: settings?.email?.trim() || DEFAULT_SETTINGS.email,
  enableSmsNotifications: settings?.enableSmsNotifications ?? DEFAULT_SETTINGS.enableSmsNotifications,
  brandColor: /^#[0-9A-F]{6}$/i.test(settings?.brandColor || '') ? (settings?.brandColor as string) : DEFAULT_SETTINGS.brandColor,
  logoUrl: settings?.logoUrl?.trim() || '',
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
      .select('name, phone, hours, email, support_phone_number, enable_sms_notifications, brand_color, logo_url')
      .eq('clinic_id', clinicId)
      .maybeSingle();

    if (error || !data) return readLocalSettings(clinicId);
    return writeLocalSettings(clinicId, normalizeClinicContactSettings({
      ...data,
      supportPhoneNumber: data.support_phone_number ?? data.phone,
      enableSmsNotifications: data.enable_sms_notifications,
      brandColor: data.brand_color,
      logoUrl: data.logo_url,
    }));
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
          name: normalized.name,
          phone: normalized.supportPhoneNumber,
          support_phone_number: normalized.supportPhoneNumber,
          hours: normalized.hours,
          email: normalized.email,
          enable_sms_notifications: normalized.enableSmsNotifications,
          brand_color: normalized.brandColor,
          logo_url: normalized.logoUrl || null,
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

export const uploadClinicLogo = async (
  file: File,
  clinicId: string = CLINIC_ID,
): Promise<{ publicUrl: string; path: string }> => {
  if (!supabase) throw new Error('Supabase is not configured');

  const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
  const sanitizedExtension = extension.replace(/[^a-z0-9]/g, '') || 'png';
  const path = `${clinicId}/logo-${Date.now()}.${sanitizedExtension}`;

  const { error: uploadError } = await supabase.storage
    .from(CLINIC_ASSETS_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: true, contentType: file.type || undefined });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(CLINIC_ASSETS_BUCKET).getPublicUrl(path);
  return { publicUrl: data.publicUrl, path };
};

export const DEFAULT_CLINIC_BRAND_COLOR = DEFAULT_BRAND_COLOR;

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
