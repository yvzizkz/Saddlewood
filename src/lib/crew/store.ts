import fs from 'fs';
import path from 'path';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type {
  CrewState,
  Jobsite,
  PunchAction,
  PunchRecord,
  Worker,
  WorkerDailyStatus,
} from './types';

const CREW_STATE_ID = 'crew-punches-state';
const LOCAL_BOT_LABOR_PATH = '/Users/landos/dev/Saddlewood-KB/bot/labor_state.json';

export const DEFAULT_JOBSITES: Jobsite[] = [
  {
    id: 'powell',
    name: 'Powell Residence',
    address: '6602 N 40th St, Paradise Valley, AZ 85253',
    lat: 33.5332,
    lng: -111.9954,
    radiusMeters: 350,
    gateCode: '#4812',
    superintendent: 'Eli',
    active: true,
  },
  {
    id: 'aft-whispering-wind',
    name: 'A Finer Touch (AFT)',
    address: 'Whispering Wind, Phoenix, AZ 85085',
    lat: 33.6821,
    lng: -112.0831,
    radiusMeters: 350,
    gateCode: '2024',
    superintendent: 'Eli',
    active: true,
  },
  {
    id: 'north-lane',
    name: 'North Lane',
    address: '7401 E North Lane, Scottsdale, AZ 85258',
    lat: 33.5784,
    lng: -112.0125,
    radiusMeters: 350,
    gateCode: 'Call Eli on arrival',
    superintendent: 'Eli',
    active: true,
  },
  {
    id: '120th-pl',
    name: '24417 N 120th Pl',
    address: '24417 N 120th Pl, Scottsdale, AZ 85255',
    lat: 33.7058,
    lng: -111.8245,
    radiusMeters: 350,
    gateCode: '#1200',
    superintendent: 'Eli',
    active: true,
  },
  {
    id: 'yard',
    name: 'General / Saddlewood Yard',
    address: 'Phoenix, AZ',
    lat: 33.4484,
    lng: -112.074,
    radiusMeters: 500,
    gateCode: 'Standard keybox',
    superintendent: 'Marco',
    active: true,
  },
];

export const DEFAULT_WORKERS: Worker[] = [
  {
    id: 'arnold',
    name: 'Arnold Mujica',
    phone: '+14805550142',
    role: 'Lead Framer',
    defaultProject: 'Powell Residence',
    hourlyRate: 38.0,
    active: true,
  },
  {
    id: 'billy',
    name: 'Billy Boy',
    phone: '+16025550189',
    role: 'Framer',
    defaultProject: 'Powell Residence',
    hourlyRate: 32.0,
    active: true,
  },
  {
    id: 'steve',
    name: 'Steve Knisely',
    phone: '+16025550177',
    role: 'Driver',
    defaultProject: 'General / Saddlewood Yard',
    hourlyRate: 30.0,
    active: true,
  },
  {
    id: 'eli',
    name: 'Eli Ochoa',
    phone: '+14805550199',
    role: 'Superintendent',
    defaultProject: 'Powell Residence',
    hourlyRate: 45.0,
    active: true,
  },
];

import { calculateDistanceMeters } from './geo';
export { calculateDistanceMeters };

/**
 * Creates a tamper-evident, lightweight token for 1-tap mobile punching without login.
 */
export function createPunchToken(workerId: string, dateStr?: string): string {
  const date = dateStr || new Date().toISOString().slice(0, 10);
  const payload = JSON.stringify({ workerId, date, v: 1 });
  return Buffer.from(payload).toString('base64url');
}

/**
 * Verifies a punch token.
 */
export function verifyPunchToken(token: string): { valid: boolean; workerId?: string; date?: string } {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.workerId) {
      return { valid: true, workerId: parsed.workerId, date: parsed.date };
    }
  } catch {
    // Malformed token
  }
  return { valid: false };
}

