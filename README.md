# VetTrack Pro

Real-time veterinary surgical patient tracking system. Designed for staff to provide peace of mind to pet parents through live status updates.

## Supabase Setup (Multi-device Pilot)

Follow these steps to enable multi-device synchronization for the pilot.

### 1. Create Supabase Project
- Create a new project at [supabase.com](https://supabase.com).
- Navigate to **Project Settings > API**.
- Copy your **Project URL** and **anon public key**.

### 2. Run Database Schema
- Open the **SQL Editor** in your Supabase dashboard.
- Create a new query and paste the contents of `supabase_schema.sql`.
- Click **Run**. This will create the `doctors` and `patients` tables and insert demo accounts.
- Create a second query and run `supabase_clinic_settings.sql` to create shared clinic footer settings storage used by the admin Settings panel.
- Create a third query and run `supabase_audit_logs.sql` to provision the audit trail table used for admin/staff activity logging.
- For production hardening, run `supabase_rls_policies.sql` to enable Row Level Security (RLS) and clinic/admin-aware authorization policies.
- Optional but recommended: run `supabase_rls_smoke_test.sql` to validate that unauthorized writes are denied.

### 3. Configure Environment Variables
The app automatically looks for Supabase credentials. Ensure your environment provides:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

If running locally with Vite, create a `.env.local` file:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Start the Application
```bash
npm install
npm run dev
```

### 5. Pilot Sanity Checks
- **Staff Login**: Try logging in with PIN `1111`. If it works, the app is successfully validating against Supabase (or falling back to local demo data).
- **Multi-device Sync**: Open the staff dashboard on two different devices or browser tabs. Changes made on one should appear on the other within 10 seconds.
- **Client View**: Use the "Link" button on a patient card to open the client tracker. Verify updates reflect in real-time.

### 6. Security Modes

#### Pilot Mode (quick setup)
- Fastest path for demos and internal testing.
- Uses simplified auth assumptions; do **not** use sensitive production data in this mode.

#### Production Mode (required for real deployments)
- Run all schema files **plus** `supabase_rls_policies.sql`.
- Ensure staff sessions use authenticated Supabase JWTs with claims: `clinic_id`, `doctor_id`, and `is_admin`.
- Keep RLS enabled on `patients`, `doctors`, `clinic_settings`, and `audit_logs`.
- Use `supabase_rls_smoke_test.sql` as a quick regression check whenever policies are updated.

### 7. Security Note
RLS policy enforcement should be treated as the primary authorization boundary. Client-side checks and audit logging are still valuable, but they are not a substitute for database-enforced permissions.
