export type LeadKBContext = {
  docs: number;
  last: string;
  subjects: string;
};

export type LeadItem = {
  phone: string;
  display: string;
  named: boolean;
  unread: number;
  last: string;
  last_ts: string | null;
  age_days: number;
  tags: string[];
  opps: number;
  fanout: boolean;
  tollfree: boolean;
  score: number;
  snippet: string;
  kb: LeadKBContext | null;
  dial_url: string;
  suggested_sms: string;
  sms_url: string;
  callback_status?: 'pending' | 'called' | 'texted' | 'dismissed';
};

export type LeadsState = {
  generated: string;
  total_waiting: number;
  fresh: number;
  backlog: number;
  backlog_with_history: number;
  with_history: number;
  named: number;
  fresh_list: LeadItem[];
  backlog_list: LeadItem[];
  gone_quiet: Array<{
    phone: string;
    display: string;
    quiet_days: number;
    tags: string[];
    opps: number;
    snippet: string;
    kb?: LeadKBContext | null;
    dial_url?: string;
    suggested_sms?: string;
    sms_url?: string;
  }>;
  gone_quiet_total: number;
};