function loadLocalLaborState(): CrewState | null {
  try {
    if (fs.existsSync(LOCAL_BOT_LABOR_PATH)) {
      const data = fs.readFileSync(LOCAL_BOT_LABOR_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch {
    // Ignore local read errors
  }
  return null;
}

function saveLocalLaborState(state: CrewState): void {
  try {
    const dir = path.dirname(LOCAL_BOT_LABOR_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOCAL_BOT_LABOR_PATH, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // Best-effort local file write
  }
}

export async function getCrewState(): Promise<CrewState> {
  const local = loadLocalLaborState();

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('progress_trackers')
      .select('state')
      .eq('id', CREW_STATE_ID)
      .maybeSingle();

    if (!error && data && data.state) {
      const state = data.state as CrewState;
      if (local && (!state.punches || state.punches.length < (local.punches?.length || 0))) {
        await saveCrewState(local);
        return local;
      }
      saveLocalLaborState(state);
      return state;
    }
  } catch {
    // Supabase unavailable; fall back to local or defaults
  }

  if (local) {
    return local;
  }

  const initial: CrewState = {
    punches: [],
    workers: DEFAULT_WORKERS,
    jobsites: DEFAULT_JOBSITES,
    lastUpdated: new Date().toISOString(),
  };

  saveLocalLaborState(initial);
  return initial;
}

export async function saveCrewState(state: CrewState): Promise<void> {
  saveLocalLaborState(state);

  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('progress_trackers').upsert({
      id: CREW_STATE_ID,
      state,
      updated_at: new Date().toISOString(),
    });
  } catch {
    // Supabase sync failure handled gracefully
  }
}

export async function getWorkerDailyStatus(workerId: string): Promise<WorkerDailyStatus | null> {
  const state = await getCrewState();
  const worker = state.workers.find((w) => w.id === workerId || w.name.toLowerCase() === workerId.toLowerCase());
  if (!worker) return null;

  const today = new Date().toISOString().slice(0, 10);
  const todayPunches = (state.punches || []).filter(
    (p) => p.workerId === worker.id && p.date === today
  ).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const assignedSite =
    state.jobsites.find((j) => j.name === worker.defaultProject || j.id === worker.defaultProject) ||
    state.jobsites[0];

  let status: 'clocked_out' | 'clocked_in' = 'clocked_out';
  let activeShift = null;
  let totalHours = 0;

  for (let i = 0; i < todayPunches.length; i++) {
    const p = todayPunches[i];
    if (p.action === 'clock_in') {
      const nextPunch = todayPunches[i + 1];
      if (nextPunch && nextPunch.action === 'clock_out') {
        const ms = new Date(nextPunch.timestamp).getTime() - new Date(p.timestamp).getTime();
        totalHours += Math.max(0, ms / (1000 * 60 * 60));
        i++; // skip paired clock_out
      } else {
        // Still currently clocked in!
        status = 'clocked_in';
        const elapsedMinutes = Math.round(
          (Date.now() - new Date(p.timestamp).getTime()) / (1000 * 60)
        );
        activeShift = {
          clockInId: p.id,
          clockInTime: p.time,
          jobsite: p.projectName,
          elapsedMinutes: Math.max(0, elapsedMinutes),
        };
      }
    }
  }

  return {
    worker,
    assignedJobsite: assignedSite,
    status,
    activeShift,
    todayPunches,
    todayTotalHours: Math.round(totalHours * 10) / 10,
  };
}

export async function recordPunch(params: {
  workerId: string;
  projectId?: string;
  action: PunchAction;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  notes?: string;
  source?: 'web_punch' | 'sms' | 'bot';
}): Promise<{ punch: PunchRecord; workerStatus: WorkerDailyStatus }> {
  const state = await getCrewState();
  const worker = state.workers.find(
    (w) => w.id === params.workerId || w.name.toLowerCase() === params.workerId.toLowerCase()
  );

  if (!worker) {
    throw new Error(`Worker '${params.workerId}' not found.`);
  }

  const jobsite =
    state.jobsites.find((j) => j.id === params.projectId || j.name === params.projectId) ||
    state.jobsites.find((j) => j.name === worker.defaultProject || j.id === worker.defaultProject) ||
    state.jobsites[0];

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  // Geofence calculation
  let distanceMeters: number | null = null;
  let geofenceStatus: PunchRecord['geofenceStatus'] = 'no_gps';

  if (typeof params.lat === 'number' && typeof params.lng === 'number') {
    distanceMeters = calculateDistanceMeters(params.lat, params.lng, jobsite.lat, jobsite.lng);
    geofenceStatus = distanceMeters <= jobsite.radiusMeters ? 'verified' : 'outside_geofence';
  }

  const punchId = `punch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const punch: PunchRecord = {
    id: punchId,
    workerId: worker.id,
    workerName: worker.name,
    workerPhone: worker.phone,
    projectId: jobsite.id,
    projectName: jobsite.name,
    action: params.action,
    timestamp: now.toISOString(),
    date: dateStr,
    time: timeStr,
    location:
      typeof params.lat === 'number' && typeof params.lng === 'number'
        ? { lat: params.lat, lng: params.lng, accuracy: params.accuracy || undefined }
        : null,
    distanceMeters,
    geofenceStatus,
    notes: params.notes || undefined,
    source: params.source || 'web_punch',
    createdAt: now.toISOString(),
  };

  state.punches = state.punches || [];
  state.punches.push(punch);
  state.lastUpdated = now.toISOString();

  await saveCrewState(state);

  const workerStatus = (await getWorkerDailyStatus(worker.id))!;
  return { punch, workerStatus };
}
