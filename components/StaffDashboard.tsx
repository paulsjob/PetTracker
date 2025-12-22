import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import { Patient, Doctor, StageId } from '../types';
import { STAGES } from '../constants';
import { 
  Plus, LogOut, Dog, Stethoscope, 
  History, ChevronDown, ChevronUp, Send, Loader2, User, Eye, Search, Smartphone, 
  Clock, CheckCircle, ChevronRight, MessageCircle, AlertCircle
} from 'lucide-react';

const ACTIVE_CLINIC_ID = 'local-demo-clinic';
const QUICK_NOTES = ["Stable", "Post-Op", "Ready", "Call Parent"];

interface StaffDashboardProps {
  onLogout: () => void;
  doctor: Doctor;
}

export const StaffDashboard: React.FC<StaffDashboardProps> = ({ onLogout, doctor }) => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingSms, setSendingSms] = useState<Record<string, boolean>>({});
  const [newPatient, setNewPatient] = useState({ name: '', owner: '', owner_phone: '' });
  const [notification, setNotification] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({});
  const [advancedOpen, setAdvancedOpen] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [showCheckIn, setShowCheckIn] = useState(false);

  const loadData = async (options?: { silent?: boolean }) => {
    try {
      if (!supabase) return;
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('clinic_id', ACTIVE_CLINIC_ID)
        .eq('status', 'active')
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      const myPatients = (data || []).filter((p: Patient) => p.doctor_id === doctor.id);
      setPatients(myPatients as Patient[]);
    } catch (error) {
      if (!options?.silent) showNotification('Sync Error', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const channel = supabase?.channel('patients-live').on('postgres_changes', 
      { event: '*', schema: 'public', table: 'patients' }, () => loadData({ silent: true })).subscribe();
    return () => { if (channel) supabase?.removeChannel(channel); };
  }, [doctor.id]);

  const showNotification = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleAddPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatient.name || !newPatient.owner || !supabase) return;
    try {
      const patientId = Math.random().toString(36).substring(2, 14);
      const accessCode = Math.floor(100000 + Math.random() * 900000).toString();
      const { error } = await supabase.from('patients').insert([{
        id: patientId, name: newPatient.name, owner: newPatient.owner,
        owner_phone: newPatient.owner_phone || null, clinic_id: ACTIVE_CLINIC_ID,
        doctor_id: doctor.id, stage: 'checked-in', status: 'active',
        access_code: accessCode, stage_history: [],
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }]);
      if (error) throw error;
      setNewPatient({ name: '', owner: '', owner_phone: '' });
      setShowCheckIn(false);
      showNotification('Patient checked in');
    } catch (error: any) { showNotification(`Failed: ${error.message}`, 'error'); }
  };

  const handleSendSMS = async (patient: Patient) => {
    const phone = patient.owner_phone;
    if (!phone) { showNotification("Missing number", "error"); return; }
    setSendingSms(prev => ({ ...prev, [patient.id]: true }));
    const stageLabel = STAGES.find(s => s.id === patient.stage)?.label || 'Checked In';
    const clientLink = `${window.location.origin}/?id=${patient.id}&code=${patient.access_code}`;
    try {
      const response = await fetch('/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: phone, body: `[PetTracker] Update for ${patient.name}: ${stageLabel}. Track: ${clientLink}` }),
      });
      const data = await response.json();
      if (data.success) showNotification('Update sent');
      else showNotification(`Carrier blocked: ${data.error}`, 'error');
    } catch (err) { showNotification('Network error', 'error'); } 
    finally { setSendingSms(prev => ({ ...prev, [patient.id]: false })); }
  };

  const filteredPatients = patients.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.owner.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-32">
      {/* PROFESSIONAL STICKY HEADER */}
      <nav className="sticky top-0 z-40 bg-white border-b border-slate-200 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-indigo-100 shadow-lg">
              <Stethoscope size={22} />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-tight">{doctor.name}</h1>
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">{doctor.specialty}</span>
            </div>
          </div>
          <button onClick={onLogout} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
            <LogOut size={20} />
          </button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 pt-6">
        {/* MOBILE OPTIMIZED CHECK-IN TOGGLE */}
        <div className="mb-6">
          {!showCheckIn ? (
            <button 
              onClick={() => setShowCheckIn(true)}
              className="w-full bg-white border-2 border-dashed border-slate-200 rounded-2xl py-4 flex items-center justify-center gap-2 text-slate-500 font-bold hover:border-indigo-300 hover:text-indigo-500 transition-all active:scale-[0.98]"
            >
              <Plus size={20} /> Check In Patient
            </button>
          ) : (
            <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-6 animate-in slide-in-from-top duration-300">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-slate-900">Patient Details</h3>
                <button onClick={() => setShowCheckIn(false)} className="text-xs font-bold text-slate-400">Cancel</button>
              </div>
              <form onSubmit={handleAddPatient} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input type="text" value={newPatient.name} placeholder="Pet Name" onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 border-none font-medium" />
                  <input type="text" value={newPatient.owner} placeholder="Owner Name" onChange={(e) => setNewPatient({ ...newPatient, owner: e.target.value })} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 border-none font-medium" />
                </div>
                <input type="tel" value={newPatient.owner_phone} placeholder="Owner Mobile (+1...)" onChange={(e) => setNewPatient({ ...newPatient, owner_phone: e.target.value })} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 border-none font-medium" />
                <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-100 active:scale-[0.98] transition-all">Check In Now</button>
              </form>
            </div>
          )}
        </div>

        {/* MODERN SEARCH BAR */}
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
          <input 
            type="text" 
            placeholder="Search patients or owners..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-white rounded-2xl border-none shadow-sm outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-600"
          />
        </div>

        {/* PRO PATIENT CARDS */}
        <div className="space-y-4">
          {filteredPatients.length === 0 ? (
             <div className="text-center py-16 bg-white rounded-3xl border-2 border-dashed border-slate-200">
                <Dog size={48} className="mx-auto mb-4 text-slate-100" />
                <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">No caseload active</p>
             </div>
          ) : filteredPatients.map(patient => (
            <div key={patient.id} className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden group hover:shadow-md transition-shadow">
              <div className="p-5">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-extrabold text-slate-900 leading-tight">{patient.name}</h3>
                      <span className="px-2 py-0.5 bg-slate-100 rounded text-[9px] font-black uppercase text-slate-400 tracking-tighter">ID: {patient.id.slice(0,6)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-400 text-xs font-bold uppercase tracking-tight">
                      <User size={12}/> {patient.owner}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={`/?id=${patient.id}&code=${patient.access_code}`} target="_blank" rel="noreferrer" className="w-10 h-10 flex items-center justify-center bg-slate-50 text-slate-400 rounded-xl hover:bg-indigo-50 hover:text-indigo-500 transition-colors">
                      <Eye size={18} />
                    </a>
                    <button 
                        onClick={() => handleSendSMS(patient)}
                        disabled={sendingSms[patient.id]}
                        className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase shadow-lg shadow-indigo-100 disabled:bg-slate-200 transition-all active:scale-95"
                    >
                      {sendingSms[patient.id] ? <Loader2 className="animate-spin" size={14}/> : <Send size={14}/>} Update
                    </button>
                  </div>
                </div>

                {/* VISUAL STAGE TRACKER */}
                <div className="flex items-center gap-1.5 mb-6 overflow-x-auto pb-2 no-scrollbar">
                  {STAGES.map((stage, idx) => {
                    const isCurrent = patient.stage === stage.id;
                    const isPast = STAGES.findIndex(s => s.id === patient.stage) > idx;
                    return (
                      <button 
                        key={stage.id}
                        onClick={() => api.updateStage(patient.id, stage.id as StageId, doctor.id)}
                        className={`flex-1 min-w-[64px] h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all
                          ${isCurrent ? `${stage.color} text-white shadow-lg` : isPast ? 'bg-indigo-50 text-indigo-400' : 'bg-slate-50 text-slate-300 hover:bg-slate-100'}
                        `}
                      >
                        <stage.icon size={14} />
                        <span className="text-[8px] font-black uppercase leading-none tracking-tighter">{stage.label}</span>
                      </button>
                    )
                  })}
                </div>

                {/* ADVANCED SECTION */}
                <button 
                    onClick={() => setAdvancedOpen(p => ({...p, [patient.id]: !p[patient.id]}))}
                    className="w-full flex items-center justify-center gap-1 text-[10px] font-black uppercase text-slate-300 py-1 hover:text-slate-500 transition-colors"
                >
                    {advancedOpen[patient.id] ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                    Internal Tools
                </button>

                {advancedOpen[patient.id] && (
                  <div className="mt-4 pt-4 border-t border-slate-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="flex items-center gap-2 mb-2 px-1">
                        <MessageCircle size={14} className="text-slate-400"/>
                        <span className="text-[10px] font-black uppercase text-slate-400">Staff Commentary</span>
                    </div>
                    <textarea 
                        value={noteDrafts[patient.id] || patient.note || ''} 
                        onChange={(e) => setNoteDrafts({...noteDrafts, [patient.id]: e.target.value})} 
                        onBlur={() => api.updateStage(patient.id, patient.stage, doctor.id, noteDrafts[patient.id])}
                        className="w-full p-4 bg-slate-50 rounded-2xl text-xs font-medium text-slate-600 outline-none focus:ring-2 focus:ring-indigo-100 border-none h-24 mb-3"
                        placeholder="Add vitals or recovery notes..."
                    />
                    <div className="flex flex-wrap gap-2 mb-4">
                        {QUICK_NOTES.map(note => (
                            <button key={note} onClick={() => { setNoteDrafts({...noteDrafts, [patient.id]: note}); api.updateStage(patient.id, patient.stage, doctor.id, note); }} className="px-3 py-1.5 bg-white border border-slate-100 rounded-lg text-[9px] font-bold text-slate-400 hover:bg-indigo-50 hover:text-indigo-500 transition-all">+ {note}</button>
                        ))}
                    </div>
                    <div className="flex items-center justify-between px-1">
                        <button onClick={() => setHistoryOpen(p => ({...p, [patient.id]: !p[patient.id]}))} className="flex items-center gap-1 text-[10px] font-black text-indigo-500 uppercase">
                            <History size={12}/> {historyOpen[patient.id] ? 'Hide Logs' : 'View History'}
                        </button>
                        <span className="text-[10px] font-mono text-slate-300">Auth: {patient.access_code}</span>
                    </div>
                    {historyOpen[patient.id] && (
                      <div className="mt-4 space-y-3 pl-3 border-l-2 border-slate-100">
                        {patient.stage_history?.map((evt, i) => (
                           <div key={i} className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"/>
                              <span className="text-[10px] font-medium text-slate-500">{STAGES.find(s => s.id === evt.to_stage)?.label} at {new Date(evt.changed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                           </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* GLOBAL NOTIFICATIONS */}
      {notification && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-4 rounded-2xl shadow-2xl z-50 flex items-center gap-3 animate-in fade-in zoom-in slide-in-from-bottom-10 duration-500 ${notification.type === 'success' ? 'bg-slate-900 text-white' : 'bg-red-600 text-white'}`}>
          {notification.type === 'success' ? <CheckCircle size={20} className="text-emerald-400"/> : <AlertCircle size={20}/>}
          <span className="text-sm font-bold tracking-tight">{notification.msg}</span>
        </div>
      )}
    </div>
  );
};
