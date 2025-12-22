import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import { Patient, Doctor, StageId } from '../types';
import { STAGES } from '../constants';
import { 
  Plus, LogOut, Dog, Stethoscope, History, ChevronDown, ChevronUp, 
  Send, Loader2, User, Eye, Archive, Copy, Check, AlertTriangle, FileDown, CheckCircle
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
    } catch (error) { if (!options?.silent) showNotification('Sync Error', 'error'); }
  };

  useEffect(() => {
    loadData();
    const channel = supabase?.channel('patients-live').on('postgres_changes', { event: '*', schema: 'public', table: 'patients' }, () => loadData({ silent: true })).subscribe();
    return () => { if (channel) supabase?.removeChannel(channel); };
  }, [doctor.id, viewMode]);

  const handleDownloadCSV = () => {
    const headers = "Name,Owner,Phone,Status,Stage,Code,Created\n";
    const rows = patients.map(p => `"${p.name}","${p.owner}","${p.owner_phone || ''}","${p.status}","${p.stage}","${p.access_code}","${p.created_at}"`).join("\n");
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vettrack_${viewMode}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    showNotification("CSV Exported");
  };

  const handleCopyInvite = (patient: Patient) => {
    const link = `${window.location.origin}/?id=${patient.id}&code=${patient.access_code}`;
    const message = `Hello from PetTracker! Follow ${patient.name}'s status live here: \n\n${link}\n\nPatient ID: ${patient.id}\nAccess Code: ${patient.access_code}\n\nQuestions? Please contact PetTracker.io.`;
    navigator.clipboard.writeText(message);
    setCopiedId(patient.id);
    setTimeout(() => setCopiedId(null), 3000);
    showNotification("Invite copied");
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

  const showNotification = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 5000);
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
      {dischargeTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4 text-orange-500"><AlertTriangle size={32} /></div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Confirm Discharge</h3>
              <p className="text-sm text-slate-500 leading-relaxed">Are you sure you want to discharge <span className="font-bold text-slate-900">{dischargeTarget.name}</span>?</p>
            </div>
            <div className="flex border-t border-slate-100">
              <button onClick={() => setDischargeTarget(null)} className="flex-1 px-6 py-4 text-sm font-bold text-slate-400 hover:bg-slate-50 transition-colors border-r border-slate-100">Cancel</button>
              <button onClick={handleDischargeConfirm} className="flex-1 px-6 py-4 text-sm font-bold text-orange-600 hover:bg-orange-50 transition-colors">Discharge</button>
            </div>
          </div>
        </div>
      )}

      {notification && (
        <div className={`fixed top-4 right-4 px-6 py-4 rounded-lg shadow-xl z-50 text-white font-medium ${notification.type === 'success' ? 'bg-indigo-600' : 'bg-red-600'}`}>{notification.msg}</div>
      )}
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Stethoscope className="text-indigo-600"/> {doctor.name}</h1>
          <p className="text-indigo-600 font-medium">{doctor.specialty}</p>
        </div>
        {/* CSV ICON NEXT TO LOGOUT */}
        <div className="flex items-center gap-3">
          <button 
            onClick={handleDownloadCSV} 
            title="Download CSV"
            className="p-2.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all border border-slate-100"
          >
            <FileDown size={20} />
          </button>
          <button onClick={onLogout} className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-lg font-medium hover:bg-slate-200 transition-colors border border-slate-100"><LogOut size={18} /> Logout</button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8">
          <h2 className="text-sm font-bold mb-4 uppercase tracking-widest text-slate-400">Check In New Patient</h2>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const id = Math.random().toString(36).substring(2, 14);
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            const { error } = await supabase.from('patients').insert([{ ...newPatient, id, clinic_id: ACTIVE_CLINIC_ID, doctor_id: doctor.id, stage: 'checked-in', status: 'active', access_code: code, stage_history: [] }]);
            if (!error) { setNewPatient({ name: '', owner: '', owner_phone: '' }); loadData(); showNotification("Checked in!"); }
          }} className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-3"><input type="text" value={newPatient.name} onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })} className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Pet Name" /></div>
            <div className="md:col-span-3"><input type="text" value={newPatient.owner} onChange={(e) => setNewPatient({ ...newPatient, owner: e.target.value })} className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Owner Name" /></div>
            <div className="md:col-span-3"><input type="tel" value={newPatient.owner_phone} onChange={(e) => setNewPatient({ ...newPatient, owner_phone: e.target.value })} className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" placeholder="+1 (704) 555-0123" /></div>
            <div className="md:col-span-3"><button type="submit" className="w-full bg-indigo-600 text-white font-bold py-2 rounded-lg transition-all">Check In</button></div>
          </form>
      </div>

      {/* VIEW TOGGLES DIRECTLY ABOVE CARDS */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setViewMode('active')} className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${viewMode === 'active' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}>Active Patients</button>
        <button onClick={() => setViewMode('discharged')} className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${viewMode === 'discharged' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}>Discharged</button>
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
                  {viewMode === 'active' && <button onClick={() => { /* SMS Update Logic */ }} className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-bold transition-all border border-slate-100"><Send size={16}/> Update</button>}
                  <button onClick={() => setAdvancedOpen(prev => ({ ...prev, [patient.id]: !prev[patient.id] }))} className="flex items-center gap-1 px-4 py-2 bg-slate-100 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-200">Advanced {advancedOpen[patient.id] ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</button>
                </div>
              </div>
              
              {advancedOpen[patient.id] && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 animate-in slide-in-from-top-2">
                  <div className="mb-4">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Internal Staff Note</label>
                    <textarea onBlur={(e) => api.updateStage(patient.id, patient.stage, doctor.id, e.target.value)} defaultValue={patient.note || ''} className="w-full p-3 text-sm border rounded-lg h-20 outline-none focus:ring-2 focus:ring-indigo-50 bg-white" placeholder="Clinical commentary..." />
                    <div className="flex flex-wrap gap-2 mt-3">
                        {QUICK_NOTES.map(note => (
                            <button key={note} onClick={() => { /* Quick note logic */ }} className="px-3 py-1.5 bg-white border border-slate-200 rounded text-xs font-bold text-slate-500 hover:bg-indigo-50 transition-colors">+ {note}</button>
                        ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-between items-end pt-4 border-t gap-y-4">
                    <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
                      <button onClick={() => setHistoryOpen({...historyOpen, [patient.id]: !historyOpen[patient.id]})} className="text-xs font-bold text-indigo-600 flex items-center gap-1 hover:underline"><History size={14}/> View Logs</button>
                      <CopyableInfo label="ID" value={patient.id} fieldKey={`${patient.id}-id`} />
                      <CopyableInfo label="Code" value={patient.access_code} fieldKey={`${patient.id}-code`} />
                    </div>
                    {viewMode === 'active' && <button onClick={() => setDischargeTarget(patient)} className="flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:bg-orange-50 bg-white px-4 py-2 rounded-xl border border-orange-100 shadow-sm transition-all"><Archive size={14} /> Discharge</button>}
                  </div>
                  {historyOpen[patient.id] && (
                    <div className="mt-4 border-t pt-4 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                      {patient.stage_history?.map((event, i) => (
                        <div key={i} className="text-xs text-slate-500 border-l-2 border-indigo-200 pl-3 ml-1 mb-2">
                          Moved to <span className="font-bold">{STAGES.find(s => s.id === event.to_stage)?.label}</span> at {new Date(event.changed_at).toLocaleTimeString()}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* IMPROVED LABEL READABILITY: Sentence case, better font-weight */}
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {STAGES.map((stage) => {
                  const isActive = patient.stage === stage.id;
                  return (
                    <button key={stage.id} onClick={() => { if(viewMode === 'active') api.updateStage(patient.id, stage.id as StageId, doctor.id) }} disabled={viewMode === 'discharged'} className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${isActive && viewMode === 'active' ? `${stage.color} border-transparent text-white shadow-lg` : 'bg-white border-slate-100 text-slate-500'} ${viewMode === 'discharged' ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-50'}`}>
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
