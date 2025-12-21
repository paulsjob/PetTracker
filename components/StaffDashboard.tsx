import React, { useState, useEffect, useRef } from 'react';
import { api, DOCTORS } from '../services/api';
import { supabase } from '../services/supabase';
import { Patient, Doctor, StageId, PatientStageEvent } from '../types';
import { STAGES, DEMO_MODE } from '../constants';
import { 
  Plus, Trash2, Search, LogOut, Clock, User, Dog, Stethoscope, 
  Key, Archive, X, MessageSquare, ArrowUpDown, Eye, RotateCcw, 
  History, ChevronDown, ChevronUp, Database, FileText, Send, 
  ShieldCheck, Download, AlertTriangle, Loader2
} from 'lucide-react';

interface StaffDashboardProps {
  onLogout: () => void;
  doctor: Doctor;
}

const QUICK_NOTES = [
  "Doing well",
  "Vitals stable",
  "In progress",
  "Waking up",
  "Ready soon",
  "Call pending"
];

export const StaffDashboard: React.FC<StaffDashboardProps> = ({ onLogout, doctor }) => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingSms, setSendingSms] = useState<Record<string, boolean>>({});
  const [newPatient, setNewPatient] = useState({ name: '', owner: '' });
  const [notification, setNotification] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  const [revealedCodes, setRevealedCodes] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<'active' | 'discharged'>('active');
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({});
  const [advancedOpen, setAdvancedOpen] = useState<Record<string, boolean>>({});
  const [confirmDischargeId, setConfirmDischargeId] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<StageId | 'all'>('all');
  const [sortMode, setSortMode] = useState<'name' | 'stage' | 'recent'>('name');

  const fetchingRef = useRef(false);
  const lastInteractionRef = useRef<Record<string, number>>({});

  const loadData = async (options?: { silent?: boolean }) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      const data = await api.getPatients(doctor.id);
      setPatients(data);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Connection failed';
      if (!options?.silent) {
        showNotification(`Sync Error: ${msg}`, 'error');
      }
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  };

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel('public:patients')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'patients' },
        (payload) => {
          setPatients((currentPatients) =>
            currentPatients.map((p) => {
              if (p.id !== payload.new.id) return p;
              const lastClickTime = lastInteractionRef.current[p.id] || 0;
              if (Date.now() - lastClickTime < 2000) return p; 
              const localTime = new Date(p.updated_at || 0).getTime();
              const serverTime = new Date(payload.new.updated_at || 0).getTime();
              if (localTime > serverTime) return p;
              return { ...p, ...payload.new };
            })
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [doctor.id]);

  useEffect(() => {
    if (loading) return;
    const currentIds = new Set(patients.map(p => p.id));
    const pruneState = (prevState: Record<string, any>) => {
      const nextState = { ...prevState };
      let hasChanges = false;
      Object.keys(nextState).forEach(id => {
        if (!currentIds.has(id)) {
          delete nextState[id];
          hasChanges = true;
        }
      });
      return hasChanges ? nextState : prevState;
    };
    setRevealedCodes(prev => pruneState(prev));
    setHistoryOpen(prev => pruneState(prev));
    setAdvancedOpen(prev => pruneState(prev));
    setNoteDrafts(prev => pruneState(prev));
  }, [patients, loading]);

  const showNotification = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const toggleCodeReveal = (id: string) => {
    setRevealedCodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleHistory = (id: string) => {
    setHistoryOpen(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAddPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatient.name || !newPatient.owner) return;
    try {
      await api.createPatient(newPatient, doctor.id);
      setNewPatient({ name: '', owner: '' });
      showNotification('Patient checked in successfully');
      loadData({ silent: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      showNotification(`Failed: ${msg}`, 'error');
    }
  };

  const handleNoteChange = (id: string, text: string) => {
    setNoteDrafts(prev => ({ ...prev, [id]: text }));
  };

  const handleStatusUpdate = async (id: string, newStage: StageId) => {
    lastInteractionRef.current[id] = Date.now();
    const note = noteDrafts[id];
    
    setPatients(prev => prev.map(p => {
      if (p.id !== id) return p;
      
      const newEvent: PatientStageEvent = {
        from_stage: p.stage,
        to_stage: newStage,
        changed_at: new Date().toISOString(),
        changed_by_doctor_id: doctor.id
      };
      
      const updatedHistory = [newEvent, ...(p.stage_history || [])].slice(0, 10);
      
      return { 
        ...p, 
        stage: newStage, 
        note: note !== undefined ? note : p.note, 
        stage_history: updatedHistory,
        updated_by_doctor_id: doctor.id, 
        updated_at: new Date().toISOString() 
      };
    }));
    
    try {
      await api.updateStage(id, newStage, doctor.id, note);
      showNotification('Status updated');
      setNoteDrafts(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (error) {
      loadData({ silent: true });
      const msg = error instanceof Error ? error.message : 'Unknown error';
      showNotification(`Update failed: ${msg}`, 'error');
    }
  };

  const handleSendSMS = async (patient: Patient) => {
    // You'll need to make sure 'owner_phone' exists in your patient type/database.
    // If not, we can prompt for it or use a default for testing.
    const phone = (patient as any).owner_phone || prompt("Enter owner's mobile number:", "+1");
    if (!phone) return;

    setSendingSms(prev => ({ ...prev, [patient.id]: true }));
    
    const stageLabel = STAGES.find(s => s.id === patient.stage)?.label || 'Checked In';
    const clientLink = `${window.location.origin}${window.location.pathname}?id=${patient.id}&code=${patient.access_code}`;
    
    try {
      const response = await fetch('/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: phone,
          body: `Update for ${patient.name}: Status is now ${stageLabel}. Track live here: ${clientLink}`
        }),
      });

      const data = await response.json();
      if (data.success) {
        showNotification(`SMS update sent to ${phone}`);
      } else {
        showNotification(`SMS Failed: ${data.error}`, 'error');
      }
    } catch (err) {
      showNotification('Could not connect to SMS service', 'error');
    } finally {
      setSendingSms(prev => ({ ...prev, [patient.id]: false }));
    }
  };

  const executeDischarge = async () => {
    if (!confirmDischargeId) return;
    const id = confirmDischargeId;
    try {
      await api.dischargePatient(id, doctor.id);
      setPatients(patients.map(p => p.id === id ? { ...p, status: 'discharged', updated_by_doctor_id: doctor.id, updated_at: new Date().toISOString() } : p));
      showNotification('Patient discharged');
      setConfirmDischargeId(null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      showNotification(`Failed to discharge: ${msg}`, 'error');
    }
  };

  const handleDischargeOrDelete = async (id: string) => {
    if (viewMode === 'active') {
      setConfirmDischargeId(id);
    } else {
      if (!confirm('Permanently delete this record? This cannot be undone.')) return;
      try {
        await api.deletePatient(id);
        setPatients(patients.filter(p => p.id !== id));
        showNotification('Record permanently deleted');
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        showNotification(`Failed to delete: ${msg}`, 'error');
      }
    }
  };

  const handlePreview = (patient: Patient) => {
    const baseUrl = window.location.origin + window.location.pathname;
    const url = `${baseUrl}?id=${patient.id}&code=${patient.access_code}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const copyAutoLoginLink = (patient: Patient) => {
    const baseUrl = window.location.origin + window.location.pathname;
    const autoLink = `${baseUrl}?id=${patient.id}&code=${patient.access_code}`;
    navigator.clipboard.writeText(autoLink).then(() => {
      showNotification('Auto-login link copied.');
    });
  };

  const handleExportCSV = async () => {
    try {
      const data = await api.getAllPatients();
      const headers = ['ID', 'Name', 'Owner', 'Access Code', 'Stage', 'Status', 'Note', 'Created At', 'Updated At', 'Stage History'];
      const csvContent = [
        headers.join(','),
        ...data.map(p => {
          return [
            p.id, p.name, p.owner, p.access_code, p.stage, p.status, p.note || '', p.created_at, p.updated_at || '', JSON.stringify(p.stage_history || [])
          ].map(field => {
            const stringField = String(field || '');
            return `"${stringField.replace(/"/g, '""')}"`;
          }).join(',');
        })
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vettrack-global-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showNotification('Global CSV export complete.');
    } catch (e) {
      showNotification('Export failed', 'error');
    }
  };

  const handleResetData = async () => {
    if (!confirm('WARNING: This will erase all local patient records and restore the default demo data. Are you sure?')) return;
    try {
      await api.resetDemoData();
      showNotification('Demo data reset successfully');
    } catch (e) {
      showNotification('Reset failed', 'error');
    }
  };

  const scopedPatients = patients.filter(p => p.status === viewMode);
  const filteredPatients = scopedPatients
    .filter(p => (stageFilter === 'all' || p.stage === stageFilter))
    .filter(p => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return p.name.toLowerCase().includes(q) || p.owner.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sortMode === 'name') return a.name.localeCompare(b.name);
      const timeA = new Date(a.updated_at || 0).getTime();
      const timeB = new Date(b.updated_at || 0).getTime();
      if (sortMode === 'recent') return timeB - a.id.length; 
      const validIdxA = STAGES.findIndex(s => s.id === a.stage);
      const validIdxB = STAGES.findIndex(s => s.id === b.stage);
      return (validIdxA === -1 ? 999 : validIdxA) - (validIdxB === -1 ? 999 : validIdxB);
    });

  return (
    <div className="max-w-7xl mx-auto pb-20">
      {notification && (
        <div className={`fixed top-4 right-4 px-6 py-4 rounded-lg shadow-xl z-50 animate-fade-in text-white font-medium max-w-md break-words ${notification.type === 'success' ? 'bg-indigo-600' : 'bg-red-600'}`}>
          {notification.msg}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <div className="flex items-center gap-2 mb-1">
             <Stethoscope className="text-indigo-600" size={24} />
             <h1 className="text-2xl font-bold text-gray-900">{doctor.name}</h1>
          </div>
          <p className="text-indigo-600 font-medium">{doctor.specialty}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 mr-2 border-r border-slate-200 pr-4">
            <button onClick={handleExportCSV} className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg transition-colors font-bold text-sm">
              <Download size={18} /> Export Data (CSV)
            </button>
            {DEMO_MODE && (
              <button onClick={handleResetData} title="Reset Demo Data" className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                <RotateCcw size={18} />
              </button>
            )}
          </div>
          <button onClick={onLogout} className="flex items-center gap-2 px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors font-medium">
            <LogOut size={18} /> <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>

      {viewMode === 'active' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-800">
            <Plus className="text-indigo-600" size={20} />
            Check In New Patient
          </h2>
          <form onSubmit={handleAddPatient} className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Patient Name</label>
              <div className="relative">
                <Dog className="absolute left-3 top-2.5 text-gray-400" size={18} />
                <input type="text" value={newPatient.name} onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })} className="w-full pl-10 pr-4 py-2 bg-white text-gray-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder-gray-400" placeholder="e.g. Bella" />
              </div>
            </div>
            <div className="md:col-span-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Owner Name</label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 text-gray-400" size={18} />
                <input type="text" value={newPatient.owner} onChange={(e) => setNewPatient({ ...newPatient, owner: e.target.value })} className="w-full pl-10 pr-4 py-2 bg-white text-gray-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder-gray-400" placeholder="e.g. John Smith" />
              </div>
            </div>
            <div className="md:col-span-4 flex items-end">
              <button type="submit" disabled={!newPatient.name || !newPatient.owner} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-2.5 px-4 rounded-lg transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2">
                <Clock size={18} /> Check In
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex gap-6 border-b border-slate-200 mb-6">
            <button onClick={() => setViewMode('active')} className={`pb-3 px-1 text-sm font-semibold transition-all border-b-2 -mb-[2px] ${viewMode === 'active' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>Active Patients</button>
            <button onClick={() => setViewMode('discharged')} className={`pb-3 px-1 text-sm font-semibold transition-all border-b-2 -mb-[2px] ${viewMode === 'discharged' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>Discharged Records</button>
          </div>
          <div className="flex flex-col gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
              <input type="text" placeholder="Search pet or owner..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-10 py-2 bg-white text-gray-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder-gray-400" />
            </div>
          </div>
        </div>

        {filteredPatients.map(patient => {
          const totalHistoryEvents = (patient.stage_history || []).length;
          const displayHistory = (patient.stage_history || []).slice(0, 6);
          const currentNoteValue = noteDrafts[patient.id] !== undefined ? noteDrafts[patient.id] : (patient.note ?? '');

          return (
            <div key={patient.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
              <div className="p-6">
                <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{patient.name}</h3>
                    <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-4 text-sm text-gray-500 mt-1">
                      <span className="flex items-center gap-1"><User size={14} /> Owner: {patient.owner}</span>
                      <span className="flex items-center gap-1 text-indigo-600 font-mono bg-indigo-50 px-2 rounded">
                        <Key size={14} /> 
                        <span className="mr-1">Code: {revealedCodes[patient.id] ? patient.access_code : '••••••'}</span>
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row w-full sm:w-auto items-stretch sm:items-center gap-2">
                    <button 
                      onClick={() => handleSendSMS(patient)} 
                      disabled={sendingSms[patient.id]}
                      className="flex items-center justify-center gap-2 px-5 py-2.5 w-full sm:w-auto text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 rounded-lg text-sm font-bold transition-all shadow-sm hover:shadow-md"
                    >
                      {sendingSms[patient.id] ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />} 
                      {sendingSms[patient.id] ? 'Sending...' : 'Send Client Update'}
                    </button>
                    <button onClick={() => handlePreview(patient)} className="flex items-center justify-center gap-2 px-4 py-2 w-full sm:w-auto text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-bold transition-colors">
                      <Eye size={16} /> Preview
                    </button>
                    <button onClick={() => setAdvancedOpen(prev => ({ ...prev, [patient.id]: !prev[patient.id] }))} className={`flex items-center justify-center gap-1 px-3 py-2 w-full sm:w-auto rounded-lg text-sm font-medium transition-all ${advancedOpen[patient.id] ? 'bg-slate-200 text-slate-900' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}>
                        Advanced
                        {advancedOpen[patient.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>

                {advancedOpen[patient.id] && (
                    <div className="flex flex-col gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 w-full mb-6 animate-in fade-in slide-in-from-top-2">
                        <div className="w-full space-y-2">
                          <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <MessageSquare size={14} /> Internal Staff Note
                          </label>
                          <textarea
                            value={currentNoteValue}
                            onChange={(e) => handleNoteChange(patient.id, e.target.value)}
                            placeholder="Internal commentary (never shown to client)…"
                            className="w-full h-24 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none transition-all placeholder:italic"
                          />
                          <div className="flex flex-wrap gap-2">
                            {QUICK_NOTES.map(note => (
                              <button key={note} onClick={() => handleNoteChange(patient.id, note)} className="text-[10px] bg-white border border-slate-200 text-slate-600 px-2 py-1 rounded hover:bg-slate-100 transition-colors">
                                {note}
                              </button>
                            ))}
                            <button onClick={() => handleNoteChange(patient.id, "")} className="text-[10px] bg-slate-200 text-slate-700 px-2 py-1 rounded hover:bg-slate-300 transition-colors ml-auto font-bold">
                              Clear
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:flex-wrap justify-end gap-2 pt-2 border-t border-slate-200">
                            <button onClick={() => toggleHistory(patient.id)} className={`flex items-center justify-center gap-2 px-3 py-1.5 w-full sm:w-auto rounded-lg text-xs font-bold transition-colors ${historyOpen[patient.id] ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 bg-white border border-slate-200 hover:bg-slate-50'}`}>
                              <History size={14} /> View History
                            </button>
                            <button onClick={() => copyAutoLoginLink(patient)} className="flex items-center justify-center gap-2 px-3 py-1.5 w-full sm:w-auto rounded-lg text-xs font-bold transition-colors text-indigo-600 bg-white border border-indigo-200 hover:bg-indigo-50">
                              <ShieldCheck size={14} /> Copy Auto-Login Link
                            </button>
                            <button onClick={() => toggleCodeReveal(patient.id)} className="flex items-center justify-center gap-2 px-3 py-1.5 w-full sm:w-auto rounded-lg text-xs font-bold transition-colors text-slate-600 bg-white border border-slate-200 hover:bg-slate-50">
                                <Key size={14} /> {revealedCodes[patient.id] ? 'Hide Access Code' : 'Reveal Access Code'}
                            </button>
                            {viewMode === 'discharged' && (
                              <button onClick={() => handleDischargeOrDelete(patient.id)} className="flex items-center justify-center gap-2 px-3 py-1.5 w-full sm:w-auto rounded-lg text-xs font-bold transition-colors text-red-600 bg-white border border-red-200 hover:bg-red-50">
                                <Trash2 size={14} /> Permanently Delete
                              </button>
                            )}
                        </div>
                    </div>
                )}

                {historyOpen[patient.id] && (
                  <div className="bg-slate-50 rounded-lg p-3 mb-4 border border-slate-100 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1 text-[10px]">
                          <History size={12} /> Recent Activity
                        </h4>
                        {totalHistoryEvents > 6 && (
                          <span className="text-[10px] text-slate-400 font-medium italic">Showing latest 6 of {totalHistoryEvents}</span>
                        )}
                      </div>
                      <div className={`overflow-y-auto ${totalHistoryEvents > 6 ? 'max-h-40 pr-2' : ''} custom-scrollbar`}>
                        {totalHistoryEvents > 0 ? (
                          <ul className="space-y-3">
                            {displayHistory.map((event, idx) => {
                              const fromLabel = STAGES.find(s => s.id === event.from_stage)?.label || 'Checked In';
                              const toLabel = STAGES.find(s => s.id === event.to_stage)?.label || event.to_stage;
                              const time = new Date(event.changed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                              return (
                                <li key={idx} className="flex flex-col text-xs border-l-2 border-slate-200 pl-3 relative">
                                  <div className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-slate-300"></div>
                                  <div className="text-slate-400 mb-0.5"><span className="font-bold">{time}</span></div>
                                  <div className="text-slate-600">
                                    Moved from <span className="font-medium">{fromLabel}</span> to <span className="font-bold text-indigo-600">{toLabel}</span>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="text-xs text-gray-400 italic">No activity recorded yet.</p>
                        )}
                      </div>
                  </div>
                )}

                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2 flex-grow">
                    {STAGES.map((stage) => {
                      const isActive = patient.stage === stage.id;
                      const Icon = stage.icon;
                      return (
                        <button
                          key={stage.id}
                          onClick={() => handleStatusUpdate(patient.id, stage.id)}
                          disabled={viewMode === 'discharged'}
                          className={`relative flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all duration-200
                            ${isActive ? `${stage.color} border-transparent text-white shadow-lg scale-105 z-10` : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200 hover:bg-slate-50'}
                            ${viewMode === 'discharged' && !isActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <Icon size={20} className="mb-1" />
                          <span className="text-xs font-bold text-center leading-tight">{stage.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {viewMode === 'active' && (
                    <>
                      <div className="hidden md:block w-px h-12 bg-slate-200 mx-2"></div>
                      <button 
                        onClick={() => setConfirmDischargeId(patient.id)} 
                        className="flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all font-bold min-w-[80px] text-slate-500 border-slate-200 bg-white hover:text-red-600 hover:border-red-200 hover:bg-red-50"
                      >
                        <Archive size={20} className="mb-1" />
                        <span className="text-xs">Discharge</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Discharge Confirmation Modal */}
      {confirmDischargeId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full animate-in zoom-in fade-in duration-200">
            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mb-4 text-red-600">
              <AlertTriangle size={24} />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Confirm Discharge</h2>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">
              Are you sure you want to move this patient to discharged records? They will be removed from the active tracking list.
            </p>
            <div className="flex flex-col gap-2">
              <button 
                onClick={executeDischarge}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-lg shadow-sm transition-all flex items-center justify-center"
              >
                Confirm Discharge
              </button>
              <button 
                onClick={() => setConfirmDischargeId(null)}
                className="w-full bg-white text-gray-500 hover:text-gray-800 font-semibold py-2.5 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes zoom-in { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .animate-in { animation-fill-mode: both; }
        .fade-in { animation-name: fade-in; }
        .zoom-in { animation-name: zoom-in; }
        .duration-200 { animation-duration: 200ms; }
      `}</style>
    </div>
  );
};
