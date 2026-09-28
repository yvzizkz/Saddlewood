'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  CheckCircle2,
  Clock,
  MapPin,
  AlertTriangle,
  RefreshCw,
  Navigation,
  KeyRound,
  Camera,
  ShieldCheck,
} from 'lucide-react';
import type { Jobsite, PunchRecord, WorkerDailyStatus } from '@/lib/crew/types';
import { calculateDistanceMeters } from '@/lib/crew/geo';

function PunchScreen() {
  const searchParams = useSearchParams();
  const token = searchParams.get('t') || '';
  const workerParam = searchParams.get('worker') || '';

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState<WorkerDailyStatus | null>(null);
  const [jobsites, setJobsites] = useState<Jobsite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warn' } | null>(null);

  // GPS state
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  // Selected jobsite override if worker moved to another site
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [notes, setNotes] = useState('');

  // Fetch initial worker status
  const fetchStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = token
        ? `/api/crew/punch?t=${encodeURIComponent(token)}`
        : `/api/crew/punch?workerId=${encodeURIComponent(workerParam || 'arnold')}`;

      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Failed to load worker status');
      }

      setData(json.workerStatus);
      setJobsites(json.availableJobsites || []);
      if (json.workerStatus?.assignedJobsite?.id) {
        setSelectedSiteId(json.workerStatus.assignedJobsite.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection error');
    } finally {
      setLoading(false);
    }
  };

  // Request high-accuracy GPS
  const requestLocation = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your device browser.');
      return;
    }

    setLocating(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        });
        setLocating(false);
      },
      (err) => {
        setGpsError(err.message || 'Unable to retrieve your location.');
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  };

  useEffect(() => {
    fetchStatus();
    requestLocation();
  }, [token, workerParam]);

  const activeJobsite =
    jobsites.find((j) => j.id === selectedSiteId) || data?.assignedJobsite;

  // Calculate distance to active jobsite
  const distanceToSiteMeters =
    gps && activeJobsite
      ? calculateDistanceMeters(gps.lat, gps.lng, activeJobsite.lat, activeJobsite.lng)
      : null;

  const isInsideGeofence =
    distanceToSiteMeters !== null &&
    activeJobsite &&
    distanceToSiteMeters <= activeJobsite.radiusMeters;

  const handlePunch = async (action: 'clock_in' | 'clock_out') => {
    try {
      setSubmitting(true);
      const res = await fetch('/api/crew/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token || undefined,
          workerId: token ? undefined : data?.worker.id,
          projectId: selectedSiteId || activeJobsite?.id,
          action,
          lat: gps?.lat,
          lng: gps?.lng,
          accuracy: gps?.accuracy,
          notes: notes.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Failed to submit punch');
      }

      setData(json.workerStatus);
      setNotes('');

      const verb = action === 'clock_in' ? 'Clocked in' : 'Clocked out';
      const geofenceText =
        json.punch.geofenceStatus === 'verified'
          ? '📍 Geofence verified'
          : json.punch.geofenceStatus === 'outside_geofence'
          ? `⚠️ Outside geofence (${json.punch.distanceMeters}m away)`
          : 'No GPS data';

      setToast({
        message: `✅ ${verb} successfully at ${json.punch.time}! (${geofenceText})`,
        type: json.punch.geofenceStatus === 'verified' ? 'success' : 'warn',
      });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Submission failed',
        type: 'warn',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-100 flex flex-col items-center justify-center p-6 text-stone-600">
        <RefreshCw className="size-8 animate-spin text-[var(--color-teal)] mb-3" />
        <p className="font-semibold text-sm">Loading Saddlewood Timekeeping...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-stone-100 flex flex-col items-center justify-center p-6">
        <div className="bg-white border border-stone-200 rounded-3xl p-6 max-w-sm w-full text-center shadow-sm">
          <AlertTriangle className="size-10 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-stone-900 mb-1">Time Clock Notice</h2>
          <p className="text-xs text-stone-600 mb-4">{error || 'Worker assignment not found.'}</p>
          <button
            type="button"
            onClick={fetchStatus}
            className="w-full py-2.5 bg-stone-900 text-white text-xs font-semibold rounded-xl"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const isClockedIn = data.status === 'clocked_in';

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 px-4 py-6 md:py-10 max-w-md mx-auto flex flex-col justify-between">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 left-4 right-4 z-50 p-3.5 rounded-2xl shadow-xl text-xs font-semibold border flex items-center justify-between transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-950 text-emerald-200 border-emerald-800'
              : 'bg-amber-950 text-amber-200 border-amber-800'
          }`}
        >
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-2 text-stone-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-col gap-4">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black uppercase tracking-widest text-[var(--color-teal)] bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
              Saddlewood Crew
            </span>
          </div>
          <span className="text-xs font-medium text-stone-500">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </div>

        {/* Worker Greeting Card */}
        <div className="bg-white border border-stone-200 rounded-3xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-black text-stone-900 tracking-tight">
                {data.worker.name}
              </h1>
              <p className="text-xs text-stone-500 font-medium">
                {data.worker.role} · {data.worker.phone}
              </p>
            </div>
            <div
              className={`size-3.5 rounded-full ring-4 ${
                isClockedIn
                  ? 'bg-emerald-500 ring-emerald-100 animate-pulse'
                  : 'bg-stone-300 ring-stone-100'
              }`}
            />
          </div>

          {/* Current Status Pill */}
          <div
            className={`p-3 rounded-2xl flex items-center justify-between text-xs font-bold ${
              isClockedIn
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                : 'bg-stone-50 text-stone-700 border border-stone-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <Clock className="size-4 shrink-0" />
              <span>{isClockedIn ? 'CLOCKED IN' : 'CLOCKED OUT'}</span>
            </div>
            {isClockedIn && data.activeShift && (
              <span className="tabular-nums font-mono text-emerald-700 font-bold">
                Since {data.activeShift.clockInTime} ({Math.floor(data.activeShift.elapsedMinutes / 60)}h{' '}
                {data.activeShift.elapsedMinutes % 60}m)
              </span>
            )}
            {!isClockedIn && (
              <span className="text-stone-500 font-normal">
                Today: {data.todayTotalHours} hrs
              </span>
            )}
          </div>
        </div>

        {/* Jobsite Card */}
        <div className="bg-white border border-stone-200 rounded-3xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">
              Assigned Jobsite
            </span>
            {activeJobsite?.gateCode && (
              <span className="text-xs font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 flex items-center gap-1">
                <KeyRound className="size-3" /> Gate: {activeJobsite.gateCode}
              </span>
            )}
          </div>

          <h2 className="text-lg font-bold text-stone-900 mb-1">
            {activeJobsite?.name}
          </h2>
          <p className="text-xs text-stone-600 mb-3 leading-relaxed">
            {activeJobsite?.address}
          </p>

          <div className="flex items-center gap-2 pt-2 border-t border-stone-100">
            <a
              href={`https://maps.apple.com/?q=${encodeURIComponent(
                activeJobsite?.address || ''
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-[var(--color-teal)] hover:underline inline-flex items-center gap-1"
            >
              <Navigation className="size-3" />
              Directions in Apple Maps ↗
            </a>
          </div>
        </div>

        {/* GPS Geofence Verification Pill */}
        <div className="bg-white border border-stone-200 rounded-2xl p-3.5 shadow-xs flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-xl shrink-0 ${
                isInsideGeofence
                  ? 'bg-emerald-50 text-emerald-600'
                  : gps
                  ? 'bg-amber-50 text-amber-600'
                  : 'bg-stone-100 text-stone-400'
              }`}
            >
              <MapPin className="size-4" />
            </div>
            <div>
              <div className="font-bold text-stone-800">
                {locating
                  ? 'Acquiring GPS location...'
                  : isInsideGeofence
                  ? 'Jobsite Geofence Verified'
                  : distanceToSiteMeters !== null
                  ? `Outside Geofence (${Math.round(distanceToSiteMeters * 3.28084)} ft away)`
                  : 'Location not verified'}
              </div>
              <p className="text-[11px] text-stone-500">
                {gps
                  ? `Accuracy: ±${gps.accuracy}m`
                  : gpsError || 'Tap Refresh GPS to calibrate'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={requestLocation}
            disabled={locating}
            className="p-2 text-stone-500 hover:text-stone-900 rounded-lg hover:bg-stone-100"
            title="Refresh GPS location"
          >
            <RefreshCw className={`size-4 ${locating ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Shift Note Input (Optional) */}
        <div>
          <input
            type="text"
            placeholder="Quick note (e.g. shear wall framing, inspection passed)..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full text-xs px-4 py-3 bg-white border border-stone-200 rounded-2xl placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-teal)]"
          />
        </div>

        {/* BIG 1-TAP ACTION BUTTON */}
        <div>
          {isClockedIn ? (
            <button
              type="button"
              disabled={submitting}
              onClick={() => handlePunch('clock_out')}
              className="w-full py-5 rounded-3xl bg-rose-600 active:bg-rose-700 text-white font-black text-lg md:text-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {submitting ? (
                <RefreshCw className="size-6 animate-spin" />
              ) : (
                <>
                  <Clock className="size-6" />
                  <span>CLOCK OUT NOW</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={() => handlePunch('clock_in')}
              className="w-full py-5 rounded-3xl bg-emerald-600 active:bg-emerald-700 text-white font-black text-lg md:text-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {submitting ? (
                <RefreshCw className="size-6 animate-spin" />
              ) : (
                <>
                  <ShieldCheck className="size-6" />
                  <span>CLOCK IN TO JOBSITE</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Today's Punches History */}
        {data.todayPunches && data.todayPunches.length > 0 && (
          <div className="bg-white border border-stone-200 rounded-3xl p-4 shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">
              Today&apos;s Punches
            </h3>
            <div className="flex flex-col gap-2">
              {data.todayPunches.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-xs py-1.5 border-b border-stone-50 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`size-2 rounded-full ${
                        p.action === 'clock_in' ? 'bg-emerald-500' : 'bg-rose-500'
                      }`}
                    />
                    <span className="font-bold text-stone-800">
                      {p.action === 'clock_in' ? 'Clock In' : 'Clock Out'}
                    </span>
                    <span className="text-stone-400">({p.time})</span>
                  </div>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                      p.geofenceStatus === 'verified'
                        ? 'bg-emerald-50 text-emerald-700'
                        : p.geofenceStatus === 'outside_geofence'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    {p.geofenceStatus === 'verified' ? 'Verified' : 'Flagged'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Photo Reminder Banner */}
        <div className="bg-stone-900 text-stone-200 rounded-3xl p-4 shadow-sm text-xs leading-relaxed flex items-start gap-3">
          <Camera className="size-5 text-[var(--color-gold-accessible)] shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-white block mb-0.5">
              Field Daily Photos & Paper Receipts:
            </span>
            Snap photos of framing progress or physical store receipts (White Cap, Ace, gas) and text them straight to{' '}
            <b className="text-white">@SaddleWoodBot</b>. They are automatically classified, logged, and backed up!
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-8 text-center text-[10px] text-stone-400">
        Saddlewood Contracting LLC · Zero-App Field Operations Engine
      </footer>
    </div>
  );
}

export default function CrewPunchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-stone-100 flex items-center justify-center text-xs text-stone-500">
          Loading time clock...
        </div>
      }
    >
      <PunchScreen />
    </Suspense>
  );
}
