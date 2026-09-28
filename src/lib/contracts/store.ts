import fs from 'fs';
import path from 'path';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { ContractDashboardState, ContractItem, DraftContractInput } from './types';
import { generateContractText } from './generator';

const CONTRACTS_STATE_ID = 'contracts-state';
const LOCAL_BOT_CONTRACTS_PATH = '/Users/landos/dev/Saddlewood-KB/bot/contracts_state.json';

const SEED_CONTRACTS: ContractItem[] = [
  {
    id: 'cnt-001',
    n: 1,
    contract_number: 'SWC-2026-001',
    type: 'prime_residential',
    client_name: 'Mark & Heather Powell',
    client_entity: 'Mark & Heather Powell',
    project_name: 'Powell Residence',
    project_address: '3526 Emerson St, San Diego CA 92106',
    amount: 45000.0,
    deposit: 4500.0,
    scope: 'Structural framing, drywall hung/taped Level 4, and HVAC equipment coordination',
    scope_details: 'Includes framing of primary addition, structural headers, drywall hung & finished to Level 4, installation coordination for multi-zone heat pump condenser & air handler units.',
    warranty_years: 2,
    late_interest: '1.5% per month (18% per annum)',
    remobilization_fee: 1500.0,
    date: 'September 24, 2026',
    status: 'draft',
    created_by: 'Marco',
    created_at: '2026-09-24T18:00:00Z',
    contract_text: '',
    protections: {
      manufacturerDefectCarveOut: true,
      latePaymentPenalties: true,
      zeroVerbalChangeOrders: true,
      preliminaryLienNotice: true,
      limitedWorkmanshipWarranty: true,
    },
  },
  {
    id: 'cnt-002',
    n: 2,
    contract_number: 'SWC-2026-002',
    type: 'prime_commercial',
    client_name: 'North Lane Medical Group',
    client_entity: 'North Lane Properties LLC',
    project_name: 'North Lane Suite 200 TI',
    project_address: '7401 E North Lane, Scottsdale AZ 85258',
    amount: 32000.0,
    deposit: 3200.0,
    scope: 'Interior tenant improvement: metal stud framing, sound-rated drywall assemblies, and rooftop HVAC RTU installation coordination',
    scope_details: 'Metal stud partitions, double-layer Type X drywall with resilient channels and sound batts, coordination and placement of owner-specified Carrier rooftop package unit.',
    warranty_years: 1,
    late_interest: '1.5% per month (18% per annum)',
    remobilization_fee: 1500.0,
    date: 'September 22, 2026',
    status: 'under_review',
    created_by: 'Lando',
    created_at: '2026-09-22T14:30:00Z',
    contract_text: '',
    protections: {
      manufacturerDefectCarveOut: true,
      latePaymentPenalties: true,
      zeroVerbalChangeOrders: true,
      preliminaryLienNotice: true,
      limitedWorkmanshipWarranty: true,
    },
  },
  {
    id: 'cnt-003',
    n: 3,
    contract_number: 'SWC-2026-003',
    type: 'subcontractor',
    client_name: 'Billy Boy Drywall Finishes',
    client_entity: 'Billy Boy Drywall Finishes LLC',
    project_name: '6602 N 40th St Framing & Drywall',
    project_address: '6602 N 40th St, Phoenix AZ 85018',
    amount: 18500.0,
    deposit: 1850.0,
    scope: 'Subcontract trade work: tape, bed, and Level 4 drywall texture finish',
    scope_details: 'Subcontractor agrees to furnish finishing labor and taping mud to finish 14,200 SF of drywall to Level 4 smooth finish pursuant to Saddlewood schedule.',
    warranty_years: 1,
    late_interest: '1.5% per month (18% per annum)',
    remobilization_fee: 1500.0,
    date: 'September 19, 2026',
    status: 'signed',
    created_by: 'Marco',
    created_at: '2026-09-19T10:00:00Z',
    signed_at: '2026-09-20T11:20:00Z',
    signed_by: 'Billy Boy',
    contract_text: '',
    protections: {
      manufacturerDefectCarveOut: true,
      latePaymentPenalties: true,
      zeroVerbalChangeOrders: true,
      preliminaryLienNotice: true,
      limitedWorkmanshipWarranty: true,
    },
  },
];

// Initialize seed contract texts
for (const sc of SEED_CONTRACTS) {
  sc.contract_text = generateContractText(sc, sc.contract_number);
}

