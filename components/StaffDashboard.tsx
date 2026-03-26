import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { logAuditEvent } from '../services/auditLog';
import { supabase } from '../services/supabase';
import { Patient, Doctor, StageId } from '../types';
import { STAGES, CLINIC_ID } from '../constants';
import {
  clinicContactUpdateEvent,
  getClinicContactSettings,
  loadClinicContactSettings,
  saveClinicContactSettings,
  subscribeToClinicContactSettings,
  uploadClinicLogo,
} from '../services/clinicSettings';
import { downloadJsonAsCsv } from '../services/csvExport';
import { 
  LogOut, Dog, Stethoscope, History, ChevronDown, ChevronUp, 
  Send, Loader2, User, Eye, Archive, Copy, Check, AlertTriangle, 
  CheckCircle, ShieldCheck, Users, UserPlus, UserMinus, Trash2, Phone, ClipboardList, Download
} from 'lucide-react';

const QUICK_NOTES = ["Doing well", "Vitals stable", "In progress", "Waking up", "Ready soon", "Call pending"];

interface StaffDashboardProps {
  onLogout: () => void;
  doctor: Doctor;
}

interface AuditLogRow {
  id: number;
  created_at: string;
  actor_user_id: string | null;
  actor_doctor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
}

export const StaffDashboard: React.FC<StaffDashboardProps> = ({ onLogout, doctor }) => {
  const HISTORY_WINDOWS = [
    { value: 'all', label: 'All Time', days: null },
    { value: '7', label: 'Last 7 Days', days: 7 },
    { value: '30', label: 'Last 30 Days', days: 30 },
    { value: '90', label: 'Last 90 Days', days: 90 },
  ] as const;

  // CORE STATE
  const [patients, setPatients] = useState<Patient[]>([]);
  const [allDoctors, setAllDoctors] = useState<Doctor[]>([]);
  const [viewMode, setViewMode] = useState<'active' | 'discharged' | 'history'>('active');
  const [isAdminPortal, setIsAdminPortal] = useState(false);
  const [hasAdminRole, setHasAdminRole] = useState(false);
  const [adminTab, setAdminTab] = useState<'staff' | 'settings' | 'audit'>('staff');
  const [adminDoctorFilter, setAdminDoctorFilter] = useState<string>('all');
  const [historySearch, setHistorySearch] = useState('');
  const [historyDateRange, setHistoryDateRange] = useState<(typeof HISTORY_WINDOWS)[number]['value']>('30');
  
  // SPECIALTY & STAFF MANAGEMENT
  const [specialties, setSpecialties] = useState<string[]>(["Internal Medicine", "Surgery", "Oncology", "Neurology", "ER & Critical Care", "Cardiology", "Dermatology"]);
  const [customSpecialty, setCustomSpecialty] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Doctor | null>(null);

  // INTERACTION & SYNC LOCKS
  const [updatingIds, setUpdatingIds] = useState<Record<string, boolean>>({});
  const [sendingLink, setSendingLink] = useState<Record<string, boolean>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [dischargeTarget, setDischargeTarget] = useState<Patient | null>(null);
  const [isDischargeModalClosing, setIsDischargeModalClosing] = useState(false);
  
  const [newPatient, setNewPatient] = useState({ name: '', owner: '', owner_phone: '' });
  const [newStaff, setNewStaff] = useState({ name: '', specialty: 'Internal Medicine', email: '' });
  const [clinicContactForm, setClinicContactForm] = useState(getClinicContactSettings());
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [auditPatientLookup, setAuditPatientLookup] = useState<Record<string, string>>({});
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  
  const [notification, setNotification] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({});
  const [advancedOpen, setAdvancedOpen] = useState<Record<string, boolean>>({});

  const loadData = async (options?: { silent?: boolean }) => {
    try {
      if (!supabase) return;

      const nowIso = new Date().toISOString();
      const fallbackGraceCutoff = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString();
      let patientQuery = supabase
        .from('patients')
        .select('*')
        .eq('clinic_id', CLINIC_ID);

      if (viewMode === 'history') {
        patientQuery = patientQuery
          .eq('status', 'archived')
          .or(`access_code_expires_at.lte.${nowIso},and(access_code_expires_at.is.null,discharged_at.lte.${fallbackGraceCutoff})`)
          .order('discharged_at', { ascending: false });

        if (historySearch.trim()) {
          const escapedTerm = historySearch.trim().replace(/[%_]/g, '');
          patientQuery = patientQuery.or(
            `name.ilike.%${escapedTerm}%,owner.ilike.%${escapedTerm}%,owner_contact.ilike.%${escapedTerm}%,owner_phone.ilike.%${escapedTerm}%`,
          );
        }

        const selectedWindow = HISTORY_WINDOWS.find((window) => window.value === historyDateRange);
        if (selectedWindow?.days) {
          const dateCutoff = new Date(Date.now() - (selectedWindow.days * 24 * 60 * 60 * 1000)).toISOString();
          patientQuery = patientQuery.gte('discharged_at', dateCutoff);
        }
      } else {
        patientQuery = patientQuery
          .eq('status', viewMode === 'discharged' ? 'archived' : viewMode)
          .order('name', { ascending: true });
      }

      const { data: pData } = await patientQuery;
      
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
    const channel = supabase
      ?.channel(`dashboard-live-${doctor.id}-${viewMode}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'patients',
          filter: `clinic_id=eq.${CLINIC_ID},status=eq.${viewMode === 'history' || viewMode === 'discharged' ? 'archived' : viewMode}`,
        },
        () => loadData({ silent: true }),
      )
      .subscribe();
    return () => { if (channel) supabase?.removeChannel(channel); };
  }, [doctor.id, viewMode, isAdminPortal, adminDoctorFilter, historySearch, historyDateRange]);

  useEffect(() => {
    let isMounted = true;

    const loadAdminRole = async () => {
      if (!supabase) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !isMounted) {
        setHasAdminRole(false);
        return;
      }

      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('clinic_id', CLINIC_ID)
        .eq('is_active', true)
        .eq('role', 'admin')
        .maybeSingle();

      if (!isMounted) return;
      setHasAdminRole(!error && !!data);
      if (error || !data) {
        setIsAdminPortal(false);
      }
    };

    void loadAdminRole();

    return () => {
      isMounted = false;
    };
  }, [doctor.id]);

  useEffect(() => {
    let isMounted = true;

    const refreshClinicContact = async () => {
      const settings = await loadClinicContactSettings(CLINIC_ID);
      if (isMounted) setClinicContactForm(settings);
    };

    void refreshClinicContact();

    const handleContactUpdate = () => {
      void refreshClinicContact();
    };

    const unsubscribe = subscribeToClinicContactSettings(CLINIC_ID, (settings) => {
      if (isMounted) setClinicContactForm(settings);
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

  const showNotification = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const generateTrackingId = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };

  const generateAccessCode = () => {
    return Array.from({ length: 6 }, () => Math.floor(Math.random() * 10).toString()).join('');
  };

  const normalizeUSPhone = (input: string) => {
    const digits = input.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return null;
  };

  const runAdminAction = async (action: () => PromiseLike<void> | void) => {
    if (!hasAdminRole) {
      showNotification('Admin access required', 'error');
      return;
    }

    await action();
  };

  const auditDoctorAction = async (
    action: string,
    targetType?: string,
    targetId?: string,
    metadata?: Record<string, unknown>,
  ) => {
    await logAuditEvent({
      action,
      clinicId: CLINIC_ID,
      targetType: targetType || null,
      targetId: targetId || null,
      actorDoctorId: doctor.id,
      metadata: metadata || null,
    });
  };

  const loadAuditLogs = async () => {
    if (!supabase || !hasAdminRole) return;
    setIsAuditLoading(true);
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, created_at, actor_user_id, actor_doctor_id, action, target_type, target_id')
        .eq('clinic_id', CLINIC_ID)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error || !data) {
        setAuditLogs([]);
        return;
      }

      const rows = data as AuditLogRow[];
      setAuditLogs(rows);

      const patientIds = Array.from(
        new Set(
          rows
            .filter((row) => row.target_type === 'patient' && !!row.target_id)
            .map((row) => row.target_id as string),
        ),
      );

      if (patientIds.length === 0) {
        setAuditPatientLookup({});
        return;
      }

      const { data: patientsData } = await supabase
        .from('patients')
        .select('id, name')
        .in('id', patientIds);

      const nextLookup = (patientsData || []).reduce<Record<string, string>>((acc, patient) => {
        acc[patient.id] = patient.name;
        return acc;
      }, {});

      setAuditPatientLookup(nextLookup);
    } finally {
      setIsAuditLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdminPortal || adminTab !== 'audit' || !hasAdminRole) return;
    void loadAuditLogs();
  }, [isAdminPortal, adminTab, hasAdminRole]);

  const exportHistoryToCsv = () => {
    if (patients.length === 0) {
      showNotification('No archived patients available for export', 'error');
      return;
    }

    downloadJsonAsCsv(
      patients.map((patient) => ({
        patient_id: patient.id,
        pet_name: patient.name,
        owner_name: patient.owner,
        owner_contact: patient.owner_contact || patient.owner_phone || '',
        assigned_doctor: allDoctors.find((doc) => doc.id === patient.doctor_id)?.name || '',
        discharged_at: patient.discharged_at || '',
        last_stage: patient.stage,
        note: patient.note || '',
      })),
      `patient-history-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  };

  const exportAuditLogsToCsv = () => {
    if (auditLogs.length === 0) {
      showNotification('No audit logs available for export', 'error');
      return;
    }

    downloadJsonAsCsv(
      auditLogs.map((entry) => {
        const actor = allDoctors.find((doc) => doc.user_id === entry.actor_user_id || doc.id === entry.actor_doctor_id);
        return {
          timestamp: entry.created_at,
          actor: actor?.email || actor?.name || entry.actor_user_id || 'System',
          action: entry.action,
          target_patient: entry.target_id ? (auditPatientLookup[entry.target_id] || '') : '',
          target_id: entry.target_id || '',
        };
      }),
      `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  };

  const handleStatusUpdate = async (patientId: string, newStage: StageId) => {
    if (updatingIds[patientId]) return;
    setUpdatingIds(prev => ({ ...prev, [patientId]: true }));
    try {
      await api.updateStage(patientId, newStage, doctor.id);
      await loadData({ silent: true });
      const patient = patients.find((entry) => entry.id === patientId);
      await auditDoctorAction('patient.stage_updated', 'patient', patientId, {
        doctorName: doctor.name,
        patientName: patient?.name || null,
        newStage,
      });
    } catch (error) {
      showNotification("Update failed", "error");
    } finally {
      setUpdatingIds(prev => ({ ...prev, [patientId]: false }));
    }
  };

  const handleSendLink = async (patient: Patient) => {
    const ownerContact = patient.owner_contact || patient.owner_phone;
    if (!ownerContact) { showNotification("No owner contact saved", "error"); return; }
    setSendingLink(prev => ({ ...prev, [patient.id]: true }));
    try {
      const data = await api.notifyParent(patient.id, 'check-in-link');
      if (data.success) {
        showNotification(`Link sent to ${ownerContact}`);
        await auditDoctorAction('patient.link_sent', 'patient', patient.id, {
          patientName: patient.name,
          ownerContact,
          template: 'check-in-link',
        });
      }
      else showNotification(`Notification Error: ${data.error}`, 'error');
    } catch (err) { showNotification('Connection error', 'error'); }
    finally { setSendingLink(prev => ({ ...prev, [patient.id]: false })); }
  };

  const closeDischargeModal = () => {
    setIsDischargeModalClosing(true);
  };

  const handleDischarge = async () => {
    if (!dischargeTarget) return;
    const patientId = dischargeTarget.id;
    const patientName = dischargeTarget.name;
    const updateData = {
      status: 'archived',
      stage: 'discharged',
      discharged_at: new Date().toISOString(),
    };
    try {
      const { error } = await supabase
        .from('patients')
        .update(updateData)
        .eq('id', patientId);
      if (error) throw error;

      setDischargeTarget(null);
      setPatients((prev) => prev.filter((patient) => patient.id !== patientId));
      setIsDischargeModalClosing(true);
      showNotification('Discharged');
      await auditDoctorAction('patient.discharged', 'patient', patientId, {
        patientName,
      });
    } catch (error) {
      showNotification('Discharge failed', 'error');
    }
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
    await auditDoctorAction(nextAdminValue ? 'staff.admin_granted' : 'staff.admin_removed', 'doctor', targetDoctor.id, {
      targetDoctorName: targetDoctor.name,
    });
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
              <button onClick={async () => runAdminAction(async () => {
                await supabase.from('doctors').delete().eq('id', deleteTarget.id);
                await auditDoctorAction('staff.deleted', 'doctor', deleteTarget.id, {
                  targetDoctorName: deleteTarget.name,
                });
                setDeleteTarget(null);
                loadData();
                showNotification("User Deleted");
              })} className="flex-1 px-6 py-4 text-sm font-bold text-red-600 hover:bg-red-50">Delete</button>
            </div>
          </div>
        </div>
      )}

      {dischargeTarget && (
        <div
          className={`fixed inset-0 z-[200] flex items-center justify-center p-4 transition-opacity duration-200 ${isDischargeModalClosing ? 'opacity-0' : 'opacity-100'} bg-slate-900/60 backdrop-blur-sm`}
          onTransitionEnd={() => {
            if (!isDischargeModalClosing) return;
            setDischargeTarget(null);
            setIsDischargeModalClosing(false);
          }}
        >
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden font-sans">
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4 text-orange-500"><AlertTriangle size={32} /></div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Confirm Discharge</h3>
              <p className="text-sm text-slate-500 font-medium">Move <span className="font-bold text-slate-900">{dischargeTarget.name}</span> to archives?</p>
            </div>
            <div className="flex border-t border-slate-100">
              <button onClick={closeDischargeModal} className="flex-1 px-6 py-4 text-sm font-bold text-slate-400 hover:bg-slate-50 border-r border-slate-100">Cancel</button>
              <button onClick={handleDischarge} className="flex-1 px-6 py-4 text-sm font-bold text-orange-600 hover:bg-orange-50">Discharge</button>
            </div>
          </div>
        </div>
      )}

      {notification && (
        <div className={`fixed top-4 right-4 px-6 py-4 rounded-lg shadow-xl z-50 text-white font-bold bg-indigo-600`}>{notification.msg}</div>
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
          {hasAdminRole && (
            <button onClick={() => setIsAdminPortal(!isAdminPortal)} className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all ${isAdminPortal ? 'bg-indigo-600 text-white shadow-md' : 'bg-amber-50 text-amber-700 border border-amber-100 hover:bg-amber-100'}`}>
              {isAdminPortal ? <Dog size={18}/> : <ShieldCheck size={18}/>} {isAdminPortal ? 'Patient Board' : 'Admin Portal'}
            </button>
          )}
          <button onClick={onLogout} className="flex items-center gap-2 px-6 py-3 bg-slate-50 rounded-xl text-sm font-bold text-slate-700 border border-slate-200 hover:bg-white hover:text-red-600 transition-all"><LogOut size={18} /> Logout</button>
        </div>
      </div>

      {/* 3. ADMIN TOOLS */}
      {isAdminPortal && hasAdminRole && (
        <div className="mb-8 animate-in slide-in-from-top-4 duration-300 space-y-6">
          <div className="flex flex-wrap gap-3 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
            <button onClick={() => setAdminTab('staff')} className={`px-4 py-2 rounded-xl text-sm font-bold ${adminTab === 'staff' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Staff Directory</button>
            <button onClick={() => setAdminTab('settings')} className={`px-4 py-2 rounded-xl text-sm font-bold ${adminTab === 'settings' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Clinic Settings</button>
            <button onClick={() => setAdminTab('audit')} className={`px-4 py-2 rounded-xl text-sm font-bold ${adminTab === 'audit' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Audit Logs</button>
          </div>

          {adminTab === 'staff' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                <h2 className="text-base font-bold text-slate-400 mb-6 flex items-center gap-2 uppercase tracking-wide"><UserPlus size={20}/> Onboard Provider</h2>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newStaff.name.trim()) {
                    showNotification('Provider name is required', 'error');
                    return;
                  }
                  if (!newStaff.email.trim()) {
                    showNotification('Staff email is required', 'error');
                    return;
                  }

                  await runAdminAction(async () => {
                    const email = newStaff.email.trim().toLowerCase();
                    const name = newStaff.name.trim();
                    const inviteResult = await api.inviteStaffMember({
                      name,
                      specialty: newStaff.specialty,
                      email,
                      clinicId: CLINIC_ID,
                    });

                    if (inviteResult.error) {
                      showNotification(inviteResult.error, 'error');
                      return;
                    }

                    await auditDoctorAction('staff.created', 'doctor', inviteResult.doctorId, {
                      targetDoctorName: name,
                      specialty: newStaff.specialty,
                      invitedEmail: email,
                    });

                    setNewStaff({ ...newStaff, name: '', email: '' });
                    await loadData();
                    showNotification('Invite sent and staff profile linked');
                  });
                }} className="space-y-5">
                  <input type="text" value={newStaff.name} onChange={(e) => setNewStaff({...newStaff, name: e.target.value})} placeholder="Provider Full Name" className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl text-lg font-semibold outline-none focus:ring-2 focus:ring-amber-500" />
                  <select value={newStaff.specialty} onChange={(e) => setNewStaff({...newStaff, specialty: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl text-lg font-semibold text-slate-700 outline-none">
                    {specialties.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input type="email" value={newStaff.email} onChange={(e) => setNewStaff({...newStaff, email: e.target.value})} placeholder="Staff Email" className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl text-lg font-semibold outline-none focus:ring-2 focus:ring-amber-500" />
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
                          <td className="py-5 text-slate-500 text-sm font-medium">{doc.email || 'No email set'}</td>
                          <td className="py-5 text-right">
                            <div className="flex justify-end gap-3">
                              <button onClick={() => runAdminAction(() => toggleDoctorAdmin(doc))} className={`px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${doc.is_admin ? 'text-amber-700 bg-amber-50 hover:bg-amber-100' : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'}`}>
                                {doc.is_admin ? 'Remove Admin' : 'Make Admin'}
                              </button>
                              <button onClick={() => runAdminAction(async () => {
                                await supabase.from('doctors').update({ is_active: !doc.is_active }).eq('id', doc.id);
                                await auditDoctorAction(doc.is_active ? 'staff.deactivated' : 'staff.reactivated', 'doctor', doc.id, {
                                  targetDoctorName: doc.name,
                                });
                                await loadData();
                              })} className={`p-3 rounded-2xl transition-all ${doc.is_active ? 'text-slate-300 hover:text-amber-600 hover:bg-amber-50' : 'text-emerald-500 bg-emerald-50'}`}>{doc.is_active ? <UserMinus size={22}/> : <CheckCircle size={22}/>}</button>
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

          {adminTab === 'settings' && (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8">
              <h2 className="text-base font-bold text-slate-400 mb-6 flex items-center gap-2 uppercase tracking-wide"><Phone size={20}/> Clinic Settings</h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await runAdminAction(async () => {
                    const result = await saveClinicContactSettings(clinicContactForm, CLINIC_ID);
                    setClinicContactForm(result.settings);
                    showNotification(result.source === 'remote' ? 'Clinic settings updated' : 'Clinic settings saved locally');
                    await auditDoctorAction('clinic.contact_settings_updated', 'clinic_settings', CLINIC_ID, {
                      source: result.source,
                      enableSmsNotifications: result.settings.enableSmsNotifications,
                    });
                  });
                }}
                className="space-y-5"
              >
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Clinic Name</label>
                  <input type="text" value={clinicContactForm.name} onChange={(e) => setClinicContactForm({ ...clinicContactForm, name: e.target.value })} className="mt-1 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Support Phone Number</label>
                  <input type="text" value={clinicContactForm.supportPhoneNumber} onChange={(e) => setClinicContactForm({ ...clinicContactForm, supportPhoneNumber: e.target.value, phone: e.target.value })} className="mt-1 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Brand Color</label>
                  <div className="mt-1 flex items-center gap-3">
                    <input
                      type="color"
                      value={clinicContactForm.brandColor}
                      onChange={(e) => setClinicContactForm({ ...clinicContactForm, brandColor: e.target.value })}
                      className="h-11 w-14 rounded-lg border border-slate-200 bg-slate-50 p-1"
                    />
                    <input
                      type="text"
                      value={clinicContactForm.brandColor}
                      onChange={(e) => setClinicContactForm({ ...clinicContactForm, brandColor: e.target.value })}
                      placeholder="#4f46e5"
                      className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-mono uppercase"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Clinic Logo</label>
                  <div className="mt-1 space-y-3">
                    {clinicContactForm.logoUrl ? (
                      <img src={clinicContactForm.logoUrl} alt="Clinic logo preview" className="h-16 w-16 rounded-xl border border-slate-200 object-contain bg-white p-1" />
                    ) : null}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        void runAdminAction(async () => {
                          setIsUploadingLogo(true);
                          try {
                            const { publicUrl } = await uploadClinicLogo(file, CLINIC_ID);
                            setClinicContactForm((prev) => ({ ...prev, logoUrl: publicUrl }));
                            showNotification('Logo uploaded');
                          } catch {
                            showNotification('Failed to upload logo', 'error');
                          } finally {
                            setIsUploadingLogo(false);
                          }
                        });
                      }}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-100 file:px-3 file:py-2 file:text-xs file:font-bold file:text-indigo-700"
                    />
                    {isUploadingLogo && <p className="text-xs text-slate-500">Uploading logo…</p>}
                  </div>
                </div>
                <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 cursor-pointer">
                  <span className="font-semibold text-slate-700">Enable SMS Notifications</span>
                  <input type="checkbox" checked={clinicContactForm.enableSmsNotifications} onChange={(e) => setClinicContactForm({ ...clinicContactForm, enableSmsNotifications: e.target.checked })} className="h-4 w-4" />
                </label>
                <div className="flex gap-3 pt-2">
                  <button type="submit" className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors">Save Settings</button>
                  <button type="button" onClick={() => { void loadClinicContactSettings(CLINIC_ID).then(setClinicContactForm); }} className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors">Reset</button>
                </div>
              </form>
            </div>
          )}

          {adminTab === 'audit' && (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-slate-400 flex items-center gap-2 uppercase tracking-wide"><ClipboardList size={20}/> Audit Logs</h2>
                <div className="flex items-center gap-3">
                  <button onClick={exportAuditLogsToCsv} className="inline-flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-emerald-700 hover:bg-emerald-100">
                    <Download size={14} /> Export to CSV
                  </button>
                  <button onClick={() => void loadAuditLogs()} className="text-sm font-bold text-indigo-600 hover:text-indigo-800">Refresh</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-100">
                      <th className="py-3 pr-4">Timestamp</th>
                      <th className="py-3 pr-4">Actor</th>
                      <th className="py-3 pr-4">Action Performed</th>
                      <th className="py-3 pr-4">Target Patient</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {isAuditLoading && (
                      <tr><td colSpan={4} className="py-6 text-center text-slate-500">Loading recent activity…</td></tr>
                    )}
                    {!isAuditLoading && auditLogs.length === 0 && (
                      <tr><td colSpan={4} className="py-6 text-center text-slate-500">No audit activity found.</td></tr>
                    )}
                    {!isAuditLoading && auditLogs.map((entry) => {
                      const actor = allDoctors.find((doc) => doc.user_id === entry.actor_user_id || doc.id === entry.actor_doctor_id);
                      const patientName = entry.target_id ? auditPatientLookup[entry.target_id] : '';
                      return (
                        <tr key={entry.id} className="text-slate-700">
                          <td className="py-3 pr-4 whitespace-nowrap">{new Date(entry.created_at).toLocaleString()}</td>
                          <td className="py-3 pr-4">{actor?.email || actor?.name || entry.actor_user_id || 'System'}</td>
                          <td className="py-3 pr-4 font-medium">{entry.action}</td>
                          <td className="py-3 pr-4">{patientName || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-400 mt-4">Showing the most recent 50 actions, newest first.</p>
            </div>
          )}
        </div>
      )}

      {/* 4. CHECK-IN FORM */}
      {viewMode !== 'history' && (
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-10 mb-8">
          <h2 className="text-sm font-bold mb-6 uppercase tracking-widest text-slate-400 px-1">Check In New Patient</h2>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const petName = newPatient.name.trim();
            const ownerName = newPatient.owner.trim();
            const normalizedOwnerPhone = normalizeUSPhone(newPatient.owner_phone);

            if (!petName || !ownerName || !normalizedOwnerPhone) {
              showNotification('Please enter pet name, owner name, and a valid US phone number.', 'error');
              return;
            }

            const id = generateTrackingId();
            const accessCode = generateAccessCode();

            const { error } = await supabase.from('patients').insert([{
              id,
              name: petName,
              owner: ownerName,
              owner_phone: normalizedOwnerPhone,
              access_code: accessCode,
              stage: 'checked-in',
              status: 'active',
              clinic_id: 'default',
              doctor_id: doctor.id,
              owner_contact: normalizedOwnerPhone,
              stage_history: [],
            }]);

            if (error) {
              showNotification(`Check-in failed: ${error.message}`, 'error');
              return;
            }

            void fetch('/api/sms', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                phoneNumber: normalizedOwnerPhone,
                petName,
                trackingId: id,
                accessCode,
              }),
            });

            setNewPatient({ name: '', owner: '', owner_phone: '' });
            setPatients((previous) => [{
              id,
              name: petName,
              owner: ownerName,
              owner_phone: normalizedOwnerPhone,
              owner_contact: normalizedOwnerPhone,
              access_code: accessCode,
              stage: 'checked-in',
              status: 'active',
              clinic_id: 'default',
              doctor_id: doctor.id,
              stage_history: [],
            } as Patient, ...previous]);
            showNotification("Checked in!");

            void auditDoctorAction('patient.created', 'patient', id, {
              patientName: petName,
              ownerName,
            });
          }} className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="md:col-span-3"><input type="text" required value={newPatient.name} onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl text-lg font-semibold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Pet Name" /></div>
            <div className="md:col-span-3"><input type="text" required value={newPatient.owner} onChange={(e) => setNewPatient({ ...newPatient, owner: e.target.value })} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl text-lg font-semibold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Owner Name" /></div>
            <div className="md:col-span-3"><input type="tel" required inputMode="tel" pattern="^\\s*(?:\\+1\\s*)?(?:\\([2-9]\\d{2}\\)|[2-9]\\d{2})[-.\\s]?\\d{3}[-.\\s]?\\d{4}\\s*$" value={newPatient.owner_phone} onChange={(e) => setNewPatient({ ...newPatient, owner_phone: e.target.value })} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl text-lg font-semibold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Owner Phone (US)" /></div>
            <div className="md:col-span-3"><button type="submit" className="w-full bg-indigo-600 text-white font-bold text-lg py-4 rounded-2xl shadow-lg transition-all hover:bg-indigo-700">Check In</button></div>
          </form>
        </div>
      )}

      {/* 5. NAVIGATION TABS */}
      <div className="mb-8 px-2 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex gap-4 bg-slate-200/50 p-2 rounded-2xl border border-slate-100 shadow-sm">
          <button onClick={() => setViewMode('active')} className={`px-12 py-3 rounded-xl text-base font-bold transition-all ${viewMode === 'active' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}>Active Patients</button>
          <button onClick={() => setViewMode('discharged')} className={`px-12 py-3 rounded-xl text-base font-bold transition-all ${viewMode === 'discharged' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}>Discharged</button>
          <button onClick={() => setViewMode('history')} className={`px-12 py-3 rounded-xl text-base font-bold transition-all ${viewMode === 'history' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}>History</button>
        </div>
        {isAdminPortal && hasAdminRole && (
          <div className="flex items-center gap-4 bg-white px-6 py-3 rounded-2xl border border-slate-100 shadow-sm">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Filter By Doctor:</span>
            <select value={adminDoctorFilter} onChange={(e) => setAdminDoctorFilter(e.target.value)} className="bg-transparent text-base font-bold text-indigo-600 outline-none cursor-pointer min-w-[160px]">
              <option value="all">Entire Clinic</option>
              {allDoctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {viewMode === 'history' && (
        <div className="mb-8 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Search History</span>
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Pet name, owner, phone, or email"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none focus:border-indigo-400"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Discharge Date</span>
                <select
                  value={historyDateRange}
                  onChange={(e) => setHistoryDateRange(e.target.value as (typeof HISTORY_WINDOWS)[number]['value'])}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-400"
                >
                  {HISTORY_WINDOWS.map((window) => (
                    <option key={window.value} value={window.value}>{window.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <button onClick={exportHistoryToCsv} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700">
              <Download size={16} /> Export to CSV
            </button>
          </div>
        </div>
      )}

      {/* 6. PATIENT LIST */}
      <div className="space-y-8">
        {patients.length === 0 && (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-500">
            {viewMode === 'history'
              ? 'No archived patients match the selected filters.'
              : 'No patients found for this view.'}
          </div>
        )}
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
                    {viewMode === 'active' && <button onClick={() => handleSendLink(patient)} disabled={sendingLink[patient.id]} className="flex items-center gap-2 px-8 py-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl text-sm font-bold border border-slate-100 transition-all font-sans">{sendingLink[patient.id] ? <Loader2 className="animate-spin" size={20}/> : <Send size={20}/>} Send Link</button>}
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
                      {viewMode === 'active' && <button onClick={() => { setIsDischargeModalClosing(false); setDischargeTarget(patient); }} className="flex items-center gap-2 px-10 py-4 bg-white text-orange-600 border border-orange-100 rounded-2xl text-xs font-bold uppercase tracking-widest shadow-sm hover:bg-orange-50 active:scale-95 transition-all font-sans"><Archive size={20} /> Discharge</button>}
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
                      <button key={stage.id} onClick={() => handleStatusUpdate(patient.id, stage.id as StageId)} disabled={viewMode !== 'active' || isProcessing} className={`flex flex-col items-center justify-center p-6 rounded-[2rem] border-2 transition-all ${isActive && viewMode === 'active' ? `${stage.color} border-transparent text-white shadow-xl scale-[1.04]` : 'bg-white border-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-50 shadow-sm'} ${viewMode !== 'active' ? 'opacity-40 cursor-not-allowed' : ''}`}>
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
