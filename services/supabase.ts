import { createClient } from '@supabase/supabase-js';

// Access environment variables (Vercel injects these automatically)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. App will run in Demo Mode (Local Only).');
}

// Create the client
// We use a conditional check so the app doesn't crash if keys are missing during local dev
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
