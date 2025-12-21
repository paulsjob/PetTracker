
import { Clock, Stethoscope, Activity, Heart, CheckCircle, FileText } from 'lucide-react';

// Configuration
export const CLINIC_ID = 'local-demo-clinic';

export const CLINIC_CONFIG = {
  name: 'PetTracker',
  phone: '(555) 123-4567',
  hours: 'Mon–Fri 8am–6pm, Sat 9am–1pm',
  email: 'hello@vettrack.demo',
  sms: '(555) 123-4567'
};

export const DEMO_MODE = true;

export const STAGES = [
  { 
    id: 'checked-in', 
    label: 'Checked In', 
    color: 'bg-blue-500', 
    textColor: 'text-blue-500',
    icon: Clock,
    description: 'Patient has arrived and is settling in.'
  },
  {
    id: 'doctor-eval',
    label: 'Doctor Eval',
    color: 'bg-indigo-500',
    textColor: 'text-indigo-600',
    icon: FileText,
    description: 'Veterinarian is performing physical exam.'
  },
  { 
    id: 'pre-op', 
    label: 'Pre-Op', 
    color: 'bg-yellow-500', 
    textColor: 'text-yellow-600',
    icon: Stethoscope,
    description: 'Being prepared for the procedure.'
  },
  { 
    id: 'surgery', 
    label: 'In Surgery', 
    color: 'bg-red-500', 
    textColor: 'text-red-500',
    icon: Activity,
    description: 'Procedure is currently underway.'
  },
  { 
    id: 'recovery', 
    label: 'Recovery', 
    color: 'bg-orange-500', 
    textColor: 'text-orange-500',
    icon: Heart,
    description: 'Waking up safely from anesthesia.'
  },
  { 
    id: 'ready', 
    label: 'Ready', 
    color: 'bg-green-500', 
    textColor: 'text-green-600',
    icon: CheckCircle,
    description: 'Ready to go home!'
  }
] as const;
