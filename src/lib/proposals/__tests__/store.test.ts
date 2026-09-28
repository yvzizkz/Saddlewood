import { describe, it, expect } from 'vitest';
import { matchProposal } from '../store';
import type { ProposalItem } from '../types';

describe('Proposal Slug & Short URL Matching', () => {
  const bellevue: ProposalItem = {
    id: 'prp-001',
    token: 'bellevue-church-schifferer-ac938',
    proposal_number: 'PRP-2026-001',
    client_name: 'Dean Schifferer',
    project_name: 'Bellevue Heights Church',
    base_amount: 144913,
    line_items: [],
    alternates: [],
    clarifications: [],
    exclusions: [],
    payment_terms: '',
    warranty_terms: '',
    valid_days: 30,
    valid_until: '2026-10-24',
    status: 'sent',
    created_at: '2026-09-24T18:00:00Z',
    created_by: 'Marco',
  };

  const cardinal: ProposalItem = {
    id: 'prp-002',
    token: 'jk-cardinal-lot-267-268',
    proposal_number: 'PRP-2026-002',
    client_name: 'Jourdan',
    project_name: 'Cardinal - Lot 267 & 268 Remodel & Addition',
    base_amount: 406835.14,
    line_items: [],
    alternates: [],
    clarifications: [],
    exclusions: [],
    payment_terms: '',
    warranty_terms: '',
    valid_days: 30,
    valid_until: '2026-10-20',
    status: 'draft',
    created_at: '2026-09-21T11:20:00Z',
    created_by: 'Estimator',
  };

  const moore: ProposalItem = {
    id: 'prp-003',
    token: 'moore-buckeye-addition',
    proposal_number: 'PRP-2026-003',
    client_name: 'Cameron & Michelle Moore',
    project_name: 'Moore Residence 247 SF Room Addition',
    base_amount: 45000,
    line_items: [],
    alternates: [],
    clarifications: [],
    exclusions: [],
    payment_terms: '',
    warranty_terms: '',
    valid_days: 30,
    valid_until: '2026-10-24',
    status: 'draft',
    created_at: '2026-09-24T12:00:00Z',
    created_by: 'Marco',
  };

  it('matches full token', () => {
    expect(matchProposal(bellevue, 'bellevue-church-schifferer-ac938')).toBe(true);
    expect(matchProposal(cardinal, 'jk-cardinal-lot-267-268')).toBe(true);
    expect(matchProposal(moore, 'moore-buckeye-addition')).toBe(true);
  });

  it('matches clean short slug aliases', () => {
    expect(matchProposal(bellevue, 'bellevue')).toBe(true);
    expect(matchProposal(bellevue, 'schifferer')).toBe(true);
    expect(matchProposal(bellevue, 'ac938')).toBe(true);
    expect(matchProposal(bellevue, 'b1')).toBe(true);

    expect(matchProposal(cardinal, 'cardinal')).toBe(true);
    expect(matchProposal(cardinal, 'jk')).toBe(true);
    expect(matchProposal(cardinal, 'c1')).toBe(true);

    expect(matchProposal(moore, 'moore')).toBe(true);
    expect(matchProposal(moore, 'buckeye')).toBe(true);
    expect(matchProposal(moore, 'm1')).toBe(true);
  });

  it('matches proposal ID and number case-insensitively', () => {
    expect(matchProposal(bellevue, 'prp-001')).toBe(true);
    expect(matchProposal(bellevue, 'PRP-2026-001')).toBe(true);
    expect(matchProposal(cardinal, 'prp-002')).toBe(true);
  });

  it('rejects unmatched strings', () => {
    expect(matchProposal(bellevue, 'unrelated')).toBe(false);
    expect(matchProposal(bellevue, '')).toBe(false);
  });
});
