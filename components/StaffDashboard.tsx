import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import { Patient, Doctor, StageId } from '../types';
import { STAGES } from '../constants';
import { 
  Plus, LogOut, Dog, Stethoscope, History, ChevronDown, ChevronUp, 
  Send, Loader2, User, Eye, Archive, Copy, Check, AlertTriangle, 
  FileDown, CheckCircle, ShieldCheck, Users, UserPlus, UserMinus
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
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({});
  const [advancedOpen, setAdvancedOpen] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');

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

      // 2. Fetch Doctors (Always fetch for filter dropdown if admin)
      if (doctor.is_admin) {
        const { data: dData } = await supabase
          .from('doctors')
          .select('*')
          .eq('clinic_id', ACTIVE_CLINIC_ID)
          .order('name', { ascending: true });
        setAllDoctors((dData || []) as Doctor[]);
      }
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

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaff.name || !newStaff.pin) return;
    try {
      const id = `doc-${Math.random().toString(36).substring(2, 8)}`;
      const { error } = await supabase.from('doctors').insert([{ ...newStaff, id, clinic_id: ACTIVE_CLINIC_ID, is_active: true, is_admin: false }]);
      if (error) throw error;
      setNewStaff({ name: '', specialty: '', pin: '' });
      showNotification("Staff member added");
      loadData();
    } catch (error: any) { showNotification(error.message, "error"); }
  };

  const toggleStaffStatus = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase.from('doctors').update({ is_active: !currentStatus }).eq('id', id);
      if (error) throw error;
      showNotification(`Provider updated`);
      loadData();
    } catch (error: any) { showNotification("Update failed", "error"); }
  };

  const handleDownloadCSV = () => {
    const headers = "Name,Owner,Phone,Status,Stage,Code,Doctor_ID,Created\n";
    const rows = patients.map(p => `"${p.name}","${p.owner}","${p.owner_phone || ''}","${p.status}","${p.stage}","${p.access_code}","${p.doctor_id}","${p.created_at}"`).join("\n");
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pettracker_export.csv`;
    a.click();
  };

  const handleCopyInvite = (patient: Patient) => {
    const link = `${window.location.origin}/?id=${patient.id}&code=${patient.access_code}`;
    const message = `Hello from PetTracker! Follow ${patient.name}'s status live here: \n\n${link}\n\nPatient ID: ${patient.id}\nAccess Code: ${patient.access_code}\n\nQuestions? Please contact PetTracker.io.`;
    navigator.clipboard.writeText(message);
    setCopiedId(patient.id);
    setTimeout(() => setCopiedId(null), 3000);
    showNotification("Invite copied");
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
      {/* 1. Header with Admin Portal Toggle */}
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
            <button 
              onClick={() => setIsAdminPortal(!isAdminPortal)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-widest transition-all ${isAdminPortal ? 'bg-indigo-600 text-white shadow-md' : 'bg-amber-50 text-amber-700 border border-amber-100 hover:bg-amber-100'}`}
            >
              {isAdminPortal ? <Users size={16}/> : <ShieldCheck size={16}/>}
              {isAdminPortal ? 'Exit Admin Mode' : 'Admin Portal'}
            </button>
          )}
          <button onClick={handleDownloadCSV} title="Download CSV" className="p-2.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl border border-slate-100 transition-all"><FileDown size={20} /></button>
          <button onClick={onLogout} className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-lg text-sm font-bold text-slate-600 border border-slate-100 hover:bg-slate-200 transition-colors hover:text-slate-900"><LogOut size={18} /> Logout</button>
        </div>
      </div>

      {/* 2. Admin Staff Section (Visible when isAdminPortal is ON) */}
      {isAdminPortal && (
        <div className="mb-8 grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in slide-in-from-top-4 duration-300">
          <div className="lg:col-span-1 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2"><UserPlus size={18}/> Add Provider</h2>
            <form onSubmit={handleAddStaff} className="space-y-4">
              <input type="text" value={newStaff.name} onChange={(e) => setNewStaff({...newStaff, name: e.target.value})} placeholder="Full Name" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
              <input type="text" value={newStaff.specialty} onChange={(e) => setNewStaff({...newStaff, specialty: e.target.value})} placeholder="Specialty" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
              <input type="text" maxLength={4} value={newStaff.pin} onChange={(e) => setNewStaff({...newStaff, pin: e.target.value.replace(/\D/g,'')})} placeholder="PIN" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm font-bold tracking-widest focus:ring-2 focus:ring-amber-500 outline-none" />
              <button type="submit" className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl shadow-lg transition-all">Add Staff</button>
            </form>
          </div>
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
             <h2 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2"><Users size={18}/> Staff Directory</h2>
             <table className="w-full text-left">
                <tbody className="divide-y divide-slate-50">
                  {allDoctors.map(doc => (
                    <tr key={doc.id} className="text-sm">
                      <td className="py-4 px-2 font-bold text-slate-700">{doc.name} {doc.is_admin && <span className="ml-2 text-[8px] text-amber-500 font-black">ADMIN</span>}</td>
                      <td className="py-4 px-2 text-slate-400">{doc.specialty}</td>
                      <td className="py-4 px-2 font-mono text-slate-400">{doc.pin}</td>
                      <td className="py-4 px-2 text-right">
                        {!doc.is_admin && (
                          <button onClick={() => toggleStaffStatus(doc.id, doc.is_active ?? true)} className={`p-2 rounded-lg ${doc.is_active ? 'text-slate-300 hover:text-red-500' : 'text-emerald-500 bg-emerald-50'}`}>
                            {doc.is_active ? <UserMinus size={18}/> : <CheckCircle size={18}/>}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
             </table>
          </div>
        </div>
      )}

      {/* 3. Check-In Form */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-12">
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
            <div className="md:col-span-3"><button type="submit" className="w-full bg-indigo-600 text-white font-bold py-2 rounded-lg transition-all hover:bg-indigo-700">Check In</button></div>
          </form>
      </div>

      {/* 4. Tab Navigation (Moved into gray space above cards) */}
      <div className="flex justify-between items-end mb-6 px-2">
        <div className="flex gap-2">
          <button onClick={() => setViewMode('active')} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${viewMode === 'active' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white/50 text-slate-400 hover:bg-white hover:text-slate-600'}`}>Active Patients</button>
          <button onClick={() => setViewMode('discharged')} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${viewMode === 'discharged' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white/50 text-slate-400 hover:bg-white hover:text-slate-600'}`}>Discharged</button>
        </div>
        {isAdminPortal && (
          <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-slate-100 shadow-sm">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filter by Doctor:</span>
            <select value={adminDoctorFilter} onChange={(e) => setAdminDoctorFilter(e.target.value)} className="bg-transparent text-sm font-bold text-indigo-600 outline-none cursor-pointer">
              <option value="all">Entire Clinic</option>
              {allDoctors.map(d => <option key={d.id} value={d.id}>{d.name} {!d.is_active ? '(Inactive)' : ''}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* 5. Patient List */}
      <div className="space-y-6">
        {patients.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200 text-slate-400">
            <Dog size={48} className="mx-auto mb-4 opacity-10" />
            <p className="font-bold uppercase tracking-widest text-[10px]">No {viewMode} caseload found</p>
          </div>
        ) : patients.map(patient => {
          const assignedDoc = allDoctors.find(d => d.id === patient.doctor_id);
          return (
            <div key={patient.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden group transition-all hover:shadow-md">
              <div className="p-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">{patient.name}</h3>
                    <div className="flex items-center gap-3 text-xs font-bold text-slate-400 mt-1">
                       <span className="flex items-center gap-1"><User size={12}/> {patient.owner}</span>
                       <span className="text-slate-200">|</span>
                       <span className={`flex items-center gap-1 ${assignedDoc && !assignedDoc.is_active ? 'text-red-400' : 'text-indigo-400'}`}>
                          <ShieldCheck size={12}/> {assignedDoc ? assignedDoc.name : 'Unassigned'}
                       </span>
                    </div>
                  </div>
                  {/* FULL ACTION ROW RESTORED */}
                  <div className="flex gap-2">
                    <a href={`/?id=${patient.id}&code=${patient.access_code}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-lg text-sm font-bold transition-all border border-slate-100"><Eye size={16}/> Preview</a>
                    <button onClick={() => handleCopyInvite(patient)} className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-lg text-sm font-bold transition-all border border-slate-100">{copiedId === patient.id ? <Check size={16} className="text-emerald-500"/> : <Copy size={16}/>} Invite</button>
                    {viewMode === 'active' && <button onClick={() => { /* SMS Logic */ }} className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-lg text-sm font-bold transition-all border border-slate-100"><Send size={16}/> Update</button>}
                    <button onClick={() => setAdvancedOpen(prev => ({ ...prev, [patient.id]: !prev[patient.id] }))} className="flex items-center gap-1 px-4 py-2 bg-slate-100 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-all">Advanced {advancedOpen[patient.id] ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</button>
                  </div>
                </div>
                
                {advancedOpen[patient.id] && (
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 animate-in slide-in-from-top-2 duration-300">
                    <div className="mb-4">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Internal Staff Note</label>
                      <textarea onBlur={(e) => api.updateStage(patient.id, patient.stage, doctor.id, e.target.value)} defaultValue={patient.note || ''} className="w-full p-3 text-sm border rounded-lg h-20 outline-none focus:ring-2 focus:ring-indigo-50 bg-white" placeholder="Add commentary..." />
                      <div className="flex flex-wrap gap-2 mt-3">
                          {QUICK_NOTES.map(note => (
                              <button key={note} onClick={() => { /* Note Logic */ }} className="px-3 py-1.5 bg-white border border-slate-200 rounded text-xs font-bold text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-all">+ {note}</button>
                          ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-between items-end pt-4 border-t gap-y-4">
                      <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
                        <button onClick={() => setHistoryOpen({...historyOpen, [patient.id]: !historyOpen[patient.id]})} className="text-xs font-bold text-indigo-600 flex items-center gap-1 hover:underline"><History size={14}/> View Logs</button>
                        <CopyableInfo label="ID" value={patient.id} fieldKey={`${patient.id}-id`} />
                        <CopyableInfo label="Code" value={patient.access_code} fieldKey={`${patient.id}-code`} />
                      </div>
                      {viewMode === 'active' && <button onClick={() => setDischargeTarget(patient)} className="flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:bg-orange-50 bg-white px-4 py-2 rounded-xl border border-orange-100 shadow-sm transition-all hover:text-orange-700 active:scale-95"><Archive size={14} /> Discharge</button>}
                    </div>
                    {historyOpen[patient.id] && (
                      <div className="mt-4 border-t pt-4 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                        {patient.stage_history?.map((event, i) => {
                          const docWhoChanged = allDoctors.find(d => d.id === event.changed_by_doctor_id);
                          return (
                            <div key={i} className="text-xs text-slate-500 border-l-2 border-indigo-200 pl-3 ml-1 mb-2 last:mb-0">
                              <span className="font-bold">{STAGES.find(s => s.id === event.to_stage)?.label}</span> by {docWhoChanged ? docWhoChanged.name : 'System'} at {new Date(event.changed_at).toLocaleTimeString()}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                  {STAGES.map((stage) => {
                    const isActive = patient.stage === stage.id;
                    return (
                      <button key={stage.id} onClick={() => { if(viewMode === 'active') api.updateStage(patient.id, stage.id as StageId, doctor.id) }} disabled={viewMode === 'discharged'} className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${isActive && viewMode === 'active' ? `${stage.color} border-transparent text-white shadow-lg` : 'bg-white border-slate-100 text-slate-500 hover:text-slate-900'} ${viewMode === 'discharged' ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-50'}`}>
                        <stage.icon size={20} className="mb-1" />
                        <span className="text-xs font-bold leading-tight">{stage.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {notification && (
        <div className={`fixed bottom-8 right-8 px-6 py-4 rounded-2xl shadow-2xl z-[200] text-white font-bold flex items-center gap-3 animate-in fade-in zoom-in slide-in-from-bottom-10 duration-500 ${notification.type === 'success' ? 'bg-slate-900 border-emerald-500/50' : 'bg-red-600'}`}>
          {notification.type === 'success' && <CheckCircle className="text-emerald-400"/>}
          {notification.msg}
        </div>
      )}
    </div>
  );
};
