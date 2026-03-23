import React, { useEffect, useState, useRef } from 'react';
import { Patient } from '../types';
import { STAGES, CLINIC_CONFIG, CLINIC_ID } from '../constants';
import { api } from '../services/api';
import { RefreshCw, CheckCircle, Phone, Calendar, MessageCircle, Mail, Clock } from 'lucide-react';
import {
  clinicContactUpdateEvent,
  getClinicContactSettings,
  loadClinicContactSettings,
  subscribeToClinicContactSettings,
} from '../services/clinicSettings';

interface ClientTrackerProps {
  patientId: string;
  accessCode: string;
  onLogout: () => void;
}

export const ClientTracker: React.FC<ClientTrackerProps> = ({ patientId, accessCode, onLogout }) => {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [clinicContact, setClinicContact] = useState(getClinicContactSettings(CLINIC_ID));
  const fetchingRef = useRef(false);

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
    const intervalId = window.setInterval(fetchStatus, 15000);
    return () => window.clearInterval(intervalId);
  }, [patientId]);

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

  if (loading && !patient) return <div className="flex flex-col items-center justify-center min-h-[50vh] text-gray-500"><RefreshCw className="w-8 h-8 animate-spin text-indigo-500" /></div>;
  if (!patient) return <div className="text-center py-12">No record found.</div>;

  const isDischarged = patient.status === 'discharged';
  const currentStageIndex = STAGES.findIndex(s => s.id === patient.stage);
  const currentStageConfig = STAGES[currentStageIndex];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden mb-8">
        <div className="bg-indigo-600 p-6 text-white flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">{patient.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="bg-indigo-500 px-3 py-1 rounded-full text-sm font-medium">{patient.owner}'s Pet</span>
            </div>
          </div>
          <button onClick={onLogout} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm font-medium">Logout</button>
        </div>
        
        <div className="p-12 text-center">
          <div className={`inline-flex p-6 rounded-full mb-6 shadow-lg scale-110 ${isDischarged ? 'bg-emerald-500 text-white' : `${currentStageConfig?.color} text-white`}`}>
            {isDischarged ? <CheckCircle size={56} strokeWidth={1.5} /> : <currentStageConfig.icon size={56} strokeWidth={1.5} />}
          </div>
          <h2 className={`text-4xl font-extrabold mb-3 ${isDischarged ? 'text-emerald-600' : currentStageConfig?.textColor}`}>
            {isDischarged ? 'Officially Discharged' : currentStageConfig?.label}
          </h2>
          <p className="text-xl text-gray-600 max-w-lg mx-auto leading-relaxed italic">
            {isDischarged 
              ? `${patient.name} has completed care and is safely back home. This tracker is now closed, and their visit has been archived. Thank you for trusting us with your pet's care.` 
              : currentStageConfig?.description}
          </p>
          <div className="mt-8 text-xs text-gray-300 flex items-center justify-center gap-1">
             <RefreshCw size={10} /> Refreshed: {lastUpdated.toLocaleTimeString()}
          </div>
        </div>
      </div>

      <div className="text-center text-gray-500 text-sm py-4">
        <p className="mb-3">Need assistance? Contact {clinicContact.name || CLINIC_CONFIG.name}.</p>
        <div className="flex flex-col gap-2 items-center">
          <div className="flex items-center justify-center gap-2 font-medium text-indigo-600">
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
