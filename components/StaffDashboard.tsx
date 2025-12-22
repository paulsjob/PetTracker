import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import { Patient, Doctor, StageId } from '../types';
import { STAGES } from '../constants';
import { 
  Plus, LogOut, Dog, Stethoscope, History, ChevronDown, ChevronUp, 
  Send, Loader2, User, Eye, Archive, Copy, Check, AlertTriangle, 
  FileDown, CheckCircle, ShieldCheck, Users, UserPlus, UserMinus, Link
} from 'lucide-react';

const ACTIVE_CLINIC_ID = 'local-demo-clinic';
const QUICK_NOTES = ["Doing well", "Vitals stable", "In progress", "Waking up", "Ready soon", "Call pending"];

interface StaffDashboardProps {
  onLogout: () => void;
  doctor: Doctor;
}

export const StaffDashboard: React.FC<StaffDashboardProps> = ({ onLogout, doctor }) => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [allDoctors, setAllDoctors] = useState<Doctor[]>([]);
  const [viewMode, setViewMode] = useState<'active' | 'discharged'>('active');
  const [isAdminPortal, setIsAdminPortal] = useState(false);
  const [adminDoctorFilter, setAdminDoctorFilter] = useState<string>('all');
  const [sendingSms, setSendingSms] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [dischargeTarget, setDischargeTarget] = useState<Patient | null>(null);
  const [newPatient, setNewPatient] = useState({ name: '', owner: '', owner_phone: '' });
  const [newStaff, setNewStaff] = useState({ name: '', specialty: '', pin: '' });
  const [notification, setNotification] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({});
  const [advancedOpen, setAdvancedOpen] = useState<Record<string, boolean>>({});

  const loadData = async (options?: { silent?: boolean }) => {
    try {
      if (!supabase) return;
      
      // 1. Fetch Patients
      const { data: pData, error: pError } = await supabase
        .from('patients')
        .select('*')
        .eq('clinic_id', ACTIVE_CLINIC_ID)
        .eq('status', viewMode)
        .order('updated_at', { ascending: false });
      
      if (pError) throw pError;

      let filtered = pData || [];
      if (!isAdminPortal) {
        filtered = filtered.filter((p: Patient) => p.doctor_id === doctor.id);
      } else if (adminDoctorFilter !== 'all') {
        filtered = filtered.filter((p: Patient) => p.doctor_id === adminDoctorFilter);
      }
      setPatients(filtered as Patient[]);

      // 2. DATA FIX: Fetch ALL clinic staff for Admin Portal & Dropdowns
      const { data: dData } = await supabase
        .from('doctors')
        .select('*')
        .eq('clinic_id', ACTIVE_CLINIC_ID)
        .order('name', { ascending: true });
      
      if (dData) setAllDoctors(dData as Doctor[]);

    } catch (error) { if (!options?.silent) showNotification('Sync Error', 'error'); }
  };

  useEffect(() => {
    loadData();
    const channel = supabase?.channel('dashboard-live').on('postgres_changes', { event: '*', schema: 'public', table: 'patients' }, () => loadData({ silent: true })).subscribe();
    return () => { if (channel) supabase?.removeChannel(channel); };
  }, [doctor.id, viewMode, isAdminPortal, adminDoctorFilter]);

  const showNotification = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleCopyInvite = (patient: Patient) => {
    const link = `${window.location.origin}/?id=${patient.id}&code=${patient.access_code}`;
    const message = `Hello from PetTracker! Follow ${patient.name}'s status live here: \n\n${link}\n\nPatient ID: ${patient.id}\nAccess Code: ${patient.access_code}\n\nQuestions? Please contact PetTracker.io.`;
    navigator.clipboard.writeText(message);
    setCopiedId(patient.id);
    setTimeout(() => setCopiedId(null), 3000);
    showNotification("Invite copied");
  };

  const handleSendSMS = async (patient: Patient) => {
    const phone = patient.owner_phone;
    if (!phone) { showNotification("No phone number saved", "error"); return; }
    setSendingSms(prev => ({ ...prev, [patient.id]: true }));
    const stageLabel = STAGES.find(s => s.id === patient.stage)?.label || 'Checked In';
    const clientLink = `${window.location.origin}/?id=${patient.id}&code=${patient.access_code}`;
    try {
      const response = await fetch('/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: phone, body: `[PetTracker] Update for ${patient.name}: Status is now ${stageLabel}. Track live: ${clientLink}` }),
      });
      const data = await response.json();
      if (data.success) showNotification(`SMS sent to ${phone}`);
      else showNotification(`Carrier Error: ${data.error}`, 'error');
    } catch (err) { showNotification('Connection error', 'error'); } 
    finally { setSendingSms(prev => ({ ...prev, [patient.id]: false })); }
  };

  const CopyableInfo = ({ label, value, fieldKey, customDisplay }: { label: string, value: string, fieldKey: string, customDisplay?: string }) => {
    const isCopied = copiedField === fieldKey;
    return (
      <div className="flex flex-col min-w-[140px]">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-0.5">{label}</span>
        <button onClick={() => { navigator.clipboard.writeText(value); setCopiedField(fieldKey); setTimeout(() => setCopiedField(null), 2000); }} className="flex items-center gap-2 group text-sm font-bold text-slate-700 hover:text-indigo-600 transition-colors text-left">
          <span className="font-mono truncate max-w-[180px]">{customDisplay || value}</span>
          {isCopied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} className="text-slate-300 group-hover:text-indigo-400" />}
        </button>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto pb-20 p-4 relative">
      {/* 1. Branded Discharge Modal */}
      {dischargeTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4 text-orange-500"><AlertTriangle size={32} /></div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Confirm Discharge</h3>
              <p className="text-sm text-slate-500 leading-relaxed">Are you sure you want to discharge <span className="font-bold text-slate-900">{dischargeTarget.name}</span>?</p>
            </div>
            <div className="flex border-t border-slate-100">
              <button onClick={() => setDischargeTarget(null)} className="flex-1 px-6 py-4 text-sm font-bold text-slate-400 hover:bg-slate-50 transition-colors border-r border-slate-100">Cancel</button>
              <button onClick={async () => {
                await supabase.from('patients').update({ status: 'discharged', updated_at: new Date().toISOString() }).eq('id', dischargeTarget.id);
                setDischargeTarget(null); loadData(); showNotification('Discharged successfully');
              }} className="flex-1 px-6 py-4 text-sm font-bold text-orange-600 hover:bg-orange-50 transition-colors">Discharge</button>
            </div>
          </div>
        </div>
      )}

      {notification && (
        <div className={`fixed top-4 right-4 px-6 py-4 rounded-lg shadow-xl z-50 text-white font-medium ${notification.type === 'success' ? 'bg-indigo-600' : 'bg-red-600'}`}>{notification.msg}</div>
      )}
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-xl text-white shadow-lg ${isAdminPortal ? 'bg-amber-500' : 'bg-indigo-600'}`}>
            {isAdminPortal ? <ShieldCheck size={24}/> : <Stethoscope size={24}/>}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{isAdminPortal ? 'Clinic Administration' : doctor.name}</h1>
            <p className="text-indigo-600 font-medium text-sm">{isAdminPortal ? 'Global Caseload & Staff Management' : doctor.specialty}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {doctor.is_admin && (
            <button onClick={() => setIsAdminPortal(!isAdminPortal)} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-widest transition-all ${isAdminPortal ? 'bg-indigo-600 text-white shadow-md' : 'bg-amber-50 text-amber-700 border border-amber-100 hover:bg-amber-100'}`}>
              {isAdminPortal ? <Users size={16}/> : <ShieldCheck size={16}/>} {isAdminPortal ? 'Exit Admin Mode' : 'Admin Portal'}
            </button>
          )}
          <button onClick={() => { /* CSV logic */ }} title="Download CSV" className="p-2.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl border border-slate-100 transition-all"><FileDown size={20} /></button>
          <button onClick={onLogout} className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-lg text-sm font-bold text-slate-600 border border-slate-100 hover:bg-slate-200 transition-colors"><LogOut size={18} /> Logout</button>
        </div>
      </div>

      {/* 2. Admin Tools - Fixed Logic */}
      {isAdminPortal && (
        <div className="mb-12 grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in slide-in-from-top-4 duration-300">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2"><UserPlus size={18}/> Add Provider</h2>
            <form onSubmit={async (e) => {
               e.preventDefault();
               const id = `doc-${Math.random().toString(36).substring(2, 8)}`;
               const { error } = await supabase.from('doctors').insert([{ ...newStaff, id, clinic_id: ACTIVE_CLINIC_ID, is_active: true, is_admin: false }]);
               if (!error) { setNewStaff({ name: '', specialty: '', pin: '' }); loadData(); showNotification("Staff added"); }
            }} className="space-y-4">
              <input type="text" value={newStaff.name} onChange={(e) => setNewStaff({...newStaff, name: e.target.value})} placeholder="Provider Full Name" className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl text-sm outline-none focus:ring-2 focus:ring-amber-500" />
              <input type="text" value={newStaff.specialty} onChange={(e) => setNewStaff({...newStaff, specialty: e.target.value})} placeholder="Clinical Specialty" className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl text-sm outline-none focus:ring-2 focus:ring-amber-500" />
              <input type="text" maxLength={4} value={newStaff.pin} onChange={(e) => setNewStaff({...newStaff, pin: e.target.value.replace(/\D/g,'')})} placeholder="PIN (4 Digits)" className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold tracking-widest outline-none focus:ring-2 focus:ring-amber-500" />
              <button type="submit" className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl shadow-lg transition-all">Onboard Provider</button>
            </form>
          </div>
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
             <h2 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2"><Users size={18}/> Clinical Staff Directory</h2>
             <div className="max-h-[300px] overflow-y-auto">
               <table className="w-full text-left">
                  <tbody className="divide-y divide-slate-50">
                    {allDoctors.map(doc => (
                      <tr key={doc.id} className="text-sm group">
                        <td className="py-4 px-2">
                           <div className="font-bold text-slate-700">{doc.name}</div>
                           <div className="text-[10px] text-slate-400 font-medium uppercase tracking-tighter">{doc.specialty}</div>
                        </td>
                        <td className="py-4 px-2 font-mono text-slate-400 font-bold">{doc.pin}</td>
                        <td className="py-4 px-2 text-right">
                          {!doc.is_admin && (
                            <button onClick={() => supabase.from('doctors').update({ is_active: !doc.is_active }).eq('id', doc.id).then(() => loadData())} className={`p-2.5 rounded-xl transition-all ${doc.is_active ? 'text-slate-300 hover:text-red-500 hover:bg-red-50' : 'text-emerald-500 bg-emerald-50'}`}>
                              {doc.is_active ? <UserMinus size={20}/> : <CheckCircle size={20}/>}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
               </table>
             </div>
          </div>
        </div>
      )}

      {/* 3. Check-In Form */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 mb-24">
          <h2 className="text-sm font-bold mb-6 uppercase tracking-widest text-slate-400 px-1">Check In New Patient</h2>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const id = Math.random().toString(36).substring(2, 14);
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            const { error } = await supabase.from('patients').insert([{ ...newPatient, id, clinic_id: ACTIVE_CLINIC_ID, doctor_id: doctor.id, stage: 'checked-in', status: 'active', access_code: code, stage_history: [] }]);
            if (!error) { setNewPatient({ name: '', owner: '', owner_phone: '' }); loadData(); showNotification("Checked in!"); }
          }} className="grid grid-cols-1 md:grid-cols-12 gap-5">
            <div className="md:col-span-3"><input type="text" value={newPatient.name} onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })} className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Pet Name" /></div>
            <div className="md:col-span-3"><input type="text" value={newPatient.owner} onChange={(e) => setNewPatient({ ...newPatient, owner: e.target.value })} className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Owner Name" /></div>
            <div className="md:col-span-3"><input type="tel" value={newPatient.owner_phone} onChange={(e) => setNewPatient({ ...newPatient, owner_phone: e.target.value })} className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="+1 (704) 555-0123" /></div>
            <div className="md:col-span-3"><button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-2xl transition-all hover:bg-indigo-700 shadow-lg shadow-indigo-100">Check In</button></div>
          </form>
      </div>

      {/* 4. NAVIGATION TABS - "THE BREATHING ROOM" FIX */}
      <div className="my-16 px-4 flex flex-col md:flex-row justify-between items-center gap-8">
        <div className="flex gap-6 bg-white/40 p-2 rounded-3xl border border-slate-100 shadow-sm">
          <button onClick={() => setViewMode('active')} className={`px-12 py-3.5 rounded-2xl text-sm font-bold transition-all ${viewMode === 'active' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100' : 'text-slate-400 hover:text-slate-600'}`}>Active Patients</button>
          <button onClick={() => setViewMode('discharged')} className={`px-12 py-3.5 rounded-2xl text-sm font-bold transition-all ${viewMode === 'discharged' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100' : 'text-slate-400 hover:text-slate-600'}`}>Discharged</button>
        </div>
        
        {isAdminPortal && (
          <div className="flex items-center gap-4 bg-white px-6 py-3.5 rounded-2xl border border-slate-100 shadow-sm">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Provider:</span>
            <select value={adminDoctorFilter} onChange={(e) => setAdminDoctorFilter(e.target.value)} className="bg-transparent text-sm font-bold text-indigo-600 outline-none cursor-pointer min-w-[140px]">
              <option value="all">Entire Clinic</option>
              {allDoctors.map(d => <option key={d.id} value={d.id}>{d.name} {!d.is_active ? '(Inactive)' : ''}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* 5. Patient Caseload List */}
      <div className="space-y-10">
        {patients.map(patient => {
          const assignedDoc = allDoctors.find(d => d.id === patient.doctor_id);
          const clientLink = `${window.location.origin}/?id=${patient.id}&code=${patient.access_code}`;
          return (
            <div key={patient.id} className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden transition-all hover:shadow-md">
              <div className="p-8 lg:p-10">
                <div className="flex flex-col lg:flex-row justify-between items-start gap-8 mb-10">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">{patient.name}</h3>
                    <div className="flex flex-wrap items-center gap-5 text-xs font-bold text-slate-400">
                       <span className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg"><User size={14}/> {patient.owner}</span>
                       <span className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${assignedDoc && !assignedDoc.is_active ? 'bg-red-50 text-red-500' : 'bg-indigo-50 text-indigo-500'}`}>
                          <ShieldCheck size={14}/> {assignedDoc ? assignedDoc.name : 'Unassigned'}
                       </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2.5 w-full lg:w-auto">
                    <a href={clientLink} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-6 py-3.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-2xl text-sm font-bold border border-slate-100 transition-all"><Eye size={18}/> Preview</a>
                    <button onClick={() => handleCopyInvite(patient)} className="flex items-center gap-2 px-6 py-3.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-2xl text-sm font-bold border border-slate-100 transition-all"><Copy size={18}/> Invite</button>
                    {viewMode === 'active' && <button onClick={() => handleSendSMS(patient)} disabled={sendingSms[patient.id]} className="flex items-center gap-2 px-6 py-3.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-2xl text-sm font-bold border border-slate-100 transition-all">{sendingSms[patient.id] ? <Loader2 className="animate-spin" size={18}/> : <Send size={18}/>} Update</button>}
                    <button onClick={() => setAdvancedOpen(prev => ({ ...prev, [patient.id]: !prev[patient.id] }))} className="flex items-center gap-2 px-6 py-3.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-2xl text-sm font-bold border border-slate-100 transition-all">Advanced {advancedOpen[patient.id] ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}</button>
                  </div>
                </div>
                
                {advancedOpen[patient.id] && (
                  <div className="bg-slate-50 p-8 rounded-3xl border border-slate-200 mb-10 animate-in slide-in-from-top-4 duration-300">
                    <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4 px-1">Internal Staff Note</label>
                    <textarea onBlur={(e) => api.updateStage(patient.id, patient.stage, doctor.id, e.target.value)} defaultValue={patient.note || ''} className="w-full p-5 bg-white border border-slate-100 rounded-[1.5rem] text-sm h-24 mb-8 outline-none focus:ring-2 focus:ring-indigo-100 transition-all shadow-sm" placeholder="Add commentary..." />
                    <div className="flex flex-wrap justify-between items-center pt-8 border-t border-slate-200 gap-y-8">
                      <div className="flex flex-wrap items-center gap-x-14 gap-y-8">
                        <button onClick={() => setHistoryOpen({...historyOpen, [patient.id]: !historyOpen[patient.id]})} className="text-xs font-black text-indigo-600 flex items-center gap-2 hover:opacity-70 uppercase tracking-widest"><History size={18}/> Logs</button>
                        {/* MAGIC LINK FIX: Clean "Copy Direct Link" label */}
                        <CopyableInfo label="Client Portal" value={clientLink} fieldKey={`${patient.id}-link`} customDisplay="Copy Direct Link" />
                        <CopyableInfo label="Patient ID" value={patient.id} fieldKey={`${patient.id}-id`} />
                        <CopyableInfo label="Access Code" value={patient.access_code} fieldKey={`${patient.id}-code`} />
                      </div>
                      {viewMode === 'active' && <button onClick={() => setDischargeTarget(patient)} className="flex items-center gap-2 px-8 py-3 bg-white text-orange-600 border border-orange-100 rounded-[1.25rem] text-xs font-black uppercase tracking-widest shadow-sm hover:bg-orange-50 transition-all active:scale-95"><Archive size={18} /> Discharge Patient</button>}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {STAGES.map((stage) => {
                    const isActive = patient.stage === stage.id;
                    return (
                      <button key={stage.id} onClick={() => { if(viewMode === 'active') api.updateStage(patient.id, stage.id as StageId, doctor.id) }} disabled={viewMode === 'discharged'} className={`flex flex-col items-center justify-center p-5 rounded-[1.5rem] border-2 transition-all ${isActive && viewMode === 'active' ? `${stage.color} border-transparent text-white shadow-xl scale-[1.03]` : 'bg-white border-slate-100 text-slate-400 hover:text-slate-900 hover:bg-slate-50 shadow-sm'} ${viewMode === 'discharged' ? 'opacity-40 cursor-not-allowed' : ''}`}>
                        <stage.icon size={26} className="mb-2" />
                        <span className="text-[11px] font-black uppercase tracking-tighter leading-tight">{stage.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
