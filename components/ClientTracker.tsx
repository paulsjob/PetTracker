import React, { useEffect, useState, useRef } from 'react';
import { Patient } from '../types';
import { STAGES, CLINIC_CONFIG } from '../constants';
import { api } from '../services/api';
import { RefreshCw, ArrowLeft, Archive, CheckCircle, Phone, Calendar, MessageCircle, Mail, Clock } from 'lucide-react';

interface ClientTrackerProps {
  patientId: string;
  accessCode: string;
  onLogout: () => void;
}

export const ClientTracker: React.FC<ClientTrackerProps> = ({ patientId, accessCode, onLogout }) => {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
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

  if (loading && !patient) return <div className="flex flex-col items-center justify-center min-h-[50vh] text-gray-500"><RefreshCw className="w-8 h-8 animate-spin text-indigo-500" /></div>;
  if (!patient) return <div className="text-center py-12">No record found.</div>;

  // LOGIC: If discharged, show final state instead of the current stage
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
              ? `${patient.name} has been discharged and is ready to head home with you! Thank you for trusting us with your pet's care.` 
              : currentStageConfig?.description}
          </p>
          <div className="mt-8 text-xs text-gray-300 flex items-center justify-center gap-1">
             <RefreshCw size={10} /> Refreshed: {lastUpdated.toLocaleTimeString()}
          </div>
        </div>
      </div>
      {/* Contact details omitted for brevity */}
    </div>
  );
};
