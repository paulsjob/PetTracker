import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import { Patient, Doctor, StageId } from '../types';
import { STAGES } from '../constants';
import { 
  Plus, LogOut, Dog, Stethoscope, History, ChevronDown, ChevronUp, 
  Send, Loader2, User, Eye, Archive, Copy, Check, AlertTriangle, FileDown
} from 'lucide-react';

const ACTIVE_CLINIC_ID = 'local-demo-clinic';
const QUICK_NOTES = ["Doing well", "Vitals stable", "In progress", "Waking up", "Ready soon", "Call pending"];

interface StaffDashboardProps {
  onLogout: () => void;
  doctor: Doctor;
}

export const StaffDashboard: React.FC<StaffDashboardProps> = ({ onLogout, doctor }) => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [viewMode, setViewMode] = useState<'active' | 'discharged'>('active');
  const [sendingSms, setSendingSms] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [dischargeTarget, setDischargeTarget] = useState<Patient | null>(null);
  const [newPatient, setNewPatient] = useState({ name: '', owner: '', owner_phone: '' });
  const [notification, setNotification] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({});
  const [advancedOpen, setAdvancedOpen] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = async (options?: { silent?: boolean }) => {
    try {
      if (!supabase) return;
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('clinic_id', ACTIVE_CLINIC_ID)
        .eq('status', viewMode)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      const myPatients = (data || []).filter((p: Patient) => p.doctor_id === doctor.id);
      setPatients(myPatients as Patient[]);
    } catch (error) { if (!options?.silent) showNotification('Sync Error', 'error');
    }
  };

  useEffect(() => {
    loadData();
    const channel = supabase?.channel('patients-live').on('postgres_changes', { event: '*', schema: 'public', table: 'patients' }, () => loadData({ silent: true })).subscribe();
    return () => { if (channel) supabase?.removeChannel(channel); };
  }, [doctor.id, viewMode]);

  // NEW: Download Caseload as CSV
  const handleDownloadCSV = () => {
    const headers = "Name,Owner,Phone,Status,Last Stage,Access Code,Check-in Date\n";
    const rows = patients.map(p => `"${p.name}","${p.owner}","${p.owner_phone || ''}","${p.status}","${p.stage}","${p.access_code}","${p.created_at}"`).join("\n");
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `caseload_${viewMode}_${new Date().toISOString().split('T')[0]}.csv`);
    a.click();
    showNotification("CSV Download started");
  };

  const showNotification = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleCopyInvite = (patient: Patient) => {
    const link = `${window.location.origin}/?id=${patient.id}&code=${patient.access_code}`;
    const message = `Hello from PetTracker! Follow ${patient.name}'s status live here: \n\n${link}\n\nPatient ID: ${patient.id}\nAccess Code: ${patient.access_code}\n\nQuestions? Please contact PetTracker.io.`;
    navigator.clipboard.writeText(message);
    setCopiedId(patient.id);
    showNotification("Invite copied");
    setTimeout(() => setCopiedId(null), 3000);
  };

  const handleDischargeConfirm = async () => {
    if (!dischargeTarget) return;
    try {
      const { error } = await supabase.from('patients').update({ status: 'discharged', updated_at: new Date().toISOString() }).eq('id', dischargeTarget.id);
      if (error) throw error;
      setDischargeTarget(null);
      loadData();
      showNotification('Discharged successfully');
    } catch (error) { showNotification('Discharge failed', 'error'); }
  };

  const handleStatusUpdate = async (id: string, newStage: StageId) => {
    try {
      await api.updateStage(id, newStage, doctor.id, noteDrafts[id]);
      showNotification('Status updated');
      loadData({ silent: true });
    } catch (error) { showNotification('Update failed', 'error'); }
  };

  const CopyableInfo = ({ label, value, fieldKey }: { label: string, value: string, fieldKey: string }) => {
    const isCopied = copiedField === fieldKey;
    return (
      <div className="flex flex-col">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-0.5">{label}</span>
        <button onClick={() => { navigator.clipboard.writeText(value); setCopiedField(fieldKey); setTimeout(() => setCopiedField(null), 2000); }} className="flex items-center gap-2 group text-sm font-bold text-slate-700 hover:text-indigo-600 transition-colors">
          <span className="font-mono">{value}</span>
          {isCopied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} className="text-slate-300 group-hover:text-indigo-400" />}
        </button>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto pb-20 p-4">
      {/* Branded Discharge Modal Omitted for Brevity */}
      {notification && (
        <div className={`fixed top-4 right-4 px-6 py-4 rounded-lg shadow-xl z-50 text-white font-medium ${notification.type === 'success' ? 'bg-indigo-600' : 'bg-red-600'}`}>{notification.msg}</div>
      )}
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Stethoscope className="text-indigo-600"/> {doctor.name}</h1>
          <p className="text-indigo-600 font-medium">{doctor.specialty}</p>
        </div>
        <button onClick={onLogout} className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-lg font-medium hover:bg-slate-200 transition-colors border border-slate-100"><LogOut size={18} /> Logout</button>
      </div>
      
      {/* INTEGRATED TAB BAR & CSV BUTTON */}
      <div className="bg-white rounded-t-2xl border border-slate-100 p-2 flex justify-between items-center shadow-sm">
        <div className="flex gap-2">
          <button onClick={() => setViewMode('active')} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${viewMode === 'active' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}>Active Caseload</button>
          <button onClick={() => setViewMode('discharged')} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${viewMode === 'discharged' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}>Discharge History</button>
        </div>
        <button onClick={handleDownloadCSV} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-sm font-bold transition-all border border-emerald-100"><FileDown size={18}/> Download CSV</button>
      </div>

      <div className="bg-white rounded-b-2xl shadow-sm border border-slate-100 p-6 mb-8 border-t-0">
        {/* Check-in Form Omitted for Brevity */}
      </div>

      <div className="space-y-4">
        {patients.map(patient => (
          <div key={patient.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{patient.name}</h3>
                  <p className="text-sm text-gray-500 flex items-center gap-1"><User size={14}/> {patient.owner}</p>
                </div>
                <div className="flex gap-2">
                  <a href={`/?id=${patient.id}&code=${patient.access_code}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-bold transition-all border border-slate-100"><Eye size={16}/> Preview</a>
                  <button onClick={() => handleCopyInvite(patient)} className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-bold transition-all border border-slate-100">{copiedId === patient.id ? <Check size={16} className="text-emerald-500"/> : <Copy size={16}/>} Invite</button>
                  {viewMode === 'active' && <button onClick={() => { /* Send SMS */ }} className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-bold transition-all border border-slate-100"><Send size={16}/> SMS Update</button>}
                  <button onClick={() => setAdvancedOpen(prev => ({ ...prev, [patient.id]: !prev[patient.id] }))} className="flex items-center gap-1 px-4 py-2 bg-slate-100 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-200">Advanced {advancedOpen[patient.id] ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</button>
                </div>
              </div>
              
              {advancedOpen[patient.id] && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 animate-in slide-in-from-top-2">
                  {/* Note Section Omitted for Brevity */}
                  <div className="flex flex-wrap justify-between items-end pt-4 border-t gap-y-4">
                    <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
                      <button onClick={() => setHistoryOpen({...historyOpen, [patient.id]: !historyOpen[patient.id]})} className="text-xs font-bold text-indigo-600 flex items-center gap-1 hover:underline"><History size={14}/> View Logs</button>
                      <CopyableInfo label="ID" value={patient.id} fieldKey={`${patient.id}-id`} />
                      <CopyableInfo label="Code" value={patient.access_code} fieldKey={`${patient.id}-code`} />
                    </div>
                    {viewMode === 'active' && <button onClick={() => setDischargeTarget(patient)} className="flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:bg-orange-50 bg-white px-4 py-2 rounded-xl border border-orange-100 shadow-sm transition-all"><Archive size={14} /> Discharge</button>}
                  </div>
                  {/* FIX: SCROLLING HISTORY LIST */}
                  {historyOpen[patient.id] && (
                    <div className="mt-4 border-t pt-4 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                      {patient.stage_history?.map((event, i) => (
                        <div key={i} className="text-xs text-slate-500 border-l-2 border-indigo-200 pl-3 ml-1 mb-2 last:mb-0">
                          Moved to <span className="font-bold">{STAGES.find(s => s.id === event.to_stage)?.label}</span> at {new Date(event.changed_at).toLocaleTimeString()}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {STAGES.map((stage) => {
                  const isActive = patient.stage === stage.id;
                  // If discharged history, we only highlight if it was the last known stage, or hide highlights
                  return (
                    <button key={stage.id} onClick={() => handleStatusUpdate(patient.id, stage.id)} disabled={viewMode === 'discharged'} className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${isActive && viewMode === 'active' ? `${stage.color} border-transparent text-white shadow-lg` : 'bg-white border-slate-100 text-slate-500'} ${viewMode === 'discharged' ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-50'}`}>
                      <stage.icon size={20} className="mb-1" />
                      <span className="text-xs font-bold leading-tight">{stage.label}</span>
                    </button>
                  );
                })}
              </div>
              {viewMode === 'discharged' && (
                <div className="mt-4 p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center justify-center gap-2 text-emerald-700 text-xs font-bold uppercase tracking-wider">
                  <CheckCircle size={16}/> Final Status: Patient Discharged
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
