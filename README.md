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

### 6. Security Note
This pilot uses a simplified authentication model for rapid deployment. Row Level Security (RLS) is not enabled in the provided schema. Ensure you use a non-sensitive project and clinic ID for testing.
