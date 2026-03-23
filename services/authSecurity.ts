const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type AuthScope = 'staff' | 'patient';

interface AuthState {
  attempts: number;
  lockedUntil: number | null;
}

const getStorageKey = (scope: AuthScope) => `pettracker:${scope}:auth-state`;

const getDefaultState = (): AuthState => ({
  attempts: 0,
  lockedUntil: null,
});

const readState = (scope: AuthScope): AuthState => {
  if (typeof window === 'undefined') return getDefaultState();

  try {
    const raw = window.localStorage.getItem(getStorageKey(scope));
    if (!raw) return getDefaultState();

    const parsed = JSON.parse(raw) as Partial<AuthState>;
    return {
      attempts: typeof parsed.attempts === 'number' ? parsed.attempts : 0,
      lockedUntil: typeof parsed.lockedUntil === 'number' ? parsed.lockedUntil : null,
    };
  } catch {
    return getDefaultState();
  }
};

const writeState = (scope: AuthScope, state: AuthState): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(getStorageKey(scope), JSON.stringify(state));
};

export const getLockoutRemainingMs = (scope: AuthScope): number => {
  const state = readState(scope);
  if (!state.lockedUntil) return 0;

  const remaining = state.lockedUntil - Date.now();
  if (remaining <= 0) {
    writeState(scope, getDefaultState());
    return 0;
  }

  return remaining;
};

export const getAttemptsRemaining = (scope: AuthScope): number => {
  const remainingLockout = getLockoutRemainingMs(scope);
  if (remainingLockout > 0) return 0;

  const state = readState(scope);
  return Math.max(MAX_ATTEMPTS - state.attempts, 0);
};

export const registerFailedAttempt = (scope: AuthScope): { attemptsRemaining: number; lockedUntil: number | null } => {
  const current = readState(scope);
  const attempts = current.attempts + 1;
  const lockedUntil = attempts >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_WINDOW_MS : null;

  writeState(scope, {
    attempts: lockedUntil ? 0 : attempts,
    lockedUntil,
  });

  return {
    attemptsRemaining: lockedUntil ? 0 : Math.max(MAX_ATTEMPTS - attempts, 0),
    lockedUntil,
  };
};

export const clearFailedAttempts = (scope: AuthScope): void => {
  writeState(scope, getDefaultState());
};

export const formatLockoutMessage = (remainingMs: number): string => {
  const totalMinutes = Math.ceil(remainingMs / 60000);
  return `Too many attempts. Try again in ${totalMinutes} minute${totalMinutes === 1 ? '' : 's'}.`;
};

export const sanitizePatientId = (value: string): string => value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 36);
