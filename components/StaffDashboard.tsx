import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import { Patient, Doctor, StageId } from '../types';
import { STAGES, CLINIC_ID } from '../constants';
import { ClinicContactSettings, getClinicContactSettings, setClinicContactSettings } from '../services/clinicSettings';
import { 
  Plus, LogOut, Dog, Stethoscope, History, ChevronDown, ChevronUp, 
  Send, Loader2, User, Eye, Archive, Copy, Check, AlertTriangle, 
  FileDown, CheckCircle, ShieldCheck, Users, UserPlus, UserMinus, Trash2, X, Settings
} from 'lucide-react';

const QUICK_NOTES = ["Doing well", "Vitals stable", "In progress", "Waking up", "Ready soon", "Call pending"];

interface StaffDashboardProps {
  onLogout: () => void;
  doctor: Doctor;
}

export const StaffDashboard: React.FC<StaffDashboardProps> = ({ onLogout, doctor }) => {
  // CORE STATE
  const [patients, setPatients] = useState<Patient[]>([]);
  const [allDoctors, setAllDoctors] = useState<Doctor[]>([]);
  const [viewMode, setViewMode] = useState<'active' | 'discharged'>('active');
  const [isAdminPortal, setIsAdminPortal] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [adminDoctorFilter, setAdminDoctorFilter] = useState<string>('all');
  
  // SPECIALTY & STAFF MANAGEMENT
  const [specialties, setSpecialties] = useState<string[]>(["Internal Medicine", "Surgery", "Oncology", "Neurology", "ER & Critical Care", "Cardiology", "Dermatology"]);
  const [customSpecialty, setCustomSpecialty] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Doctor | null>(null);

  // INTERACTION & SYNC LOCKS
  const [updatingIds, setUpdatingIds] = useState<Record<string, boolean>>({});
  const [sendingSms, setSendingSms] = useState<Record<string, boolean>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [dischargeTarget, setDischargeTarget] = useState<Patient | null>(null);
  
  const [newPatient, setNewPatient] = useState({ name: '', owner: '', owner_phone: '' });
  const [newStaff, setNewStaff] = useState({ name: '', specialty: 'Internal Medicine', pin: '' });
  const [clinicContactForm, setClinicContactForm] = useState<ClinicContactSettings>(getClinicContactSettings());
  
  const [notification, setNotification] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({});
  const [advancedOpen, setAdvancedOpen] = useState<Record<string, boolean>>({});

  const loadData = async (options?: { silent?: boolean }) => {
    try {
      if (!supabase) return;
      
      const { data: pData } = await supabase
        .from('patients')
        .select('*')
        .eq('clinic_id', CLINIC_ID)
        .eq('status', viewMode)
        .order('name', { ascending: true });
      
      let filtered = pData || [];
      if (!isAdminPortal) { filtered = filtered.filter((p: Patient) => p.doctor_id === doctor.id); }
      else if (adminDoctorFilter !== 'all') { filtered = filtered.filter((p: Patient) => p.doctor_id === adminDoctorFilter); }
      setPatients(filtered as Patient[]);

      const { data: dData } = await supabase.from('doctors').select('*').eq('clinic_id', CLINIC_ID).order('name', { ascending: true });
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

  const runAdminAction = async (action: () => PromiseLike<void> | void) => {
    if (!doctor.is_admin) {
      showNotification('Admin access required', 'error');
      return;
    }

    await action();
  };

  const handleStatusUpdate = async (patientId: string, newStage: StageId) => {
    if (updatingIds[patientId]) return;
    setUpdatingIds(prev => ({ ...prev, [patientId]: true }));
    try {
      await api.updateStage(patientId, newStage, doctor.id);
      await loadData({ silent: true });
    } catch (error) {
      showNotification("Update failed", "error");
    } finally {
      setUpdatingIds(prev => ({ ...prev, [patientId]: false }));
    }
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

  const toggleDoctorAdmin = async (targetDoctor: Doctor) => {
    const nextAdminValue = !targetDoctor.is_admin;
    if (targetDoctor.id === doctor.id && !nextAdminValue) {
      showNotification('You cannot remove your own admin access', 'error');
      return;
    }

    const { error } = await supabase
      .from('doctors')
      .update({ is_admin: nextAdminValue })
      .eq('id', targetDoctor.id);

    if (error) {
      showNotification('Failed to update admin access', 'error');
      return;
    }

    showNotification(nextAdminValue ? 'Admin access granted' : 'Admin access removed');
    await loadData({ silent: true });
  };

  const CopyableInfo = ({ label, value, fieldKey, customDisplay }: { label: string, value: string, fieldKey: string, customDisplay?: string }) => {
    const isCopied = copiedField === fieldKey;
    return (
      <div className="flex flex-col min-w-[150px]">
        <span className="text-xs font-semibold text-slate-400 mb-1">{label}</span>
        <button onClick={() => { navigator.clipboard.writeText(value); setCopiedField(fieldKey); setTimeout(() => setCopiedField(null), 2000); }} className="flex items-center gap-2 group text-base font-medium text-slate-800 hover:text-indigo-600 transition-colors text-left">
          <span className="font-mono truncate max-w-[200px]">{customDisplay || value}</span>
          {isCopied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} className="text-slate-400 group-hover:text-indigo-400" />}
        </button>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto pb-20 p-4 relative font-sans bg-slate-50 min-h-screen">
      {/* 1. MODALS */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden">
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500"><Trash2 size={32} /></div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Delete User?</h3>
              <p className="text-sm text-slate-500 font-medium">Permanently delete <span className="font-bold text-slate-900">{deleteTarget.name}</span>?</p>
            </div>
            <div className="flex border-t border-slate-100">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 px-6 py-4 text-sm font-bold text-slate-400 hover:bg-slate-50 border-r border-slate-100">Cancel</button>
              <button onClick={async () => runAdminAction(async () => { await supabase.from('doctors').delete().eq('id', deleteTarget.id); setDeleteTarget(null); loadData(); showNotification("User Deleted"); })} className="flex-1 px-6 py-4 text-sm font-bold text-red-600 hover:bg-red-50">Delete</button>
            </div>
          </div>
        </div>
      )}

      {dischargeTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden font-sans">
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4 text-orange-500"><AlertTriangle size={32} /></div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Confirm Discharge</h3>
              <p className="text-sm text-slate-500 font-medium">Move <span className="font-bold text-slate-900">{dischargeTarget.name}</span> to archives?</p>
            </div>
            <div className="flex border-t border-slate-100">
              <button onClick={() => setDischargeTarget(null)} className="flex-1 px-6 py-4 text-sm font-bold text-slate-400 hover:bg-slate-50 border-r border-slate-100">Cancel</button>
              <button onClick={async () => { await supabase.from('patients').update({ status: 'discharged', updated_at: new Date().toISOString() }).eq('id', dischargeTarget.id); setDischargeTarget(null); loadData(); showNotification('Discharged'); }} className="flex-1 px-6 py-4 text-sm font-bold text-orange-600 hover:bg-orange-50">Discharge</button>
            </div>
          </div>
        </div>
      )}

      {notification && (
        <div className={`fixed top-4 right-4 px-6 py-4 rounded-lg shadow-xl z-50 text-white font-bold bg-indigo-600`}>{notification.msg}</div>
      )}

      {isSettingsOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[220] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden font-sans border border-slate-100">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Admin Settings</h3>
                <p className="text-sm text-slate-500 font-medium">Client footer contact information</p>
              </div>
              <button onClick={() => setIsSettingsOpen(false)} className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors">
                <X size={20} />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await runAdminAction(() => {
                  setClinicContactSettings(clinicContactForm);
                  showNotification('Contact footer updated');
                  setIsSettingsOpen(false);
                });
              }}
              className="p-8 space-y-4"
            >
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Clinic Name</label>
                <input type="text" value={clinicContactForm.name} onChange={(e) => setClinicContactForm({ ...clinicContactForm, name: e.target.value })} placeholder="Clinic Name" className="mt-1 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Phone</label>
                <input type="text" value={clinicContactForm.phone} onChange={(e) => setClinicContactForm({ ...clinicContactForm, phone: e.target.value })} placeholder="(555) 123-4567" className="mt-1 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Hours</label>
                <input type="text" value={clinicContactForm.hours} onChange={(e) => setClinicContactForm({ ...clinicContactForm, hours: e.target.value })} placeholder="Mon–Fri 8am–6pm" className="mt-1 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Email (Optional)</label>
                <input type="email" value={clinicContactForm.email} onChange={(e) => setClinicContactForm({ ...clinicContactForm, email: e.target.value })} placeholder="hello@yourclinic.com" className="mt-1 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-3 rounded-xl transition-colors">Save Footer</button>
                <button type="button" onClick={() => setClinicContactForm(getClinicContactSettings())} className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors">Reset</button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* 2. HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-5">
          <div className={`p-4 rounded-2xl text-white shadow-lg ${isAdminPortal ? 'bg-amber-500' : 'bg-indigo-600'}`}><Stethoscope size={28}/></div>
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">{isAdminPortal ? 'Clinic Admin' : doctor.name}</h1>
            <p className="text-indigo-600 font-semibold text-base">{isAdminPortal ? 'Operations Management' : doctor.specialty}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {doctor.is_admin && (
            <button onClick={() => setIsAdminPortal(!isAdminPortal)} className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all ${isAdminPortal ? 'bg-indigo-600 text-white shadow-md' : 'bg-amber-50 text-amber-700 border border-amber-100 hover:bg-amber-100'}`}>
              {isAdminPortal ? <Dog size={18}/> : <ShieldCheck size={18}/>} {isAdminPortal ? 'Patient Board' : 'Admin Portal'}
            </button>
          )}
          {doctor.is_admin && (
            <button onClick={() => setIsSettingsOpen(true)} className="flex items-center gap-2 px-4 py-3 bg-slate-50 rounded-xl text-sm font-bold text-slate-700 border border-slate-200 hover:bg-white hover:text-indigo-600 transition-all" aria-label="Open admin settings">
              <Settings size={18} /> Settings
            </button>
          )}
          <button onClick={onLogout} className="flex items-center gap-2 px-6 py-3 bg-slate-50 rounded-xl text-sm font-bold text-slate-700 border border-slate-200 hover:bg-white hover:text-red-600 transition-all"><LogOut size={18} /> Logout</button>
        </div>
      </div>

      {/* 3. ADMIN TOOLS */}
      {isAdminPortal && (
        <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in slide-in-from-top-4 duration-300">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <h2 className="text-base font-bold text-slate-400 mb-6 flex items-center gap-2 uppercase tracking-wide"><UserPlus size={20}/> Onboard Provider</h2>
            <form onSubmit={async (e) => {
               e.preventDefault();
               if (!newStaff.name.trim()) {
                 showNotification('Provider name is required', 'error');
                 return;
               }
               if (newStaff.pin.length !== 4) {
                 showNotification('PIN must be 4 digits', 'error');
                 return;
               }

               await runAdminAction(async () => {
                 const id = `doc-${Math.random().toString(36).substring(2, 8)}`;
                 const { error } = await supabase.from('doctors').insert([{ ...newStaff, name: newStaff.name.trim(), id, clinic_id: CLINIC_ID, is_active: true, is_admin: false }]);
                 if (!error) { setNewStaff({ ...newStaff, name: '', pin: '' }); loadData(); showNotification("User Added"); }
                 else { showNotification('Unable to add staff member', 'error'); }
               });
            }} className="space-y-5">
              <input type="text" value={newStaff.name} onChange={(e) => setNewStaff({...newStaff, name: e.target.value})} placeholder="Provider Full Name" className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl text-lg font-semibold outline-none focus:ring-2 focus:ring-amber-500" />
              <select value={newStaff.specialty} onChange={(e) => setNewStaff({...newStaff, specialty: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl text-lg font-semibold text-slate-700 outline-none">
                  {specialties.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <input type="text" maxLength={4} value={newStaff.pin} onChange={(e) => setNewStaff({...newStaff, pin: e.target.value.replace(/\D/g,'')})} placeholder="PIN (4 Digits)" className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl text-lg font-bold tracking-[0.2em] outline-none" />
              <button type="submit" className="w-full py-5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-lg rounded-2xl shadow-lg transition-all">Add Staff Member</button>
            </form>
          </div>
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
             <h2 className="text-base font-bold text-slate-400 mb-6 flex items-center gap-2 uppercase tracking-wide"><Users size={20}/> Clinical Staff Directory</h2>
             <div className="flex-1 overflow-y-auto max-h-[460px]">
               <table className="w-full text-left">
                  <tbody className="divide-y divide-slate-50">
                    {allDoctors.map(doc => (
                      <tr key={doc.id} className="text-base group">
                        <td className="py-5">
                           <div className="font-bold text-slate-800 text-lg">{doc.name} {doc.is_admin && <span className="ml-2 text-xs text-amber-500 font-bold bg-amber-50 px-2 py-0.5 rounded">ADMIN</span>}</div>
                           <div className="text-sm text-slate-500 font-medium">{doc.specialty}</div>
                        </td>
                        <td className="py-5 font-mono text-slate-500 font-bold tracking-widest">{doc.pin}</td>
                        <td className="py-5 text-right">
                          <div className="flex justify-end gap-3">
                             <button onClick={() => runAdminAction(() => toggleDoctorAdmin(doc))} className={`px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${doc.is_admin ? 'text-amber-700 bg-amber-50 hover:bg-amber-100' : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'}`}>
                               {doc.is_admin ? 'Remove Admin' : 'Make Admin'}
                             </button>
                             <button onClick={() => runAdminAction(() => supabase.from('doctors').update({ is_active: !doc.is_active }).eq('id', doc.id).then(() => loadData()))} className={`p-3 rounded-2xl transition-all ${doc.is_active ? 'text-slate-300 hover:text-amber-600 hover:bg-amber-50' : 'text-emerald-500 bg-emerald-50'}`}>{doc.is_active ? <UserMinus size={22}/> : <CheckCircle size={22}/>}</button>
                             {!doc.is_admin && <button onClick={() => setDeleteTarget(doc)} className="p-3 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-all"><Trash2 size={22}/></button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
               </table>
             </div>
          </div>
        </div>
      )}

      {/* 4. CHECK-IN FORM */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-10 mb-8">
          <h2 className="text-sm font-bold mb-6 uppercase tracking-widest text-slate-400 px-1">Check In New Patient</h2>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const id = Math.random().toString(36).substring(2, 14);
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            const { error } = await supabase.from('patients').insert([{ ...newPatient, id, clinic_id: CLINIC_ID, doctor_id: doctor.id, stage: 'checked-in', status: 'active', access_code: code, stage_history: [] }]);
            if (!error) { setNewPatient({ name: '', owner: '', owner_phone: '' }); loadData(); showNotification("Checked in!"); }
          }} className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="md:col-span-3"><input type="text" value={newPatient.name} onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl text-lg font-semibold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Pet Name" /></div>
            <div className="md:col-span-3"><input type="text" value={newPatient.owner} onChange={(e) => setNewPatient({ ...newPatient, owner: e.target.value })} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl text-lg font-semibold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Owner Name" /></div>
            <div className="md:col-span-3"><input type="tel" value={newPatient.owner_phone} onChange={(e) => setNewPatient({ ...newPatient, owner_phone: e.target.value })} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl text-lg font-semibold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="+1 (704) 555-0123" /></div>
            <div className="md:col-span-3"><button type="submit" className="w-full bg-indigo-600 text-white font-bold text-lg py-4 rounded-2xl shadow-lg transition-all hover:bg-indigo-700">Check In</button></div>
          </form>
      </div>

      {/* 5. NAVIGATION TABS */}
      <div className="mb-8 px-2 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex gap-4 bg-slate-200/50 p-2 rounded-2xl border border-slate-100 shadow-sm">
          <button onClick={() => setViewMode('active')} className={`px-12 py-3 rounded-xl text-base font-bold transition-all ${viewMode === 'active' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}>Active Patients</button>
          <button onClick={() => setViewMode('discharged')} className={`px-12 py-3 rounded-xl text-base font-bold transition-all ${viewMode === 'discharged' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}>Discharged</button>
        </div>
        {isAdminPortal && (
          <div className="flex items-center gap-4 bg-white px-6 py-3 rounded-2xl border border-slate-100 shadow-sm">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Filter By Doctor:</span>
            <select value={adminDoctorFilter} onChange={(e) => setAdminDoctorFilter(e.target.value)} className="bg-transparent text-base font-bold text-indigo-600 outline-none cursor-pointer min-w-[160px]">
              <option value="all">Entire Clinic</option>
              {allDoctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* 6. PATIENT LIST */}
      <div className="space-y-8">
        {patients.map(patient => {
          const assignedDoc = allDoctors.find(d => d.id === patient.doctor_id);
          const clientLink = `${window.location.origin}/?id=${patient.id}&code=${patient.access_code}`;
          const isProcessing = updatingIds[patient.id];

          return (
            <div key={patient.id} className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden group transition-all hover:shadow-md">
              <div className="p-10 lg:p-12">
                <div className="flex flex-col lg:flex-row justify-between items-start gap-8 mb-10">
                  <div>
                    <h3 className="text-4xl font-extrabold text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors font-sans">{patient.name}</h3>
                    <div className="flex flex-wrap items-center gap-6 text-sm font-bold text-slate-500">
                       <span className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 font-sans"><User size={18}/> {patient.owner}</span>
                       <span className="flex items-center gap-2 bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl border border-indigo-100 font-sans">
                          <ShieldCheck size={18}/> {assignedDoc ? assignedDoc.name : 'Unassigned'}
                       </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <a href={clientLink} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-8 py-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl text-sm font-bold border border-slate-100 transition-all font-sans"><Eye size={20}/> Preview</a>
                    {viewMode === 'active' && <button onClick={() => handleSendSMS(patient)} disabled={sendingSms[patient.id]} className="flex items-center gap-2 px-8 py-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl text-sm font-bold border border-slate-100 transition-all font-sans">{sendingSms[patient.id] ? <Loader2 className="animate-spin" size={20}/> : <Send size={20}/>} Update</button>}
                    <button onClick={() => setAdvancedOpen(prev => ({ ...prev, [patient.id]: !prev[patient.id] }))} className="flex items-center gap-2 px-8 py-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl text-sm font-bold border border-slate-100 transition-all font-sans">Advanced {advancedOpen[patient.id] ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}</button>
                  </div>
                </div>
                
                {advancedOpen[patient.id] && (
                  <div className="bg-slate-50 p-10 rounded-[2rem] border border-slate-200 mb-10 animate-in slide-in-from-top-4">
                    <label className="block text-xs font-bold uppercase text-slate-400 mb-4 px-1 tracking-widest font-sans">Internal Clinical Note</label>
                    <textarea onBlur={(e) => api.updateStage(patient.id, patient.stage, doctor.id, e.target.value)} defaultValue={patient.note || ''} className="w-full p-6 bg-white border border-slate-100 rounded-3xl text-lg font-semibold h-28 mb-6 outline-none shadow-sm focus:ring-2 focus:ring-indigo-100 transition-all" placeholder="Enter clinical details..." />
                    
                    <div className="flex flex-wrap gap-3 mb-10">
                        {QUICK_NOTES.map(note => (
                            <button key={note} onClick={() => api.updateStage(patient.id, patient.stage, doctor.id, note).then(() => loadData())} className="px-6 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm">+ {note}</button>
                        ))}
                    </div>

                    <div className="flex flex-wrap justify-between items-center pt-10 border-t border-slate-200 gap-y-8">
                      <div className="flex flex-wrap items-center gap-x-12 gap-y-8">
                        <button onClick={() => setHistoryOpen({...historyOpen, [patient.id]: !historyOpen[patient.id]})} className="text-sm font-bold text-indigo-600 flex items-center gap-2 uppercase tracking-widest hover:opacity-70 font-sans"><History size={20}/> View Logs</button>
                        <CopyableInfo label="Portal Access" value={clientLink} fieldKey={`${patient.id}-link`} customDisplay="Copy Direct Link" />
                        <CopyableInfo label="System ID" value={patient.id} fieldKey={`${patient.id}-id`} />
                        <CopyableInfo label="Security Code" value={patient.access_code} fieldKey={`${patient.id}-code`} />
                      </div>
                      {viewMode === 'active' && <button onClick={() => setDischargeTarget(patient)} className="flex items-center gap-2 px-10 py-4 bg-white text-orange-600 border border-orange-100 rounded-2xl text-xs font-bold uppercase tracking-widest shadow-sm hover:bg-orange-50 active:scale-95 transition-all font-sans"><Archive size={20} /> Discharge</button>}
                    </div>

                    {historyOpen[patient.id] && (
                      <div className="mt-10 border-t border-slate-200 pt-10 max-h-72 overflow-y-auto pr-6 custom-scrollbar">
                        <div className="space-y-8">
                          {(patient.stage_history || []).map((event, i) => {
                            const changer = allDoctors.find(d => d.id === event.changed_by_doctor_id);
                            return (
                              <div key={i} className="flex gap-8 items-start animate-in fade-in slide-in-from-left-2">
                                <div className="w-3 h-3 rounded-full bg-indigo-400 mt-2 shrink-0 shadow-[0_0_12px_rgba(129,140,248,0.6)]" />
                                <div className="text-base font-sans">
                                  <p className="font-bold text-slate-900 text-lg leading-none mb-2">{STAGES.find(s => s.id === event.to_stage)?.label}</p>
                                  <p className="text-sm font-semibold text-slate-400 uppercase tracking-tight">Updated by {changer ? changer.name : 'System'} • {new Date(event.changed_at).toLocaleString()}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 relative">
                  {isProcessing && (
                    <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] z-10 flex items-center justify-center rounded-[2rem]">
                      <Loader2 className="animate-spin text-indigo-600" size={40} />
                    </div>
                  )}
                  {STAGES.map((stage) => {
                    const isActive = patient.stage === stage.id;
                    return (
                      <button key={stage.id} onClick={() => handleStatusUpdate(patient.id, stage.id as StageId)} disabled={viewMode === 'discharged' || isProcessing} className={`flex flex-col items-center justify-center p-6 rounded-[2rem] border-2 transition-all ${isActive && viewMode === 'active' ? `${stage.color} border-transparent text-white shadow-xl scale-[1.04]` : 'bg-white border-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-50 shadow-sm'} ${viewMode === 'discharged' ? 'opacity-40 cursor-not-allowed' : ''}`}>
                        <stage.icon size={28} className="mb-3" />
                        <span className="text-sm font-bold leading-tight text-center font-sans">{stage.label}</span>
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
