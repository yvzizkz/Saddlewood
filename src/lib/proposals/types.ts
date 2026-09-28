export type ProposalArchetype = 'commercial_gc' | 'luxury_residential' | 'scope_addendum';

export type ProposalStatus = 'draft' | 'sent' | 'accepted' | 'declined';

export type ProposalLineItem = {
  id: string;
  phase: string;
  description: string;
  qty?: number;
  unit?: string;
  unit_price?: number;
  amount: number;
  dim_type?: 'written' | 'schedule' | 'calculated' | 'scaled' | 'assumed';
  sheet_detail?: string;
  notes?: string;
};

export type ProposalAlternate = {
  id: string;
  title: string;
  description: string;
  amount: number;
  selected: boolean;
};

export type DrawingBasis = {
  base_rev?: string;
  current_rev: string;
  set_name: string;
  date: string;
  notes?: string;
};

export type ProposalItem = {
  id: string;
  token: string;
  proposal_number: string;
  client_name: string;
  client_company?: string;
  client_email?: string;
  client_phone?: string;
  project_name: string;
  project_address: string;
  archetype: ProposalArchetype;
  drawing_basis: DrawingBasis;
  base_amount: number;
  line_items: ProposalLineItem[];
  alternates: ProposalAlternate[];
  clarifications: string[];
  exclusions: string[];
  material_escalation_clause?: string;
  payment_terms: string;
  warranty_terms: string;
  valid_days: number;
  valid_until: string;
  status: ProposalStatus;
  accepted_at?: string;
  accepted_by?: string;
  accepted_signature?: string;
  accepted_ip?: string;
  created_at: string;
  created_by: string;
};

export type ProposalDashboardState = {
  proposals: ProposalItem[];
  next_number: number;
};

export type DraftProposalInput = {
  client_name: string;
  client_company?: string;
  client_email?: string;
  client_phone?: string;
  project_name: string;
  project_address: string;
  archetype: ProposalArchetype;
  current_rev: string;
  base_rev?: string;
  set_name: string;
  base_amount: number;
  line_items: ProposalLineItem[];
  alternates?: ProposalAlternate[];
  clarifications?: string[];
  exclusions?: string[];
  material_escalation_clause?: string;
  payment_terms?: string;
  warranty_terms?: string;
};
