import React, { useEffect, useState, useRef } from 'react';
import { Patient } from '../types';
import { STAGES, CLINIC_CONFIG } from '../constants';
import { api } from '../services/api';
import { RefreshCw, ArrowLeft, Phone, Calendar, CheckCircle, LogOut, Archive, MessageCircle, Clock, Mail } from 'lucide-react';

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
      if (!data) {
        onLogout();
        return;
      }
      setPatient(data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to fetch patient status:', err);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  };

  useEffect(() => {
    fetchStatus();
    const intervalId = window.setInterval(fetchStatus, 15000);
    const handlePatientUpdate = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      if (detail?.id === patientId) {
         fetchStatus();
      }
    };
    window.addEventListener('vettrack:patientUpdated', handlePatientUpdate);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('vettrack:patientUpdated', handlePatientUpdate);
    };
  }, [patientId]);

  if (loading && !patient) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-gray-500">
        <RefreshCw className="w-8 h-8 animate-spin mb-2 text-indigo-500" />
        <p>Locating patient records...</p>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="text-center py-12">
        <div className="bg-red-50 text-red-600 p-6 rounded-xl max-w-md mx-auto">
          <h3 className="text-xl font-bold mb-2">Record Not Found</h3>
          <p className="mb-4">We couldn't find a patient with that ID. Please check the code provided by the clinic.</p>
          <button 
            onClick={onLogout}
            className="text-indigo-600 hover:text-indigo-800 font-medium flex items-center justify-center gap-2 mx-auto"
          >
            <ArrowLeft size={16} /> Go Home
          </button>
        </div>
      </div>
    );
  }

  const currentStageIndex = STAGES.findIndex(s => s.id === patient.stage);
  const currentStageConfig = STAGES[currentStageIndex];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden mb-8">
        <div className="bg-indigo-600 p-6 text-white">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl font-bold">{patient.name}</h1>
                {patient.status === 'discharged' && (
                  <span className="bg-orange-500/90 text-white text-xs px-2 py-1 rounded font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm border border-white/20">
                    <Archive size={10} /> Discharged
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 opacity-90">
                <span className="bg-indigo-500 px-3 py-1 rounded-full text-sm font-medium">
                  {patient.owner}'s Pet
                </span>
                <span className="text-sm flex items-center gap-1">
                  <Calendar size={14} />
                  {new Date(patient.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
            <button 
              onClick={onLogout}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg transition-all text-sm font-medium border border-white/10"
            >
              <LogOut size={16} />
              <span>Logout</span>
            </button>
          </div>
        </div>
        
        <div className="p-8 text-center">
          <div className={`inline-flex p-4 rounded-full ${currentStageConfig?.color} text-white mb-4 shadow-lg scale-110 transition-all duration-500`}>
            {currentStageConfig && <currentStageConfig.icon size={48} strokeWidth={1.5} />}
          </div>
          <h2 className={`text-4xl font-bold mb-2 ${currentStageConfig?.textColor}`}>
            {currentStageConfig?.label}
          </h2>
          <p className="text-xl text-gray-600 max-w-lg mx-auto leading-relaxed">
            {currentStageConfig?.description}
          </p>
          
          <div className="mt-8 flex flex-col items-center gap-1">
            <div className="text-sm font-semibold text-gray-700 bg-gray-50 px-4 py-1.5 rounded-full border border-gray-100 flex flex-col md:flex-row items-center gap-1 md:gap-2">
               <span>Last status update: {patient.updated_at ? new Date(patient.updated_at).toLocaleString(undefined, {
                 weekday: 'short', hour: 'numeric', minute: '2-digit'
               }) : 'N/A'}</span>
            </div>
            <p className="text-xs text-gray-400">Time shown is when your pet’s status last changed.</p>
            <div className="text-xs text-gray-300 flex items-center gap-1 mt-1">
               <RefreshCw size={10} />
               Refreshed: {lastUpdated.toLocaleTimeString()}
            </div>
          </div>
        </div>
      </div>

      <div className="hidden md:block bg-white rounded-2xl shadow-xl p-8 mb-8">
        <div className="relative flex justify-between">
          <div className="absolute top-8 left-0 w-full h-1 bg-slate-100 -z-10 rounded-full"></div>
          <div 
            className="absolute top-8 left-0 h-1 bg-indigo-500 -z-10 transition-all duration-700 rounded-full"
            style={{ width: `${(currentStageIndex / (STAGES.length - 1)) * 100}%` }}
          ></div>

          {STAGES.map((stage, index) => {
            const isActive = index === currentStageIndex;
            const isCompleted = index < currentStageIndex;
            const Icon = stage.icon;

            return (
              <div key={stage.id} className="flex flex-col items-center group">
                <div 
                  className={`
                    w-16 h-16 rounded-full flex items-center justify-center border-4 transition-all duration-500 z-10
                    ${isActive 
                      ? `${stage.color} border-white shadow-xl scale-110` 
                      : isCompleted 
                        ? 'bg-indigo-500 border-white text-white' 
                        : 'bg-white border-slate-100 text-slate-300'
                    }
                  `}
                >
                  <Icon size={24} />
                </div>
                <div className={`mt-4 font-semibold text-sm transition-colors duration-300 ${isActive || isCompleted ? 'text-gray-800' : 'text-gray-400'}`}>
                  {stage.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="md:hidden space-y-3 mb-8">
        {STAGES.map((stage, index) => {
          const isActive = index === currentStageIndex;
          const isCompleted = index < currentStageIndex;
          const Icon = stage.icon;

          return (
            <div 
              key={stage.id} 
              className={`
                flex items-center p-4 rounded-xl border-l-4 transition-all duration-300
                ${isActive 
                  ? 'bg-white shadow-lg border-indigo-500 scale-105 z-10' 
                  : 'bg-white/50 border-transparent opacity-80'
                }
              `}
            >
              <div 
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center mr-4 shrink-0
                  ${isActive ? `${stage.color} text-white` : isCompleted ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}
                `}
              >
                <Icon size={20} />
              </div>
              <div className="flex-1">
                <h3 className={`font-bold ${isActive ? 'text-gray-900' : 'text-gray-500'}`}>{stage.label}</h3>
                {isActive && <p className="text-xs text-gray-500 mt-1">{stage.description}</p>}
              </div>
              {isCompleted && (
                <div className="text-indigo-500">
                  <CheckCircle size={20} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="text-center text-gray-500 text-sm py-4">
        <p className="mb-3">Need assistance? Contact {CLINIC_CONFIG.name}.</p>
        <div className="flex flex-col gap-2 items-center">
          <div className="flex items-center justify-center gap-2 font-medium text-indigo-600">
            <Phone size={14} /> {CLINIC_CONFIG.phone}
          </div>
          {CLINIC_CONFIG.sms && (
            <div className="flex items-center justify-center gap-2 text-slate-600">
              <MessageCircle size={14} /> Text: {CLINIC_CONFIG.sms}
            </div>
          )}
          {CLINIC_CONFIG.email && (
            <div className="flex items-center justify-center gap-2 text-slate-600">
              <Mail size={14} /> {CLINIC_CONFIG.email}
            </div>
          )}
          <div className="flex items-center justify-center gap-2 text-slate-400 text-xs mt-1">
            <Clock size={12} /> {CLINIC_CONFIG.hours}
          </div>
        </div>
      </div>
    </div>
  );
};