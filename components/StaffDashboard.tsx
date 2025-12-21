import React, { useState, useEffect, useRef } from 'react';
import { api, DOCTORS } from '../services/api';
import { supabase } from '../services/supabase';
import { Patient, Doctor, StageId, PatientStageEvent } from '../types';
import { STAGES, DEMO_MODE } from '../constants';
import { 
  Plus, Trash2, Search, LogOut, Clock, User, Dog, Stethoscope, 
  Key, Archive, X, MessageSquare, ArrowUpDown, Eye, RotateCcw, 
  History, ChevronDown, ChevronUp, Database, FileText, Send, 
  ShieldCheck, Download, AlertTriangle, Loader2, Phone
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
  const [newPatient, setNewPatient] = useState({ name: '', owner: '', owner_phone: '' });
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

  const showNotification = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleAddPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatient.name || !newPatient.owner) return;
    try {
      // Pass the new owner_phone field to the API
      await api.createPatient(newPatient, doctor.id);
      setNewPatient({ name: '', owner: '', owner_phone: '' });
      showNotification('Patient checked in successfully');
      loadData({ silent: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      showNotification(`Failed: ${msg}`, 'error');
    }
  };

  const handleSendSMS = async (patient: Patient) => {
    // Use saved phone number or prompt if missing
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
          body: `[PetTracker] Update for ${patient.name}: Status is now ${stageLabel}. Track live here: ${clientLink} Reply STOP to opt-out.`
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

  const handleStatusUpdate = async (id: string, newStage: StageId) => {
    lastInteractionRef.current[id] = Date.now();
    const note = noteDrafts[id];
    
    try {
      await api.updateStage(id, newStage, doctor.id, note);
      showNotification('Status updated');
      loadData({ silent: true });
    } catch (error) {
      showNotification('Update failed', 'error');
    }
  };

  const handlePreview = (patient: Patient) => {
    const url = `${window.location.origin}${window.location.pathname}?id=${patient.id}&code=${patient.access_code}`;
    window.open(url, '_blank');
  };

  const scopedPatients = patients.filter(p => p.status === viewMode);
  const filteredPatients = scopedPatients.filter(p => {
    const q = searchQuery.toLowerCase().trim();
    return p.name.toLowerCase().includes(q) || p.owner.toLowerCase().includes(q);
  });

  return (
    <div className="max-w-7xl mx-auto pb-20 p-4">
      {notification && (
        <div className={`fixed top-4 right-4 px-6 py-4 rounded-lg shadow-xl z-50 text-white font-medium ${notification.type === 'success' ? 'bg-indigo-600' : 'bg-red-600'}`}>
          {notification.msg}
        </div>
      )}

      {/* Header section omitted for brevity, same as your original */}
      
      {viewMode === 'active' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-800">
            <Plus className="text-indigo-600" size={20} />
            Check In New Patient
          </h2>
          <form onSubmit={handleAddPatient} className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Patient Name</label>
              <div className="relative">
                <Dog className="absolute left-3 top-2.5 text-gray-400" size={18} />
                <input type="text" value={newPatient.name} onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })} className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 transition-all" placeholder="e.g. Bella" />
              </div>
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Owner Name</label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 text-gray-400" size={18} />
                <input type="text" value={newPatient.owner} onChange={(e) => setNewPatient({ ...newPatient, owner: e.target.value })} className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 transition-all" placeholder="e.g. John Smith" />
              </div>
            </div>
            {/* NEW PHONE NUMBER FIELD */}
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Owner Phone</label>
              <div className="relative">
                <Phone className="absolute left-3 top-2.5 text-gray-400" size={18} />
                <input type="tel" value={newPatient.owner_phone} onChange={(e) => setNewPatient({ ...newPatient, owner_phone: e.target.value })} className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 transition-all" placeholder="+1914..." />
              </div>
            </div>
            <div className="md:col-span-3 flex items-end">
              <button type="submit" disabled={!newPatient.name || !newPatient.owner} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold py-2.5 rounded-lg transition-all shadow-md flex items-center justify-center gap-2">
                <Clock size={18} /> Check In
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-4">
        {filteredPatients.map(patient => (
          <div key={patient.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6">
              <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{patient.name}</h3>
                  <p className="text-sm text-gray-500">Owner: {patient.owner}</p>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-2">
                  <button 
                    onClick={() => handleSendSMS(patient)} 
                    disabled={sendingSms[patient.id]}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 rounded-lg text-sm font-bold transition-all"
                  >
                    {sendingSms[patient.id] ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />} 
                    {sendingSms[patient.id] ? 'Sending...' : 'Send Client Update'}
                  </button>
                  <button onClick={() => handlePreview(patient)} className="flex items-center justify-center gap-2 px-4 py-2 text-slate-600 bg-slate-100 rounded-lg text-sm font-bold">
                    <Eye size={16} /> Preview
                  </button>
                </div>
              </div>

              {/* Status Buttons */}
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {STAGES.map((stage) => {
                  const isActive = patient.stage === stage.id;
                  const Icon = stage.icon;
                  return (
                    <button
                      key={stage.id}
                      onClick={() => handleStatusUpdate(patient.id, stage.id)}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all 
                        ${isActive ? `${stage.color} border-transparent text-white shadow-lg` : 'bg-white border-slate-100 text-slate-500 hover:bg-slate-50'}`}
                    >
                      <Icon size={20} className="mb-1" />
                      <span className="text-xs font-bold leading-tight">{stage.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
