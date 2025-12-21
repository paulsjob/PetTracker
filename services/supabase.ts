import { createClient } from '@supabase/supabase-js';

// --- SUPABASE CONFIGURATION ---
const supabaseUrl = 'https://hzsbxwjdgwkxewfkciud.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6c2J4d2pkZ3dreGV3ZmtjaXVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NzIxMDgsImV4cCI6MjA4MTE0ODEwOH0.Z0WhmTVMD4EUv9n2CiMmE24t95UdOSlc43a53b5Pc1Y';
// ------------------------------

export const supabase = createClient(supabaseUrl, supabaseAnonKey);