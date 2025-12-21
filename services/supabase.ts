import { createClient } from '@supabase/supabase-js';

// This version explicitly targets the NEXT_PUBLIC_ prefix 
// which is required for browser-side access in Vercel/Vite.
const supabaseUrl = import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. App will run in Demo Mode (Local Only).');
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
