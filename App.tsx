
import React, { useState, useEffect } from 'react';
import { StaffDashboard } from './components/StaffDashboard';
import { ClientTracker } from './components/ClientTracker';
import { ViewState, Doctor } from './types';
import { api } from './services/api';
import { Lock, Activity, ArrowRight, Eye, EyeOff, PawPrint, User, UserCog, Hash } from 'lucide-react';
import { CLINIC_CONFIG, DEMO_MODE } from './constants';

export default function App() {
  const [view, setView] = useState<ViewState>('landing');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [validatedAccessCode, setValidatedAccessCode] = useState<string | null>(null);
  const [prefilledId, setPrefilledId] = useState<string | null>(null);
  const [manualPatientId, setManualPatientId] = useState('');
  const [pin, setPin] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  
  // Track logged in doctor
  const [currentDoctor, setCurrentDoctor] = useState<Doctor | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    // Check for direct link via URL parameters
    const params = new URLSearchParams(window.location.search);
    const patientId = params.get('id');
    const code = params.get('code');

    if (patientId) {
      setPrefilledId(patientId);
      
      // Prefill code if present in URL
      if (code) {
        setAccessCode(code);
      }
      
      setView('patient-login');
    }
  }, []);

  const handleDoctorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setError('');

    try {
      const doctor = await api.login(pin);
      if (doctor) {
        setCurrentDoctor(doctor);
        setView('staff-dashboard');
        setPin('');
      } else {
        setError('Invalid PIN. Please try again.');
        setPin('');
      }
    } catch (err) {
      setError('Login failed.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handlePatientLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setError('');

    try {
      const targetId = prefilledId || manualPatientId;
      if (!targetId) {
        setError('Patient ID is required.');
        setIsLoggingIn(false);
        return;
      }

      const patient = await api.loginPatientWithId(targetId, accessCode);

      if (patient) {
        setSelectedPatientId(patient.id);
        setValidatedAccessCode(accessCode); // Persist code for hardened reads
        setView('client-tracker');
        setAccessCode('');
        setManualPatientId('');
        setPrefilledId(null); // Clear context once logged in
      } else {
        setError('Invalid Patient ID or Access Code.');
      }
    } catch (err) {
      setError('Connection failed.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setCurrentDoctor(null);
    setView('landing');
  };

  const handlePatientLogout = () => {
    // Clear URL params without refresh
    try {
      window.history.pushState({}, '', window.location.pathname);
    } catch (e) {
      console.warn('History pushState blocked:', e);
    }
    setView('landing');
    setSelectedPatientId(null);
    setValidatedAccessCode(null);
    setPrefilledId(null);
    setManualPatientId('');
    setAccessCode('');
  };

  const renderContent = () => {
    switch (view) {
      case 'client-tracker':
        return selectedPatientId && validatedAccessCode ? (
          <ClientTracker 
            patientId={selectedPatientId} 
            accessCode={validatedAccessCode}
            onLogout={handlePatientLogout} 
          />
        ) : (
          <div className="text-center text-red-500">Error: Authentication session lost</div>
        );

      case 'staff-dashboard':
        return currentDoctor ? (
          <StaffDashboard 
            doctor={currentDoctor}
            onLogout={handleLogout} 
          />
        ) : (
          <div>Error: Not authenticated</div>
        );

      case 'staff-login':
        return (
          <div className="max-w-md mx-auto mt-10 relative">
            <div className="flex justify-between items-center mb-6">
              <button 
                onClick={() => setView('landing')} 
                className="text-gray-500 hover:text-gray-800 flex items-center gap-1 text-sm font-medium transition-colors"
              >
                ← Back to Home
              </button>
            </div>

            <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <UserCog className="text-indigo-600" size={32} />
                </div>
                <h2 className="text-2xl font-bold text-gray-800">Staff Portal</h2>
                <p className="text-gray-500 mt-2">Enter your Doctor PIN</p>
              </div>

              <form onSubmit={handleDoctorLogin}>
                <div className="relative mb-6">
                  <input
                    type={showPin ? "text" : "password"}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    className="w-full px-4 py-4 text-center text-2xl font-bold tracking-widest bg-white text-gray-900 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all"
                    placeholder="••••"
                    maxLength={4}
                    autoFocus
                    disabled={isLoggingIn}
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPin ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                
                {error && <div className="text-red-500 text-center mb-4 text-sm font-medium animate-pulse">{error}</div>}
                
                <button 
                  type="submit" 
                  disabled={isLoggingIn}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 group"
                >
                  {isLoggingIn ? 'Verifying...' : 'Access Dashboard'}
                  {!isLoggingIn && <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />}
                </button>
                
                {DEMO_MODE && (
                  <div className="mt-8 pt-6 border-t border-gray-100">
                    <p className="text-xs text-center text-gray-400 uppercase tracking-wider font-semibold mb-3">
                      Demo Profiles
                    </p>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs text-gray-600">
                      <div className="bg-gray-50 p-2 rounded hover:bg-gray-100 transition-colors cursor-pointer" onClick={() => setPin('1111')}>
                        <div className="font-bold">Int. Med</div>
                        <div className="text-gray-400">1111</div>
                      </div>
                      <div className="bg-gray-50 p-2 rounded hover:bg-gray-100 transition-colors cursor-pointer" onClick={() => setPin('2222')}>
                        <div className="font-bold">Oncology</div>
                        <div className="text-gray-400">2222</div>
                      </div>
                      <div className="bg-gray-50 p-2 rounded hover:bg-gray-100 transition-colors cursor-pointer" onClick={() => setPin('3333')}>
                        <div className="font-bold">Surgeon</div>
                        <div className="text-gray-400">3333</div>
                      </div>
                    </div>
                  </div>
                )}
              </form>
            </div>
          </div>
        );

      case 'patient-login':
        return (
          <div className="max-w-md mx-auto mt-10 relative">
             <div className="flex justify-between items-center mb-6">
              <button 
                onClick={() => setView('landing')} 
                className="text-gray-500 hover:text-gray-800 flex items-center gap-1 text-sm font-medium transition-colors"
              >
                ← Back to Home
              </button>
            </div>

            <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <PawPrint className="text-indigo-600" size={32} />
                </div>
                <h2 className="text-2xl font-bold text-gray-800">Pet Parent Login</h2>
                <p className="text-gray-500 mt-2">
                  {prefilledId 
                    ? "Verify your ID and enter the 6-digit Access Code from your paperwork." 
                    : "Enter your Patient ID and 6-digit Access Code from your paperwork."}
                </p>
                {prefilledId && (
                  <p className="text-sm text-indigo-600 font-medium mt-1">
                    Your Patient ID has been detected from the link.
                  </p>
                )}
              </div>

              <form onSubmit={handlePatientLogin}>
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    Patient ID {prefilledId ? '(From Link)' : ''}
                  </label>
                  <div className="relative">
                    <Hash className="absolute left-3 top-3.5 text-gray-400" size={18} />
                    <input
                      type="text"
                      value={prefilledId || manualPatientId}
                      onChange={(e) => !prefilledId && setManualPatientId(e.target.value)}
                      disabled={!!prefilledId}
                      className={`w-full pl-10 pr-4 py-3 font-mono text-sm border rounded-xl outline-none transition-all ${
                        prefilledId 
                          ? 'bg-gray-50 text-gray-500 border-gray-200 cursor-not-allowed select-none' 
                          : 'bg-white text-gray-900 border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50'
                      }`}
                      placeholder="Enter Patient ID"
                    />
                    {prefilledId && (
                      <div className="absolute right-3 top-3.5">
                        <Lock size={16} className="text-gray-400" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Access Code</label>
                  <input
                    type="text"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full px-4 py-4 text-center text-2xl font-bold tracking-widest bg-white text-gray-900 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all"
                    placeholder="000000"
                    maxLength={6}
                    autoFocus={!!prefilledId || accessCode.length === 0}
                    disabled={isLoggingIn}
                  />
                  <p className="text-xs text-center text-gray-400 mt-2">
                    Look for ‘Access Code’ on your intake or discharge paperwork.
                  </p>
                </div>
                
                {error && <div className="text-red-500 text-center mb-4 text-sm font-medium animate-pulse">{error}</div>}
                
                <button 
                  type="submit" 
                  disabled={isLoggingIn || accessCode.length < 6 || (!prefilledId && !manualPatientId)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 group"
                >
                  {isLoggingIn ? 'Checking...' : 'Track My Pet'}
                  {!isLoggingIn && <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />}
                </button>
              </form>
            </div>
          </div>
        );

      case 'landing':
      default:
        return (
          <div className="max-w-md mx-auto mt-10">
            <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-12 text-center border-4 border-white/50 bg-clip-padding">
              <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl rotate-3 hover:rotate-6 transition-transform duration-300">
                <Activity className="text-white w-12 h-12" strokeWidth={2.5} />
              </div>
              
              <h1 className="text-3xl font-extrabold text-gray-900 mb-3 tracking-tight">{CLINIC_CONFIG.name}</h1>
              <p className="text-gray-500 mb-10 text-lg leading-relaxed">
                Real-time updates for peace of mind.
              </p>

              <div className="space-y-4">
                <button 
                  onClick={() => setView('patient-login')} 
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-3 group"
                >
                  <User size={20} className="text-indigo-100 group-hover:text-white transition-colors" />
                  Patient Login
                </button>

                <button 
                  onClick={() => setView('staff-login')} 
                  className="w-full bg-white border-2 border-gray-100 hover:border-gray-200 text-gray-700 font-bold py-4 px-6 rounded-xl hover:shadow-lg transition-all flex items-center justify-center gap-3 group"
                >
                  <Lock size={20} className="text-gray-400 group-hover:text-gray-600 transition-colors" />
                  Staff Portal
                </button>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] relative overflow-hidden font-sans">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-b-[3rem] shadow-2xl z-0"></div>
      
      {/* Main Container */}
      <div className="relative z-10 p-4 md:p-8">
        {renderContent()}
      </div>
    </div>
  );
}
