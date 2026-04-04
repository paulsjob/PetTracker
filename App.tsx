import React, { useState, useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import { StaffDashboard } from './components/StaffDashboard';
import { ClientTracker } from './components/ClientTracker';
import { ViewState, Doctor } from './types';
import { api } from './services/api';
import { supabase } from './services/supabase';
import { Lock, Activity, ArrowRight, PawPrint, User, UserCog, Hash, Mail, KeyRound } from 'lucide-react';
import { CLINIC_ID, CLINIC_CONFIG } from './constants';
import {
  clearFailedAttempts,
  formatLockoutMessage,
  getLockoutRemainingMs,
  registerFailedAttempt,
  sanitizePatientId,
} from './services/authSecurity';

export default function App() {
  const [view, setView] = useState<ViewState>('landing');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [validatedAccessCode, setValidatedAccessCode] = useState<string | null>(null);
  const [prefilledId, setPrefilledId] = useState<string | null>(null);
  const [manualPatientId, setManualPatientId] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [confirmResetPassword, setConfirmResetPassword] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [error, setError] = useState('');
  const [staffLockoutMessage, setStaffLockoutMessage] = useState('');
  const [patientLockoutMessage, setPatientLockoutMessage] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [currentDoctor, setCurrentDoctor] = useState<Doctor | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const patientId = params.get('id');
    const code = params.get('code');

    if (patientId) {
      setPrefilledId(patientId);
      if (code) setAccessCode(code);
      setView('patient-login');
      return;
    }

    if (params.get('view') === 'reset-password') {
      setView('staff-reset');
    }
  }, []);

  useEffect(() => {
    const updateLockoutState = () => {
      const staffRemaining = getLockoutRemainingMs('staff');
      const patientRemaining = getLockoutRemainingMs('patient');
      setStaffLockoutMessage(staffRemaining > 0 ? formatLockoutMessage(staffRemaining) : '');
      setPatientLockoutMessage(patientRemaining > 0 ? formatLockoutMessage(patientRemaining) : '');
    };

    updateLockoutState();
    const intervalId = window.setInterval(updateLockoutState, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setIsAuthReady(true);
      return;
    }

    let active = true;

    const syncProfile = async (nextSession: Session | null) => {
      setSession(nextSession);
      if (!nextSession?.user) {
        setCurrentDoctor(null);
        setView((previous) => (previous === 'staff-dashboard' ? 'staff-login' : previous));
        return;
      }

      const profile = await api.getCurrentStaffProfile(nextSession.user.id, CLINIC_ID);
      if (!active) return;

      if (!profile) {
        setCurrentDoctor(null);
        setError('Your account does not have an active staff profile. Contact an administrator.');
        setView('staff-login');
        return;
      }

      setCurrentDoctor(profile);
      setView('staff-dashboard');
    };

    supabase.auth.getSession().then(({ data }) => {
      void syncProfile(data.session).finally(() => {
        if (active) setIsAuthReady(true);
      });
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void syncProfile(nextSession);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const remainingMs = getLockoutRemainingMs('staff');
    if (remainingMs > 0) {
      const message = formatLockoutMessage(remainingMs);
      setError(message);
      setStaffLockoutMessage(message);
      return;
    }

    setIsLoggingIn(true);
    setError('');

    try {
      const { error: authError } = await api.signInStaff(email.trim(), password);
      if (!authError) {
        clearFailedAttempts('staff');
        setStaffLockoutMessage('');
        setPassword('');
      } else {
        const result = registerFailedAttempt('staff');
        const message = result.lockedUntil
          ? formatLockoutMessage(result.lockedUntil - Date.now())
          : authError.message;
        setError(message);
        setStaffLockoutMessage(result.lockedUntil ? message : '');
      }
    } catch {
      setError('Login failed. Check your connection.');
    } finally {
      setIsLoggingIn(false);
    }
  };


  const handleForgotPassword = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Enter your staff email first, then click Forgot password.');
      return;
    }

    setIsSendingReset(true);
    setError('');

    try {
      const redirectTo = `${window.location.origin}/?view=reset-password`;
      const { error: resetError } = await api.requestStaffPasswordReset(normalizedEmail, redirectTo);
      if (resetError) {
        setError(resetError.message);
      } else {
        setError('Password reset email sent. Check your inbox for the secure link.');
      }
    } catch {
      setError('Unable to send reset email. Please try again.');
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!resetPassword || resetPassword.length < 8) {
      setError('Use a password with at least 8 characters.');
      return;
    }

    if (resetPassword !== confirmResetPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoggingIn(true);
    setError('');

    try {
      const { error: updateError } = await api.updateStaffPassword(resetPassword);
      if (updateError) {
        setError(updateError.message);
        return;
      }

      await api.signOutStaff();
      setResetPassword('');
      setConfirmResetPassword('');
      setPassword('');
      setView('staff-login');
      setError('Password updated. Please sign in with your new password.');
    } catch {
      setError('Could not update password. Open the reset link again and retry.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handlePatientLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const remainingMs = getLockoutRemainingMs('patient');
    if (remainingMs > 0) {
      const message = formatLockoutMessage(remainingMs);
      setError(message);
      setPatientLockoutMessage(message);
      return;
    }

    setIsLoggingIn(true);
    setError('');

    try {
      const targetId = sanitizePatientId(prefilledId || manualPatientId);
      if (!targetId) {
        setError('Patient ID is required.');
        setIsLoggingIn(false);
        return;
      }

      const patient = await api.loginPatientWithId(targetId, accessCode);

      if (patient) {
        clearFailedAttempts('patient');
        setPatientLockoutMessage('');
        setSelectedPatientId(patient.id);
        setValidatedAccessCode(accessCode);
        setView('client-tracker');
        setAccessCode('');
        setManualPatientId('');
        setPrefilledId(null);
      } else {
        const result = registerFailedAttempt('patient');
        const message = result.lockedUntil
          ? formatLockoutMessage(result.lockedUntil - Date.now())
          : `Invalid Patient ID or Access Code. ${result.attemptsRemaining} attempt${result.attemptsRemaining === 1 ? '' : 's'} remaining.`;
        setError(message);
        setPatientLockoutMessage(result.lockedUntil ? message : '');
      }
    } catch {
      setError('Connection failed.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await api.signOutStaff();
    setCurrentDoctor(null);
    setView('landing');
  };

  const handlePatientLogout = () => {
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
          <ClientTracker patientId={selectedPatientId} accessCode={validatedAccessCode} onLogout={handlePatientLogout} />
        ) : (
          <div className="text-center text-red-500">Error: Authentication session lost</div>
        );

      case 'staff-dashboard':
        return session && currentDoctor ? (
          <StaffDashboard doctor={currentDoctor} onLogout={handleLogout} />
        ) : (
          <div className="text-center text-red-500">Authentication required.</div>
        );

      case 'staff-login':
        return (
          <div className="mx-auto mt-14 w-full max-w-lg px-2">
            <div className="mb-7 flex justify-between items-center">
              <button
                onClick={() => setView('landing')}
                className="text-slate-500 hover:text-slate-800 flex items-center gap-1.5 text-sm font-medium transition-colors"
              >
                ← Back to Home
              </button>
            </div>

            <div className="rounded-[1.75rem] border border-slate-200/70 bg-white/95 p-10 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur-sm">
              <div className="mb-10 text-center">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                  <UserCog className="text-slate-700" size={28} />
                </div>
                <h2 className="text-[1.9rem] font-semibold tracking-tight text-slate-900">Staff Portal</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">Sign in with your staff email and password.</p>
              </div>

              <form onSubmit={handleStaffLogin} className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-3 top-3.5 text-gray-400" size={18} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-slate-900 outline-none transition-all focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    placeholder="staff@clinic.com"
                    autoFocus
                    disabled={isLoggingIn || !!staffLockoutMessage}
                    required
                  />
                </div>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-3.5 text-gray-400" size={18} />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-slate-900 outline-none transition-all focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    placeholder="Password"
                    disabled={isLoggingIn || !!staffLockoutMessage}
                    required
                  />
                </div>

                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={isSendingReset || isLoggingIn || !email}
                  className="w-full text-sm font-medium text-slate-600 hover:text-slate-900 disabled:text-slate-400 transition-colors"
                >
                  {isSendingReset ? 'Sending reset email...' : 'Forgot password?'}
                </button>

                {staffLockoutMessage && <div className="text-amber-600 text-center text-sm font-semibold">{staffLockoutMessage}</div>}
                {error && <div className="text-red-500 text-center text-sm font-medium">{error}</div>}

                <button
                  type="submit"
                  disabled={isLoggingIn || !!staffLockoutMessage || !email || !password}
                  className="group flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3.5 font-semibold text-white transition-all hover:bg-slate-700 disabled:bg-slate-300"
                >
                  {isLoggingIn ? 'Signing in...' : 'Access Dashboard'}
                  {!isLoggingIn && <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />}
                </button>
              </form>
            </div>
          </div>
        );


      case 'staff-reset':
        return (
          <div className="mx-auto mt-14 w-full max-w-lg px-2">
            <div className="flex justify-between items-center mb-6">
              <button
                onClick={() => setView('staff-login')}
                className="text-gray-500 hover:text-gray-800 flex items-center gap-1 text-sm font-medium transition-colors"
              >
                ← Back to Staff Login
              </button>
            </div>

            <div className="rounded-[1.75rem] border border-slate-200/70 bg-white/95 p-10 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur-sm">
              <div className="mb-10 text-center">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                  <KeyRound className="text-slate-700" size={28} />
                </div>
                <h2 className="text-[1.9rem] font-semibold tracking-tight text-slate-900">Reset Password</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">Set a new password for your staff account.</p>
              </div>

              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="relative">
                  <KeyRound className="absolute left-3 top-3.5 text-gray-400" size={18} />
                  <input
                    type="password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-slate-900 outline-none transition-all focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    placeholder="New password"
                    autoFocus
                    disabled={isLoggingIn}
                    required
                    minLength={8}
                  />
                </div>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-3.5 text-gray-400" size={18} />
                  <input
                    type="password"
                    value={confirmResetPassword}
                    onChange={(e) => setConfirmResetPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-slate-900 outline-none transition-all focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    placeholder="Confirm new password"
                    disabled={isLoggingIn}
                    required
                    minLength={8}
                  />
                </div>

                {error && <div className="text-red-500 text-center text-sm font-medium">{error}</div>}

                <button
                  type="submit"
                  disabled={isLoggingIn || !resetPassword || !confirmResetPassword}
                  className="w-full rounded-xl bg-slate-900 py-3.5 font-semibold text-white transition-all hover:bg-slate-700 disabled:bg-slate-300"
                >
                  {isLoggingIn ? 'Updating password...' : 'Save New Password'}
                </button>
              </form>
            </div>
          </div>
        );

      case 'patient-login':
        return (
          <div className="mx-auto mt-14 w-full max-w-lg px-2">
            <div className="mb-7 flex justify-between items-center">
              <button
                onClick={() => setView('landing')}
                className="text-slate-500 hover:text-slate-800 flex items-center gap-1.5 text-sm font-medium transition-colors"
              >
                ← Back to Home
              </button>
            </div>

            <div className="rounded-[1.75rem] border border-slate-200/70 bg-white/95 p-10 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur-sm">
              <div className="mb-10 text-center">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                  <PawPrint className="text-slate-700" size={28} />
                </div>
                <h2 className="text-[1.95rem] font-semibold tracking-tight text-slate-900">Pet Parent Login</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  {prefilledId
                    ? 'Verify your ID and enter the 6-digit Access Code from your paperwork.'
                    : 'Enter your Patient ID and 6-digit Access Code from your paperwork.'}
                </p>
              </div>

              <form onSubmit={handlePatientLogin} className="space-y-5">
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Patient ID {prefilledId ? '(From Link)' : ''}
                  </label>
                  <div className="relative">
                    <Hash className="absolute left-3 top-3.5 text-gray-400" size={18} />
                    <input
                      type="text"
                      value={prefilledId || manualPatientId}
                      onChange={(e) => !prefilledId && setManualPatientId(sanitizePatientId(e.target.value))}
                      disabled={!!prefilledId}
                      className={`w-full rounded-xl border py-3 pl-10 pr-4 font-mono text-[13px] tracking-wide outline-none transition-all ${
                        prefilledId
                          ? 'cursor-not-allowed select-none border-slate-200 bg-slate-100 text-slate-500'
                          : 'border-slate-200 bg-white text-slate-900 focus:border-slate-400 focus:ring-4 focus:ring-slate-100'
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

                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Access Code</label>
                  <input
                    type="text"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-4 text-center font-mono text-[1.7rem] font-medium tracking-[0.28em] text-slate-900 outline-none transition-all focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    placeholder="000000"
                    maxLength={6}
                    autoFocus={!!prefilledId || accessCode.length === 0}
                    disabled={isLoggingIn}
                  />
                </div>

                {patientLockoutMessage && <div className="text-amber-600 text-center mb-3 text-sm font-semibold">{patientLockoutMessage}</div>}
                {error && <div className="text-red-500 text-center mb-4 text-sm font-medium">{error}</div>}

                <button
                  type="submit"
                  disabled={isLoggingIn || !!patientLockoutMessage || accessCode.length < 6 || (!prefilledId && !manualPatientId)}
                  className="group flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3.5 font-semibold text-white transition-all hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
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
          <div className="mx-auto mt-14 w-full max-w-lg px-2">
            <div className="rounded-[2rem] border border-slate-200/70 bg-white/95 p-10 text-center shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-sm md:p-12">
              <div className="mx-auto mb-9 flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-900/95 shadow-[0_18px_35px_rgba(15,23,42,0.22)]">
                <Activity className="h-10 w-10 text-slate-50" strokeWidth={2.2} />
              </div>

              <h1 className="mb-3 text-[2rem] font-semibold tracking-tight text-slate-900">{CLINIC_CONFIG.name}</h1>
              <p className="mx-auto mb-10 max-w-sm text-[15px] leading-relaxed text-slate-500">Real-time updates for peace of mind.</p>

              <div className="space-y-4">
                <button
                  onClick={() => setView('patient-login')}
                  className="group flex w-full items-center justify-center gap-3 rounded-xl bg-slate-900 px-6 py-3.5 font-semibold text-white transition-all hover:bg-slate-700"
                >
                  <User size={20} className="text-slate-300 group-hover:text-white transition-colors" />
                  Patient Login
                </button>

                <button
                  onClick={() => setView(session ? 'staff-dashboard' : 'staff-login')}
                  className="group flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-6 py-3.5 font-semibold text-slate-700 transition-all hover:border-slate-300"
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

  if (!isAuthReady) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading session…</div>;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f7f6f3] font-sans">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_-20%,rgba(148,163,184,0.14),transparent_45%),radial-gradient(circle_at_100%_0%,rgba(148,163,184,0.08),transparent_38%)]" />
      <div className="relative z-10 p-4 md:p-8">{renderContent()}</div>
    </div>
  );
}
