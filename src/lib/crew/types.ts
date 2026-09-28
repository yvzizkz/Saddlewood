export type WorkerRole = 'Lead Framer' | 'Framer' | 'Drywall Finisher' | 'Laborer' | 'Superintendent' | 'Driver';

export type Worker = {
  id: string;
  name: string;
  phone: string;
  role: WorkerRole;
  defaultProject: string;
  hourlyRate?: number;
  active: boolean;
};

export type Jobsite = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  radiusMeters: number; // typical jobsite geofence (250m - 400m)
  gateCode?: string;
  superintendent?: string;
  active: boolean;
};

export type PunchAction = 'clock_in' | 'clock_out';

export type GeofenceStatus = 'verified' | 'outside_geofence' | 'no_gps' | 'pending';

export type PunchRecord = {
  id: string;
  workerId: string;
  workerName: string;
  workerPhone: string;
  projectId: string;
  projectName: string;
  action: PunchAction;
  timestamp: string; // ISO
  date: string; // YYYY-MM-DD
  time: string; // HH:MM AM/PM
  location: {
    lat: number;
    lng: number;
    accuracy?: number;
  } | null;
  distanceMeters: number | null;
  geofenceStatus: GeofenceStatus;
  notes?: string;
  source: 'web_punch' | 'sms' | 'bot';
  createdAt: string;
};

export type WorkerDailyStatus = {
  worker: Worker;
  assignedJobsite: Jobsite;
  status: 'clocked_out' | 'clocked_in';
  activeShift?: {
    clockInId: string;
    clockInTime: string;
    jobsite: string;
    elapsedMinutes: number;
  } | null;
  todayPunches: PunchRecord[];
  todayTotalHours: number;
};

export type CrewState = {
  punches: PunchRecord[];
  workers: Worker[];
  jobsites: Jobsite[];
  lastUpdated: string;
};