function readLocalBotState(): Partial<ContractDashboardState> | null {
  try {
    if (fs.existsSync(LOCAL_BOT_CONTRACTS_PATH)) {
      const raw = fs.readFileSync(LOCAL_BOT_CONTRACTS_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Failed reading local bot contracts state:', err);
  }
  return null;
}

function writeLocalBotState(state: ContractDashboardState): void {
  try {
    const dir = path.dirname(LOCAL_BOT_CONTRACTS_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOCAL_BOT_CONTRACTS_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    // Ignore write errors in cloud environments
  }
}

export async function getContractsState(): Promise<ContractDashboardState> {
  const db = getSupabaseAdmin();
  let state: Partial<ContractDashboardState> = {};

  try {
    const { data } = await db
      .from('progress_trackers')
      .select('state')
      .eq('id', CONTRACTS_STATE_ID)
      .maybeSingle();

    if (data && data.state && typeof data.state === 'object') {
      state = data.state as Partial<ContractDashboardState>;
    }
  } catch (err) {
    console.error('Supabase getContractsState read error:', err);
  }

  // Check local bot state
  const localBot = readLocalBotState();
  let localContracts: ContractItem[] = [];
  let localNextNumber = 1;
  if (localBot && Array.isArray(localBot.contracts)) {
    localContracts = localBot.contracts as ContractItem[];
    localNextNumber = localBot.next_number || localContracts.length + 1;
  }

  let contracts: ContractItem[] = state.contracts || [];
  if (contracts.length === 0) {
    contracts = localContracts.length > 0 ? localContracts : SEED_CONTRACTS;
  } else if (localContracts.length > 0) {
    const existingIds = new Set(contracts.map((c) => c.id || c.contract_number));
    for (const lc of localContracts) {
      const key = lc.id || lc.contract_number;
      if (!existingIds.has(key)) {
        contracts.push(lc);
      }
    }
  }

  // Ensure all contracts have valid text and protections
  for (const c of contracts) {
    if (!c.contract_text) {
      c.contract_text = generateContractText(c, c.contract_number);
    }
    if (!c.protections) {
      c.protections = {
        manufacturerDefectCarveOut: true,
        latePaymentPenalties: true,
        zeroVerbalChangeOrders: true,
        preliminaryLienNotice: true,
        limitedWorkmanshipWarranty: true,
      };
    }
  }

  const nextNumber = Math.max(
    state.next_number || 1,
    localNextNumber,
    ...contracts.map((c) => c.n || 0).map((n) => n + 1)
  );

  return {
    contracts,
    next_number: nextNumber,
    lastUpdated: state.lastUpdated || new Date().toISOString(),
  };
}

export async function saveContractsState(
  state: ContractDashboardState,
  actor: string
): Promise<ContractDashboardState> {
  const db = getSupabaseAdmin();
  state.lastUpdated = new Date().toISOString();

  // Save to Supabase
  try {
    await db.from('progress_trackers').upsert({
      id: CONTRACTS_STATE_ID,
      project_name: 'Legal & Accounting Contracts',
      invoice_number: 'live',
      state: state as unknown as Record<string, unknown>,
      updated_by: actor,
    });
  } catch (err) {
    console.error('Supabase saveContractsState upsert error:', err);
  }

  // Sync to local bot file
  writeLocalBotState(state);

  return state;
}

export async function draftContract(
  input: DraftContractInput,
  actor = 'bot'
): Promise<ContractItem> {
  const state = await getContractsState();
  const n = state.next_number || state.contracts.length + 1;
  const contractId = `cnt-${String(n).padStart(3, '0')}`;
  const contractNo = `SWC-${new Date().getFullYear()}-${String(n).padStart(3, '0')}`;
  const contractType = input.type || 'prime_residential';
  const amount = Number(input.amount || 0);
  const deposit = input.deposit !== undefined ? Number(input.deposit) : amount * 0.1;

  const newContract: ContractItem = {
    id: contractId,
    n,
    contract_number: contractNo,
    type: contractType,
    client_name: input.client_name,
    client_entity: input.client_entity || input.client_name,
    project_name:
      input.project_name ||
      (contractType === 'prime_residential'
        ? `${input.client_name} Residence`
        : `${input.client_name} Project`),
    project_address: input.project_address,
    amount,
    deposit,
    scope: input.scope,
    scope_details: input.scope_details || '',
    warranty_years:
      input.warranty_years !== undefined
        ? input.warranty_years
        : contractType === 'prime_residential'
          ? 2
          : 1,
    late_interest: input.late_interest || '1.5% per month (18% per annum)',
    remobilization_fee:
      input.remobilization_fee !== undefined ? Number(input.remobilization_fee) : 1500.0,
    date: new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }),
    status: 'draft',
    created_by: actor || input.created_by || 'Lando',
    created_at: new Date().toISOString(),
    contract_text: '',
    protections: {
      manufacturerDefectCarveOut: true,
      latePaymentPenalties: true,
      zeroVerbalChangeOrders: true,
      preliminaryLienNotice: true,
      limitedWorkmanshipWarranty: true,
    },
  };

  newContract.contract_text = generateContractText(newContract, contractNo);

  state.contracts.push(newContract);
  state.next_number = n + 1;
  await saveContractsState(state, actor);

  return newContract;
}

export async function updateContract(
  id: string,
  updates: Partial<ContractItem>,
  actor: string
): Promise<ContractItem | null> {
  const state = await getContractsState();
  const index = state.contracts.findIndex(
    (c) => c.id === id || c.contract_number === id || String(c.n) === id
  );
  if (index === -1) return null;

  const current = state.contracts[index];
  const updated: ContractItem = {
    ...current,
    ...updates,
    updated_at: new Date().toISOString(),
  };

  if (updates.status === 'signed' && !updated.signed_at) {
    updated.signed_at = new Date().toISOString();
    updated.signed_by = actor;
  }

  // Re-generate text if terms changed
  if (
    updates.amount !== undefined ||
    updates.scope !== undefined ||
    updates.client_name !== undefined ||
    updates.project_address !== undefined
  ) {
    updated.contract_text = generateContractText(updated, updated.contract_number);
  }

  state.contracts[index] = updated;
  await saveContractsState(state, actor);
  return updated;
}
