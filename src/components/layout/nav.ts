// The one navigation (docs/COHESIVE-APP-PLAN.md §2). The phone tab bar and the
// desktop sidebar are two layouts of this list, and /internal uses it too, so
// nobody has to know which half of the portal a screen lives in.
//
// Screens only hide here; every page and API still checks the seat itself.

import {
  Briefcase,
  Building2,
  CalendarDays,
  ClipboardList,
  Construction,
  HardHat,
  Home,
  Landmark,
  ListChecks,
  ListTodo,
  Menu,
  MessageSquare,
  Settings,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react'

export type NavAccess = 'staff' | 'owner' | 'crewAdmin'

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  group: 'Work' | 'Money' | 'Office'
  /** On the phone tab bar, in this order. */
  tab?: number
  access?: NavAccess
  /** Other paths that light this entry up. */
  also?: string[]
  children?: { href: string; label: string }[]
}

export const ACCOUNTING_SECTIONS: { href: string; label: string; short: string }[] = [
  { href: '/app/accounting', label: 'Overview', short: 'Overview' },
  { href: '/app/accounting/payroll', label: 'Payroll and labor', short: 'Payroll' },
  { href: '/app/accounting/purchases', label: 'Purchases', short: 'Purchases' },
  { href: '/app/accounting/payables', label: 'Payables', short: 'Payables' },
  { href: '/app/accounting/receivables', label: 'Receivables', short: 'Receivables' },
  { href: '/app/accounting/billing', label: 'Billing', short: 'Billing' },
  { href: '/app/accounting/job-costing', label: 'Job costing', short: 'Job cost' },
]

export const NAV: NavItem[] = [
  { href: '/app', label: 'Home', icon: Home, group: 'Work', tab: 1 },
  { href: '/app/sales', label: 'Sales', icon: TrendingUp, group: 'Work', tab: 2 },
  { href: '/app/jobs', label: 'Jobs', icon: Briefcase, group: 'Work', tab: 3, access: 'owner', also: ['/app/projects'] },
  { href: '/app/schedule', label: 'Schedule', icon: CalendarDays, group: 'Work', access: 'owner', also: ['/internal/ops/calendar'] },
  { href: '/app/crew', label: 'Crew', icon: HardHat, group: 'Work', tab: 4, access: 'crewAdmin' },
  { href: '/app/tasks', label: 'Tasks', icon: ListTodo, group: 'Work', access: 'owner' },
  { href: '/app/departments', label: 'Departments', icon: Building2, group: 'Work', access: 'owner' },
  { href: '/app/subs', label: 'Subs and bids', icon: Users, group: 'Work' },
  {
    href: '/app/accounting',
    label: 'Accounting',
    icon: Landmark,
    group: 'Money',
    tab: 5,
    access: 'owner',
    also: ['/app/money', '/app/bill'],
    children: ACCOUNTING_SECTIONS.slice(1),
  },
  { href: '/app/ask', label: 'Ask the bot', icon: MessageSquare, group: 'Office' },
  { href: '/app/duties', label: 'Duties', icon: ListChecks, group: 'Office' },
  { href: '/internal/ops', label: 'Ops board', icon: ClipboardList, group: 'Office', access: 'owner' },
  { href: '/app/policies', label: 'Settings', icon: Settings, group: 'Office', also: ['/app/sales/settings'] },
  // The batch-2 prototypes and the pipeline estimates stay where they are
  // (KB APP-CLEANUP, batch 2 on hold); they are reached from one place.
  { href: '/internal', label: 'Old tools', icon: Construction, group: 'Office', access: 'owner' },
  { href: '/app/more', label: 'More', icon: Menu, group: 'Office', tab: 6 },
]

export type NavViewer = { owner: boolean; crewAdmin: boolean }

export function visibleNav(v: NavViewer): NavItem[] {
  return NAV.filter((i) => !i.access || (i.access === 'owner' ? v.owner : i.access === 'crewAdmin' ? v.crewAdmin : true))
}

export function phoneTabs(v: NavViewer): NavItem[] {
  return visibleNav(v)
    .filter((i) => i.tab)
    .sort((a, b) => (a.tab ?? 0) - (b.tab ?? 0))
}

/** The entry a path belongs to: the longest match wins, so /app never steals /app/sales. */
export function activeHref(pathname: string, items: NavItem[] = NAV): string | null {
  let best: { href: string; len: number } | null = null
  for (const i of items) {
    for (const h of [i.href, ...(i.also ?? [])]) {
      const hit = h === '/app' || h === '/internal' ? pathname === h : pathname === h || pathname.startsWith(h + '/')
      if (hit && (!best || h.length > best.len)) best = { href: i.href, len: h.length }
    }
  }
  // The old portal's own pages all sit under "Old tools" unless they have an entry.
  if (!best && pathname.startsWith('/internal')) return '/internal'
  return best?.href ?? null
}
