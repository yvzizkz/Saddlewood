import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { LeadsState, LeadItem } from './types';

// Where the lead list lives (2026-10-16). The list is built on the Mac
// (Saddlewood-KB bot/leads.py: GoHighLevel plus the KB's phone index), which
// the site cannot reach. The Mac's app bridge sends the built list here
// (PUT /api/leads with its agent token) and the site keeps it in bot_state.
// Before this the site read the Mac's files from disk, which only worked on
// the Mac itself: on the live site the page was always empty.
//
//   leads          the last list the Mac built, as leads.py wrote it
//   leads_status   called / texted / dismissed, set from the page
//   leads_inbound  leads that came in through the webhook since then
//
// None of these keys is a bot snapshot section, so the app's Home never
// reads them (BOT_SECTION_KEYS in src/lib/bot/types.ts).

export type LeadStatus = 'pending' | 'called' | 'texted' | 'dismissed';

const KEY_LIST = 'leads';
const KEY_STATUS = 'leads_status';
const KEY_INBOUND = 'leads_inbound';
const INBOUND_KEEP = 50;

type Row = { key: string; data: unknown; updated_at: string };

async function readRows(): Promise<Record<string, Row>> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('bot_state')
    .select('key, data, updated_at')
    .in('key', [KEY_LIST, KEY_STATUS, KEY_INBOUND]);
  if (error) throw new Error(`bot_state read failed: ${error.message}`);
  const out: Record<string, Row> = {};
  for (const r of (data ?? []) as Row[]) out[r.key] = r;
  return out;
}

async function writeRow(key: string, data: unknown): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from('bot_state')
    .upsert({ key, data, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(`bot_state write failed: ${error.message}`);
}

const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const asList = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function emptyState(): LeadsState {
  return {
    generated: '',
    total_waiting: 0,
    fresh: 0,
    backlog: 0,
    backlog_with_history: 0,
    with_history: 0,
    named: 0,
    fresh_list: [],
    backlog_list: [],
    gone_quiet: [],
    gone_quiet_total: 0,
  };
}

/** The list as the Mac last sent it, with the webhook's newer leads on top. */
export async function getLeadsState(): Promise<{ state: LeadsState; syncedAt: string | null }> {
  const rows = await readRows();
  const sent = asObject(rows[KEY_LIST]?.data);
  const state: LeadsState = {
    ...emptyState(),
    ...(sent as Partial<LeadsState>),
    fresh_list: asList<LeadItem>(sent.fresh_list),
    backlog_list: asList<LeadItem>(sent.backlog_list),
    gone_quiet: asList<LeadsState['gone_quiet'][number]>(sent.gone_quiet),
  };

  // A webhook lead stays on top until the Mac's list has caught up with it.
  const known = new Set(state.fresh_list.map((l) => l.phone));
  const listedAt = state.generated || '';
  const inbound = asList<LeadItem>(rows[KEY_INBOUND]?.data).filter(
    (l) => !known.has(l.phone) && (!listedAt || (l.last_ts ?? '') > listedAt),
  );
  if (inbound.length) {
    state.fresh_list = [...inbound, ...state.fresh_list];
    state.fresh += inbound.length;
    state.total_waiting += inbound.length;
  }

  const overrides = asObject(rows[KEY_STATUS]?.data) as Record<string, LeadStatus>;
  const apply = (item: LeadItem): LeadItem => ({
    ...item,
    callback_status: overrides[item.phone] || item.callback_status || 'pending',
  });
  state.fresh_list = state.fresh_list.map(apply);
  state.backlog_list = state.backlog_list.map(apply);

  return { state, syncedAt: rows[KEY_LIST]?.updated_at ?? null };
}

/** What the Mac sends after it pulls from GoHighLevel. */
export async function saveLeadsState(state: LeadsState): Promise<void> {
  await writeRow(KEY_LIST, state);
}

export async function updateLeadStatus(phone: string, status: LeadStatus): Promise<void> {
  const rows = await readRows();
  const overrides = asObject(rows[KEY_STATUS]?.data);
  overrides[phone] = status;
  await writeRow(KEY_STATUS, overrides);
}

export async function recordInboundLead(data: {
  phone: string;
  name?: string;
  email?: string;
  snippet?: string;
  summary?: string;
  source?: string;
  tags?: string[];
}): Promise<LeadItem> {
  const cleanPhone = data.phone.replace(/\D/g, '').replace(/^1/, '');
  const displayPhone =
    cleanPhone.length === 10
      ? `(${cleanPhone.slice(0, 3)}) ${cleanPhone.slice(3, 6)}-${cleanPhone.slice(6)}`
      : data.phone;

  const item: LeadItem = {
    phone: cleanPhone,
    display: displayPhone,
    named: Boolean(data.name && data.name.trim()),
    name: data.name?.trim() || undefined,
    email: data.email?.trim() || undefined,
    unread: 1,
    last: new Date().toISOString().slice(0, 10),
    last_ts: new Date().toISOString(),
    age_days: 0,
    tags: data.tags && data.tags.length > 0 ? data.tags : ['inbound-lead', 'webhook'],
    opps: 1,
    fanout: false,
    tollfree: false,
    score: 100,
    snippet: data.snippet || data.summary || 'Inbound webhook / call lead',
    kb: null,
    dial_url: `tel:+1${cleanPhone}`,
    suggested_sms: `Hi ${data.name ? data.name.split(' ')[0] : 'there'}! This is Marco with Saddlewood Contracting. Thanks for reaching out regarding your project. Do you have plans ready for pricing?`,
    sms_url: `sms:+1${cleanPhone}&body=${encodeURIComponent(
      `Hi ${data.name ? data.name.split(' ')[0] : 'there'}! This is Marco with Saddlewood Contracting. Thanks for reaching out regarding your project.`
    )}`,
    callback_status: 'pending',
  };

  // The lead is returned (and the owners emailed) even if it cannot be kept.
  try {
    const rows = await readRows();
    const prior = asList<LeadItem>(rows[KEY_INBOUND]?.data);
    const same = prior.find((l) => l.phone === cleanPhone);
    const next = [
      { ...item, unread: (same?.unread || 0) + 1 },
      ...prior.filter((l) => l.phone !== cleanPhone),
    ].slice(0, INBOUND_KEEP);
    await writeRow(KEY_INBOUND, next);
  } catch (err) {
    console.warn('Could not keep the inbound lead:', err);
  }

  return item;
}
