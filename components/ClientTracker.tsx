import React, { useEffect, useState, useRef } from 'react';
import { Patient } from '../types';
import { STAGES, CLINIC_CONFIG, CLINIC_ID } from '../constants';
import { api } from '../services/api';
import { RefreshCw, CheckCircle, Phone, Mail, Clock, PawPrint, Check } from 'lucide-react';
import {
  DEFAULT_CLINIC_BRAND_COLOR,
  clinicContactUpdateEvent,
  getClinicContactSettings,
  loadClinicContactSettings,
  subscribeToClinicContactSettings,
} from '../services/clinicSettings';
import { supabase } from '../services/supabase';

interface ClientTrackerProps {
  patientId: string;
  accessCode: string;
  onLogout: () => void;
}

export const ClientTracker: React.FC<ClientTrackerProps> = ({ patientId, accessCode, onLogout }) => {
  const stageThemeMap: Record<string, { icon: string; glow: string }> = {
    'checked-in': { icon: 'text-blue-500', glow: 'bg-blue-50' },
    'doctor-eval': { icon: 'text-purple-600', glow: 'bg-purple-50' },
    'pre-op': { icon: 'text-amber-500', glow: 'bg-amber-50' },
    surgery: { icon: 'text-red-500', glow: 'bg-red-50' },
    recovery: { icon: 'text-orange-500', glow: 'bg-orange-50' },
    ready: { icon: 'text-green-500', glow: 'bg-green-50' },
    discharged: { icon: 'text-green-500', glow: 'bg-green-50' },
  };
  const stageSolidColorMap: Record<string, string> = {
    'checked-in': 'bg-blue-500',
    'doctor-eval': 'bg-purple-600',
    'pre-op': 'bg-amber-500',
    surgery: 'bg-red-500',
    recovery: 'bg-orange-500',
    ready: 'bg-green-500',
    discharged: 'bg-green-500',
  };

  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [connectionBanner, setConnectionBanner] = useState<string | null>(null);
  const [clinicContact, setClinicContact] = useState(getClinicContactSettings(CLINIC_ID));
  const fetchingRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const isRealtimeClosedForDischarge = patient?.status === 'discharged' || patient?.status === 'archived' || patient?.stage === 'discharged';

  const fetchStatus = async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const data = await api.getPatientForClient(patientId, accessCode);
      if (!data) { onLogout(); return; }
      setPatient(data);
      setLastUpdated(new Date());
    } catch (err) { console.error('Failed to fetch status:', err);
    } finally { setLoading(false); fetchingRef.current = false; }
  };

  useEffect(() => {
    fetchStatus();
    if (isRealtimeClosedForDischarge) return;
    const intervalId = window.setInterval(fetchStatus, 15000);
    return () => window.clearInterval(intervalId);
  }, [patientId, accessCode, isRealtimeClosedForDischarge]);

  useEffect(() => {
    if (!supabase || !patientId || !accessCode) return;
    if (isRealtimeClosedForDischarge) {
      setConnectionBanner(null);
      return;
    }

    let isActive = true;
    let currentChannel: ReturnType<typeof supabase.channel> | null = null;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const subscribeToUpdates = () => {
      if (!isActive) return;
      clearReconnectTimer();

      currentChannel = supabase
        .channel(`parent-patient-${patientId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'patients',
            filter: `id=eq.${patientId},access_code=eq.${accessCode}`,
          },
          () => {
            void fetchStatus();
          },
        )
        .subscribe((status) => {
          if (!isActive) return;
          if (status === 'SUBSCRIBED') {
            setConnectionBanner(null);
            return;
          }

          if (status === 'TIMED_OUT' || status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            setConnectionBanner('Connection lost. Trying to reconnect…');
            clearReconnectTimer();
            reconnectTimerRef.current = window.setTimeout(async () => {
              if (!isActive) return;
              if (currentChannel) {
                await supabase.removeChannel(currentChannel);
                currentChannel = null;
              }
              subscribeToUpdates();
            }, 2000);
          }
        });
    };

    subscribeToUpdates();

    return () => {
      isActive = false;
      clearReconnectTimer();
      if (currentChannel) void supabase.removeChannel(currentChannel);
    };
  }, [patientId, accessCode, isRealtimeClosedForDischarge]);

  useEffect(() => {
    let isMounted = true;

    const refreshClinicContact = async () => {
      const nextSettings = await loadClinicContactSettings(CLINIC_ID);
      if (isMounted) setClinicContact(nextSettings);
    };

    refreshClinicContact();

    const handleContactUpdate = () => {
      void refreshClinicContact();
    };

    const unsubscribe = subscribeToClinicContactSettings(CLINIC_ID, (settings) => {
      if (isMounted) setClinicContact(settings);
    });

    window.addEventListener(clinicContactUpdateEvent, handleContactUpdate);
    window.addEventListener('storage', handleContactUpdate);

    return () => {
      isMounted = false;
      unsubscribe();
      window.removeEventListener(clinicContactUpdateEvent, handleContactUpdate);
      window.removeEventListener('storage', handleContactUpdate);
    };
  }, []);

  if (loading && !patient) return (
    <div className="flex min-h-[58vh] flex-col items-center justify-center gap-4 text-slate-500">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200">
        <RefreshCw className="h-6 w-6 animate-spin text-slate-500" />
      </div>
      <p className="text-sm tracking-wide text-slate-500">Preparing your pet’s latest update…</p>
    </div>
  );
  if (!patient) return <div className="text-center py-12">No record found.</div>;

  const isDischarged = patient.status === 'discharged' || patient.status === 'archived' || patient.stage === 'discharged';
  const timelineStages = STAGES;
  const resolvedStageId = patient.stage === 'discharged' ? 'ready' : patient.stage;
  const currentStageIndex = Math.max(timelineStages.findIndex((stage) => stage.id === resolvedStageId), 0);
  const currentStageConfig = timelineStages[currentStageIndex];
  const currentStageTheme = stageThemeMap[patient.stage] || stageThemeMap[resolvedStageId] || stageThemeMap['checked-in'];
  const brandColor = /^#[0-9A-F]{6}$/i.test(clinicContact.brandColor) ? clinicContact.brandColor : DEFAULT_CLINIC_BRAND_COLOR;
  const hasLogo = !!clinicContact.logoUrl;

  return (
    <div className="mx-auto max-w-4xl">
      {connectionBanner && (
        <div className="mb-4 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-800 shadow-sm">
          {connectionBanner}
        </div>
      )}

      {isDischarged && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {patient.name} has been discharged and is safely at home. Live updates are intentionally paused for this archived visit.
        </div>
      )}

      <div className="mb-8 overflow-hidden rounded-[1.8rem] border border-slate-200/80 bg-white shadow-[0_20px_65px_rgba(15,23,42,0.08)]">
        <div className="flex items-start justify-between p-7 text-white" style={{ backgroundColor: brandColor }}>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{patient.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-medium">{patient.owner}'s Pet</span>
            </div>
          </div>
          <button onClick={onLogout} className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20">Logout</button>
        </div>
        
        <div className="p-12 text-center md:p-14">
          <div className={`mb-7 inline-flex scale-110 rounded-full p-6 shadow-lg ${currentStageTheme.glow}`}>
            {isDischarged ? <CheckCircle className={currentStageTheme.icon} size={56} strokeWidth={1.5} /> : <currentStageConfig.icon className={currentStageTheme.icon} size={56} strokeWidth={1.5} />}
          </div>
          <h2 className={`mb-3 text-4xl font-semibold tracking-tight ${isDischarged ? 'text-emerald-700' : currentStageTheme.icon}`}>
            {isDischarged ? 'Officially Discharged' : currentStageConfig?.label}
          </h2>
          <p className="mx-auto max-w-2xl text-[1.08rem] leading-relaxed text-slate-600">
            {isDischarged 
              ? `${patient.name} has completed care and is safely back home. This tracker is now closed, and their visit has been archived. Thank you for trusting us with your pet's care.` 
              : currentStageConfig?.description}
          </p>
          <div className="mt-8 flex items-center justify-center gap-1 text-xs text-slate-400">
             <RefreshCw size={10} /> Refreshed: {lastUpdated.toLocaleTimeString()}
          </div>
        </div>

        <div className="border-t border-slate-100 px-4 pb-6">
          <div className="overflow-x-auto overflow-y-hidden py-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className="min-w-[720px] w-max mx-auto px-2 pt-2">
              <div className="flex items-start justify-center">
                {timelineStages.map((stage, index) => {
                  const isCompleted = index < currentStageIndex;
                  const isCurrent = index === currentStageIndex;
                  const isFuture = index > currentStageIndex;
                  const stageSolidColor = stageSolidColorMap[stage.id] || 'bg-blue-500';
                  return (
                    <React.Fragment key={stage.id}>
                      <div className="flex flex-col items-center">
                        <p className="mb-3 whitespace-nowrap text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          {stage.label}
                        </p>
                        <div className="relative flex h-5 w-5 items-center justify-center">
                          {isCurrent ? <span className={`absolute h-8 w-8 rounded-full ${stageSolidColor} opacity-30 animate-ping`} /> : null}
                          <div
                            className={`relative z-10 flex h-5 w-5 items-center justify-center rounded-full ${
                              isFuture ? 'bg-gray-200' : stageSolidColor
                            }`}
                          >
                            {isCompleted ? <Check size={10} strokeWidth={3} className="text-white" /> : null}
                            {isCurrent ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                          </div>
                        </div>
                      </div>
                      {index < timelineStages.length - 1 ? (
                        <div className="flex-1 px-1 pt-[1.625rem]">
                          <div className="h-[2px] bg-gray-200" />
                        </div>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="text-center text-gray-500 text-sm py-4">
        <div className="mb-4 flex justify-center">
          {hasLogo ? (
            <img src={clinicContact.logoUrl} alt={`${clinicContact.name || CLINIC_CONFIG.name} logo`} className="h-14 w-14 rounded-xl border border-slate-200 bg-white object-contain p-1" />
          ) : (
            <div className="h-14 w-14 rounded-xl border border-indigo-100 bg-indigo-50 flex items-center justify-center">
              <PawPrint className="text-indigo-600" size={24} />
            </div>
          )}
        </div>
        <p className="mb-3">Need assistance? Contact {clinicContact.name || CLINIC_CONFIG.name}.</p>
        <div className="flex flex-col gap-2 items-center">
          <div className="flex items-center justify-center gap-2 font-medium" style={{ color: brandColor }}>
            <Phone size={14} /> {clinicContact.phone || CLINIC_CONFIG.phone}
          </div>
          {!!clinicContact.email && (
            <div className="flex items-center justify-center gap-2 text-slate-500 text-xs">
              <Mail size={12} /> {clinicContact.email}
            </div>
          )}
          <div className="flex items-center justify-center gap-2 text-slate-400 text-xs mt-1">
            <Clock size={12} /> {clinicContact.hours || CLINIC_CONFIG.hours}
          </div>
        </div>
      </div>
    </div>
  );
};
