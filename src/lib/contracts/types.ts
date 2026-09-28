export type ContractType = 'prime_residential' | 'prime_commercial' | 'subcontractor';

export type ContractStatus = 'draft' | 'under_review' | 'sent' | 'signed' | 'rejected';

export interface ContractProtections {
  manufacturerDefectCarveOut: boolean;
  latePaymentPenalties: boolean;
  zeroVerbalChangeOrders: boolean;
  preliminaryLienNotice: boolean;
  limitedWorkmanshipWarranty: boolean;
}

export interface ContractItem {
  id: string;
  n: number;
  contract_number: string;
  type: ContractType;
  client_name: string;
  client_entity?: string;
  project_name: string;
  project_address: string;
  amount: number;
  deposit: number;
  scope: string;
  scope_details?: string;
  warranty_years: number;
  late_interest: string;
  remobilization_fee: number;
  date: string;
  status: ContractStatus;
  created_by: string;
  created_at: string;
  updated_at?: string;
  contract_text: string;
  protections?: ContractProtections;
  signed_at?: string;
  signed_by?: string;
}

export interface ContractDashboardState {
  contracts: ContractItem[];
  next_number: number;
  lastUpdated: string;
}

export interface DraftContractInput {
  client_name: string;
  client_entity?: string;
  project_name?: string;
  project_address: string;
  amount: number;
  deposit?: number;
  scope: string;
  scope_details?: string;
  type?: ContractType;
  warranty_years?: number;
  late_interest?: string;
  remobilization_fee?: number;
  date?: string;
  created_by?: string;
}
