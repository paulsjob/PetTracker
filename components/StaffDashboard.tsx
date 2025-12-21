import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import { Patient, Doctor, StageId, PatientStageEvent } from '../types';
import { STAGES, DEMO_MODE } from '../constants';
import { 
  Plus, Search, LogOut, Clock, User, Dog, Stethoscope, 
  History, ChevronDown, ChevronUp, Send, Loader2, Phone, Eye
} from 'lucide-react';

interface StaffDashboardProps {
  onLogout: () => void;
  doctor: Doctor;
}

const QUICK_NOTES = ["Doing well", "Vitals stable", "In progress", "Waking up", "Ready soon", "Call pending"];

export const StaffDashboard: React.FC<StaffDashboardProps> = ({ onLogout, doctor }) => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingSms, setSendingSms] = useState<Record<string, boolean>>({});
  const [newPatient, setNewPatient] = useState({ name: '', owner: '', owner_phone: '' });
  const [notification, setNotification] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  const [viewMode, setViewMode] = useState<'active' | 'discharged'>('active');
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({});
  const [advancedOpen, setAdvancedOpen] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = async (options?: { silent?: boolean }) => {
    try {
      const data = await api.getPatients(doctor.id);
      setPatients(data);
    } catch (error) {
      if (!options?.silent) showNotification('Sync Error', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const channel = supabase.channel('patients-live').on('postgres_changes', 
      { event: '*', schema: 'public', table: 'patients' }, () => loadData({ silent: true })).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [doctor.id]);

  const showNotification = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleAddPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatient.name || !newPatient.owner) return;
    try {
      // This sends the owner_phone to your Supabase table
      await api.createPatient(newPatient, doctor.id);
      setNewPatient({ name: '', owner: '', owner_phone: '' });
      showNotification('Patient checked in successfully');
      loadData({ silent: true });
    } catch (error) {
      showNotification('Failed to save phone number', 'error');
    }
  };

  const handleSendSMS = async (patient: Patient) => {
    const phone = (patient as any).owner_phone;
    if (!phone) {
      showNotification("No phone number saved for this patient", "error");
      return;
    }

    setSendingSms(prev => ({ ...prev, [patient.id]: true }));
    const stageLabel = STAGES.find(s => s.id === patient.stage)?.label || 'Checked In';
    const clientLink = `${window.location.origin}/?id=${patient.id}&code=${patient.access_code}`;

    try {
      const response = await fetch('/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: phone,
          body: `[PetTracker] Update for ${patient.name}: Status is now ${stageLabel}. Track live: ${clientLink} Reply STOP to opt-out.`
        }),
      });
      const data = await response.json();
      if (data.success) showNotification(`SMS sent to ${phone}`);
      else showNotification(`SMS Failed: ${data.error}`, 'error');
    } catch (err) {
      showNotification('Connection error', 'error');
    } finally {
      setSendingSms(prev => ({ ...prev, [patient.id]: false }));
    }
  };

  const handleStatusUpdate = async (id: string, newStage: StageId) => {
    try {
      await api.updateStage(id, newStage, doctor.id, noteDrafts[id]);
      showNotification('Status updated');
      loadData({ silent: true });
    } catch (error) { showNotification('Update failed', 'error'); }
  };

  const filteredPatients = patients.filter(p => p.status === viewMode && 
    (p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.owner.toLowerCase().includes(searchQuery.toLowerCase())));

  return (
    <div className="max-w-7xl mx-auto pb-20 p-4">
      {notification && (
        <div className={`fixed top-4 right-4 px-6 py-4 rounded-lg shadow-xl z-50 text-white font-medium ${notification.type === 'success' ? 'bg-indigo-600' : 'bg-red-600'}`}>
          {notification.msg}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Stethoscope className="text-indigo-600"/> {doctor.name}</h1>
          <p className="text-indigo-600 font-medium">{doctor.specialty}</p>
        </div>
        <button onClick={onLogout} className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-lg font-medium hover:bg-slate-200 transition-colors"><LogOut size={18} /> Logout</button>
      </div>

      {viewMode === 'active' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Plus className="text-indigo-600" /> Check In New Patient</h2>
          <form onSubmit={handleAddPatient} className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Pet Name</label>
              <input type="text" value={newPatient.name} onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. Bella" />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Owner Name</label>
              <input type="text" value={newPatient.owner} onChange={(e) => setNewPatient({ ...newPatient, owner: e.target.value })} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. John Smith" />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Owner Phone</label>
              <input type="tel" value={newPatient.owner_phone} onChange={(e) => setNewPatient({ ...newPatient, owner_phone: e.target.value })} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="+1914..." />
            </div>
            <div className="md:col-span-3 flex items-end">
              <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-lg shadow-md transition-all">Check In</button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-4">
        {filteredPatients.map(patient => (
          <div key={patient.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{patient.name}</h3>
                  <p className="text-sm text-gray-500 flex items-center gap-1"><User size={14}/> Owner: {patient.owner}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleSendSMS(patient)} disabled={sendingSms[patient.id]} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold disabled:bg-indigo-400 transition-all">
                    {sendingSms[patient.id] ? <Loader2 className="animate-spin" size={16}/> : <Send size={16}/>} Send Client Update
                  </button>
                  <button onClick={() => setAdvancedOpen(prev => ({ ...prev, [patient.id]: !prev[patient.id] }))} className="flex items-center gap-1 px-4 py-2 bg-slate-100 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-200">
                    Advanced {advancedOpen[patient.id] ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                  </button>
                </div>
              </div>

              {advancedOpen[patient.id] && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 animate-in fade-in slide-in-from-top-2">
                  <div className="mb-4">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Internal Staff Note</label>
                    <textarea value={noteDrafts[patient.id] || patient.note || ''} onChange={(e) => setNoteDrafts({...noteDrafts, [patient.id]: e.target.value})} className="w-full p-3 text-sm border rounded-lg h-20 outline-none focus:ring-2 focus:ring-indigo-50" placeholder="Internal commentary..." />
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t">
                    <button onClick={() => setHistoryOpen({...historyOpen, [patient.id]: !historyOpen[patient.id]})} className="text-xs font-bold text-indigo-600 flex items-center gap-1 hover:underline"><History size={14}/> View History</button>
                    <span className="text-xs font-mono text-slate-400">Access Code: {patient.access_code}</span>
                  </div>
                  {historyOpen[patient.id] && (
                    <div className="mt-4 space-y-2 border-t pt-4">
                      {patient.stage_history?.map((event, i) => (
                        <div key={i} className="text-xs text-slate-500 border-l-2 border-indigo-200 pl-3 ml-1">
                          Moved to <span className="font-bold">{STAGES.find(s => s.id === event.to_stage)?.label}</span> at {new Date(event.changed_at).toLocaleTimeString()}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {STAGES.map((stage) => (
                  <button key={stage.id} onClick={() => handleStatusUpdate(patient.id, stage.id)} className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${patient.stage === stage.id ? `${stage.color} border-transparent text-white shadow-lg scale-105` : 'bg-white border-slate-100 text-slate-500 hover:bg-slate-50'}`}>
                    <stage.icon size={20} className="mb-1" />
                    <span className="text-xs font-bold leading-tight">{stage.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
