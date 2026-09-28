import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { LeadsState, LeadItem } from './types';

const execAsync = promisify(exec);

const LOCAL_BOT_LEADS_PATH = '/Users/landos/dev/Saddlewood-KB/bot/leads_state.json';
const STATUS_OVERRIDES_PATH = '/Users/landos/dev/Saddlewood-KB/bot/leads_status_overrides.json';
const BOT_SCRIPT_PATH = '/Users/landos/dev/Saddlewood-KB/bot/leads.py';

function loadStatusOverrides(): Record<string, 'pending' | 'called' | 'texted' | 'dismissed'> {
  if (fs.existsSync(STATUS_OVERRIDES_PATH)) {
    try {
      const data = fs.readFileSync(STATUS_OVERRIDES_PATH, 'utf-8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
  return {};
}

function saveStatusOverrides(overrides: Record<string, 'pending' | 'called' | 'texted' | 'dismissed'>) {
  try {
    fs.writeFileSync(STATUS_OVERRIDES_PATH, JSON.stringify(overrides, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save status overrides', err);
  }
}

export async function getLeadsState(forceRefresh = false): Promise<LeadsState> {
  if (forceRefresh) {
    try {
      await execAsync(`python3 "${BOT_SCRIPT_PATH}" --sync`, {
        cwd: path.dirname(BOT_SCRIPT_PATH),
        timeout: 25000,
      });
    } catch (err) {
      console.warn('Could not run leads.py --sync live, reading cache:', err);
    }
  }

  let state: LeadsState;

  if (fs.existsSync(LOCAL_BOT_LEADS_PATH)) {
    try {
      const raw = fs.readFileSync(LOCAL_BOT_LEADS_PATH, 'utf-8');
      state = JSON.parse(raw);
    } catch (err) {
      console.error('Error parsing leads_state.json:', err);
      state = getFallbackLeadsState();
    }
  } else {
    state = getFallbackLeadsState();
  }

  // Apply overrides
  const overrides = loadStatusOverrides();
  const applyOverrides = (item: LeadItem) => {
    if (overrides[item.phone]) {
      item.callback_status = overrides[item.phone];
    } else {
      item.callback_status = item.callback_status || 'pending';
    }
    return item;
  };

  if (Array.isArray(state.fresh_list)) {
    state.fresh_list = state.fresh_list.map(applyOverrides);
  }
  if (Array.isArray(state.backlog_list)) {
    state.backlog_list = state.backlog_list.map(applyOverrides);
  }

  return state;
}

export async function updateLeadStatus(
  phone: string,
  status: 'pending' | 'called' | 'texted' | 'dismissed'
): Promise<void> {
  const overrides = loadStatusOverrides();
  overrides[phone] = status;
  saveStatusOverrides(overrides);
}

function getFallbackLeadsState(): LeadsState {
  return {
    generated: new Date().toISOString(),
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
