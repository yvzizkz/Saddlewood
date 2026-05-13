# Phase 4 — Editing Capabilities

## Phase Goal

Equip Marco with full in-place editing for every mutable field in the estimate — on mobile via bottom sheets and on desktop via inline cells — backed by a 2-second debounce autosave system, a comment thread for Marco↔estimator communication, and a live diff view that surfaces every deviation from the AI baseline. All mutations are optimistic-first and non-blocking; the UI never freezes waiting for a network response.

---

## Success Criteria

- [ ] Tapping any editable dollar value on iOS slides up `NumericBottomSheet` with a native decimal keypad
- [ ] Desktop click on an editable cell enters inline edit mode; Tab/Enter/Escape move through cells or commit/cancel
- [ ] `quantity`, `material_unit_cost`, `labor_unit_cost`, `description`, `area_location` are editable; all other fields are read-only
- [ ] `total` is always derived (`quantity × (material_unit_cost + labor_unit_cost)`), never directly edited
- [ ] Edited cells show yellow background; original AI value is accessible on hover (desktop) / in bottom sheet header (mobile)
- [ ] `is_manual_override: true` is written to the line item record on first edit
- [ ] Autosave fires 2 s after last keystroke, batches all dirty items, uses `Promise.allSettled`
- [ ] Header autosave indicator cycles: "Saved · just now" → "Saving…" → "Save failed — tap to retry"
- [ ] Overhead / Profit / Contingency / GC Sub Markup % are editable; grand total recalculates live
- [ ] Per-trade labor rate override drawer shows AI blended rate, live impact preview, and "Reset to AI default"
- [ ] Active labor override shows "Labor: custom" badge on the trade card
- [ ] "Add Row" creates an optimistic MANUAL-badged row; soft delete strikes through then confirms
- [ ] "Show deleted items" toggle per trade section works independently
- [ ] "Show changes" diff toggle highlights every cell that differs from `ai_baseline_snapshot`
- [ ] Changes summary panel shows count of changed items and net dollar delta
- [ ] Comment thread renders inline, supports Marco↔estimator replies, triggers email on POST
- [ ] All API routes return proper status codes and structured errors
- [ ] iOS keyboard does not push content behind the bottom sheet (uses `dvh` units)
- [ ] Zustand store batches updates; 200+ items don't cause stutter

---

## TypeScript Interfaces (shared across phase)

```typescript
// src/types/estimate.ts  (add to existing types file)

export interface LineItem {
  id: string
  trade_id: string
  estimate_id: string
  description: string
  area_location: string
  quantity: number
  material_unit_cost: number
  labor_unit_cost: number
  total: number                    // derived, read-only
  dimension_type: string           // read-only (AI)
  source_sheet: string             // read-only (AI)
  source_grid: string              // read-only (AI)
  confidence: number               // read-only (AI)
  is_manual_override: boolean
  is_deleted: boolean
  ai_baseline_snapshot: LineItemSnapshot | null
  created_at: string
  updated_at: string
}

export interface LineItemSnapshot {
  quantity: number
  material_unit_cost: number
  labor_unit_cost: number
  description: string
  area_location: string
}

export type EditableLineItemField =
  | 'quantity'
  | 'material_unit_cost'
  | 'labor_unit_cost'
  | 'description'
  | 'area_location'

export interface EstimateConfig {
  overhead_pct: number
  profit_pct: number
  contingency_pct: number
  gc_sub_markup_pct: number
}

export interface TradeSection {
  id: string
  estimate_id: string
  name: string
  labor_rate_override: number | null
  ai_blended_labor_rate: number
  line_items: LineItem[]
}

export interface Comment {
  id: string
  estimate_id: string
  author_id: string
  author_name: string
  author_role: 'marco' | 'estimator'
  body: string
  is_change_request: boolean
  created_at: string
}

export interface EstimateOverride {
  id: string
  estimate_id: string
  field: keyof EstimateConfig
  old_value: number
  new_value: number
  changed_at: string
}
```

---

## 3. `BottomSheet.tsx` — Component Spec

**File:** `src/components/ui/BottomSheet.tsx`

### Props

```typescript
interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  /** snap points in dvh units, default [50, 90] */
  snapPoints?: [number, number]
  /** initial snap index, default 0 */
  initialSnap?: number
}
```

### Animation

- Use `@headlessui/react` Dialog or a bare `div` with CSS transitions — no extra library.
- Sheet enters from bottom: `translateY(100%)` → `translateY(0)` using `transition: transform 300ms cubic-bezier(0.32, 0.72, 0, 1)`.
- Backdrop: fixed inset-0, `backdrop-blur-sm bg-black/40`, fades in over 200 ms, tap to close.
- Sheet container: fixed bottom-0 left-0 right-0, `border-radius: 16px 16px 0 0`, `background: #f5f0e8` (cream).

### Close on Swipe Down

```typescript
// Attach touch handlers to the drag handle bar
const startY = useRef(0)
const currentY = useRef(0)

const onTouchStart = (e: React.TouchEvent) => {
  startY.current = e.touches[0].clientY
}

const onTouchMove = (e: React.TouchEvent) => {
  currentY.current = e.touches[0].clientY
  const delta = currentY.current - startY.current
  if (delta > 0) {
    sheetRef.current!.style.transform = `translateY(${delta}px)`
  }
}

const onTouchEnd = () => {
  const delta = currentY.current - startY.current
  if (delta > 80) {
    onClose()
  } else {
    sheetRef.current!.style.transform = 'translateY(0)'
  }
}
```

### iOS Safe Area

```tsx
<div
  className="pb-[env(safe-area-inset-bottom)]"
  style={{ maxHeight: `${snapPoints[snapIndex]}dvh` }}
>
  {children}
</div>
```

- Use `dvh` (not `vh`) so the sheet never goes behind the iOS on-screen keyboard.
- Add `<meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content">` to `app/layout.tsx` so the viewport truly resizes when the keyboard appears.

### Full Component Skeleton

```tsx
'use client'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  snapPoints = [50, 90],
  initialSnap = 0,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const snapHeight = snapPoints[initialSnap]

  // Lock body scroll while open
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  if (!isOpen) return null

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 backdrop-blur-sm bg-black/40 transition-opacity duration-200"
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-[#f5f0e8] shadow-2xl
                   animate-slide-up pb-[env(safe-area-inset-bottom)]"
        style={{ maxHeight: `${snapHeight}dvh` }}
        role="dialog"
        aria-modal="true"
      >
        {/* Drag handle */}
        <div
          className="flex justify-center pt-3 pb-1 cursor-grab"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="w-10 h-1 rounded-full bg-[#2c2926]/20" />
        </div>
        {title && (
          <div className="px-5 pb-3 border-b border-[#2c2926]/10">
            <h2 className="text-base font-semibold text-[#2c2926]">{title}</h2>
          </div>
        )}
        <div className="overflow-y-auto h-full">{children}</div>
      </div>
    </>,
    document.body,
  )
}
```

**Tailwind keyframe (add to `globals.css`):**

```css
@keyframes slide-up {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
.animate-slide-up { animation: slide-up 300ms cubic-bezier(0.32, 0.72, 0, 1) both; }
```

---

## 4. `NumericBottomSheet.tsx` — Spec

**File:** `src/components/estimate/NumericBottomSheet.tsx`

### Purpose

Displayed when Marco taps a numeric cell on mobile. Shows item context, the current value, a decimal-capable input, and Cancel / Apply actions.

### Props

```typescript
interface NumericBottomSheetProps {
  isOpen: boolean
  onClose: () => void
  onApply: (newValue: number) => void
  /** Human label for the field being edited */
  fieldLabel: string
  /** Full description of the line item for context */
  itemDescription: string
  /** Current (possibly already-overridden) value */
  currentValue: number
  /** Original AI value for comparison header */
  aiValue: number | null
  /** Currency symbol prefix, default '$' */
  prefix?: string
  /** Number of decimal places, default 2 */
  decimals?: number
}
```

### Layout (inside `BottomSheet`)

```
┌────────────────────────────────────────┐
│  ▬▬▬                                   │  ← drag handle
│                                        │
│  FIELD: Material Unit Cost             │  ← fieldLabel, muted
│  05-A/F1 · Framing 2×6 studs @ 16"oc  │  ← itemDescription truncated
│                                        │
│  AI value: $2.40   ← greyed sub-label if aiValue differs from currentValue
│                                        │
│  ┌──────────────────────────────────┐  │
│  │  $ 2.80                          │  │  ← large input, inputmode="decimal"
│  └──────────────────────────────────┘  │
│                                        │
│  [    Cancel    ]  [    Apply     ]    │
└────────────────────────────────────────┘
```

### Comma Formatting

```typescript
const formatDisplay = (raw: string): string => {
  // strip non-numeric except dot
  const numeric = raw.replace(/[^\d.]/g, '')
  const [int, dec] = numeric.split('.')
  const formatted = Number(int || 0).toLocaleString('en-US')
  return dec !== undefined ? `${formatted}.${dec}` : formatted
}
```

- `inputMode="decimal"` — iOS shows numeric pad with decimal point.
- Store raw string in local state; parse to float on Apply.
- On Apply: if `parseFloat(raw) === aiValue` → `is_manual_override` stays false; otherwise true.

### Implementation Skeleton

```tsx
'use client'
import { useState, useEffect } from 'react'
import { BottomSheet } from '@/components/ui/BottomSheet'

export function NumericBottomSheet({
  isOpen, onClose, onApply, fieldLabel, itemDescription,
  currentValue, aiValue, prefix = '$', decimals = 2,
}: NumericBottomSheetProps) {
  const [raw, setRaw] = useState(currentValue.toFixed(decimals))

  useEffect(() => {
    if (isOpen) setRaw(currentValue.toFixed(decimals))
  }, [isOpen, currentValue, decimals])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^\d.]/g, '')
    // allow at most one decimal point
    const parts = val.split('.')
    const clean = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : val
    setRaw(clean)
  }

  const handleApply = () => {
    const num = parseFloat(raw)
    if (!isNaN(num)) onApply(num)
    onClose()
  }

  const isDirty = parseFloat(raw) !== aiValue

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} snapPoints={[45, 45]}>
      <div className="px-5 py-4 flex flex-col gap-4">
        {/* Context header */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[#2d4a4a]">{fieldLabel}</p>
          <p className="text-sm text-[#2c2926]/60 truncate mt-0.5">{itemDescription}</p>
          {aiValue !== null && isDirty && (
            <p className="text-xs text-[#2c2926]/40 mt-1">
              AI value: {prefix}{aiValue.toFixed(decimals)}
            </p>
          )}
        </div>

        {/* Input */}
        <div className="flex items-center gap-2 border-2 border-[#2d4a4a] rounded-xl px-4 py-3 bg-white">
          <span className="text-2xl text-[#2c2926]/40">{prefix}</span>
          <input
            autoFocus
            inputMode="decimal"
            className="text-3xl font-semibold text-[#2c2926] bg-transparent outline-none w-full"
            value={raw}
            onChange={handleChange}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-4 rounded-xl border-2 border-[#2c2926]/20 text-[#2c2926] font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="flex-1 py-4 rounded-xl bg-[#2d4a4a] text-[#f5f0e8] font-semibold"
          >
            Apply
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
```

---

## 5. `useAutosave.ts` — Hook Spec

**File:** `src/hooks/useAutosave.ts`

### Contract

```typescript
interface UseAutosaveOptions {
  estimateId: string
  debounceMs?: number   // default 2000
}

interface UseAutosaveReturn {
  status: 'idle' | 'saving' | 'saved' | 'error'
  lastSavedAt: Date | null
  triggerSave: () => void   // manual retry
}
```

### Debounce + Batch Logic

```typescript
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useEstimateStore } from '@/store/estimateStore'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function useAutosave({ estimateId, debounceMs = 2000 }: UseAutosaveOptions): UseAutosaveReturn {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dirtyItemIds = useEstimateStore((s) => s.dirtyItemIds)
  const lineItems    = useEstimateStore((s) => s.lineItems)
  const markClean    = useEstimateStore((s) => s.markItemsClean)

  const flush = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return
    setStatus('saving')

    const results = await Promise.allSettled(
      ids.map((id) => {
        const item = lineItems[id]
        if (!item) return Promise.resolve()
        return fetch(`/api/estimates/${estimateId}/line-items/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quantity:            item.quantity,
            material_unit_cost:  item.material_unit_cost,
            labor_unit_cost:     item.labor_unit_cost,
            description:         item.description,
            area_location:       item.area_location,
            is_manual_override:  item.is_manual_override,
          }),
        }).then((r) => { if (!r.ok) throw new Error(`${r.status}`) })
      }),
    )

    const anyFailed = results.some((r) => r.status === 'rejected')
    if (anyFailed) {
      setStatus('error')
    } else {
      markClean(ids)
      setLastSavedAt(new Date())
      setStatus('saved')
      // Revert to 'idle' after 5 s so "Saved · just now" fades
      setTimeout(() => setStatus('idle'), 5000)
    }
  }, [estimateId, lineItems, markClean])

  // Reschedule debounce whenever dirty set changes
  useEffect(() => {
    const ids = [...dirtyItemIds]
    if (ids.length === 0) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => flush(ids), debounceMs)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [dirtyItemIds, debounceMs, flush])

  const triggerSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    flush([...dirtyItemIds])
  }, [dirtyItemIds, flush])

  return { status, lastSavedAt, triggerSave }
}
```

### Zustand Store Additions

Add to `src/store/estimateStore.ts`:

```typescript
// Additions to state shape
dirtyItemIds: Set<string>
lineItems: Record<string, LineItem>   // flat map keyed by id (faster than array lookup)
showDiff: boolean
pendingComments: Comment[]

// Actions
markItemDirty: (id: string) => void
markItemsClean: (ids: string[]) => void
updateLineItemField: (id: string, field: EditableLineItemField, value: string | number) => void
addLineItem: (tradeId: string, item: Partial<LineItem>) => void
softDeleteLineItem: (id: string) => void
toggleDiff: () => void
addPendingComment: (comment: Comment) => void

// Zustand immer update for updateLineItemField:
updateLineItemField: (id, field, value) =>
  set((state) => {
    const item = state.lineItems[id]
    if (!item) return
    ;(item as any)[field] = value
    item.is_manual_override = true
    // Recompute derived total
    item.total = item.quantity * (item.material_unit_cost + item.labor_unit_cost)
    state.dirtyItemIds.add(id)
  }),
```

**Performance note for 200+ items:** Wrap consumer components with `useEstimateStore(selector)` using fine-grained selectors so only the changed cell re-renders. Never subscribe to the entire `lineItems` object in leaf components — select only `lineItems[id]`.

---

## 6. API Routes — Full Implementation Spec

All routes live under `src/app/api/estimates/[id]/`.

### Shared Helpers

```typescript
// src/lib/api/estimateHelpers.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function requireEstimateAccess(estimateId: string, userId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('estimates')
    .select('id, created_by, assigned_estimator')
    .eq('id', estimateId)
    .single()
  if (error || !data) return null
  const allowed = data.created_by === userId || data.assigned_estimator === userId
  return allowed ? data : null
}

export function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}
```

---

### `PATCH /api/estimates/[id]`

**File:** `src/app/api/estimates/[id]/route.ts`

Updates top-level config fields (overhead, profit, contingency, gc_sub_markup). Appends an audit row to `estimate_overrides`.

```typescript
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  const estimate = await requireEstimateAccess(params.id, user.id)
  if (!estimate) return apiError('Not found', 404)

  const body = await req.json() as Partial<EstimateConfig>
  const allowed: (keyof EstimateConfig)[] = [
    'overhead_pct', 'profit_pct', 'contingency_pct', 'gc_sub_markup_pct'
  ]
  const patch: Partial<EstimateConfig> = {}
  const overrideRows: Partial<EstimateOverride>[] = []

  // Fetch current values for audit log
  const { data: current } = await supabase
    .from('estimates')
    .select(allowed.join(','))
    .eq('id', params.id)
    .single()

  for (const field of allowed) {
    if (body[field] !== undefined) {
      patch[field] = body[field]
      overrideRows.push({
        estimate_id: params.id,
        field,
        old_value: current?.[field] ?? 0,
        new_value: body[field]!,
        changed_at: new Date().toISOString(),
      })
    }
  }

  const [updateResult] = await Promise.all([
    supabase.from('estimates').update(patch).eq('id', params.id),
    overrideRows.length
      ? supabase.from('estimate_overrides').insert(overrideRows)
      : Promise.resolve(),
  ])

  if (updateResult.error) return apiError(updateResult.error.message, 500)
  return NextResponse.json({ ok: true })
}
```

---

### `PATCH /api/estimates/[id]/trades/[tradeId]`

**File:** `src/app/api/estimates/[id]/trades/[tradeId]/route.ts`

Updates `labor_rate_override`. Accepts `null` to reset.

```typescript
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; tradeId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  const estimate = await requireEstimateAccess(params.id, user.id)
  if (!estimate) return apiError('Not found', 404)

  const { labor_rate_override } = await req.json() as { labor_rate_override: number | null }

  const { error } = await supabase
    .from('trade_sections')
    .update({ labor_rate_override })
    .eq('id', params.tradeId)
    .eq('estimate_id', params.id)

  if (error) return apiError(error.message, 500)
  return NextResponse.json({ ok: true })
}
```

---

### `PATCH /api/estimates/[id]/line-items/[itemId]`

**File:** `src/app/api/estimates/[id]/line-items/[itemId]/route.ts`

Updates editable fields only. Strips any attempt to write read-only fields.

```typescript
const EDITABLE_FIELDS = [
  'quantity', 'material_unit_cost', 'labor_unit_cost',
  'description', 'area_location', 'is_manual_override',
] as const

export async function PATCH(
  req: Request,
  { params }: { params: { id: string; itemId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  const estimate = await requireEstimateAccess(params.id, user.id)
  if (!estimate) return apiError('Not found', 404)

  const body = await req.json()
  const patch: Record<string, unknown> = {}
  for (const field of EDITABLE_FIELDS) {
    if (field in body) patch[field] = body[field]
  }

  // Recompute total server-side (source of truth)
  if ('quantity' in patch || 'material_unit_cost' in patch || 'labor_unit_cost' in patch) {
    const { data: current } = await supabase
      .from('line_items')
      .select('quantity,material_unit_cost,labor_unit_cost')
      .eq('id', params.itemId)
      .single()
    const q   = (patch.quantity            ?? current?.quantity)            as number
    const mc  = (patch.material_unit_cost  ?? current?.material_unit_cost)  as number
    const lc  = (patch.labor_unit_cost     ?? current?.labor_unit_cost)     as number
    patch.total = q * (mc + lc)
  }

  patch.updated_at = new Date().toISOString()

  const { error } = await supabase
    .from('line_items')
    .update(patch)
    .eq('id', params.itemId)
    .eq('estimate_id', params.id)

  if (error) return apiError(error.message, 500)
  return NextResponse.json({ ok: true })
}
```

---

### `POST /api/estimates/[id]/line-items`

Creates a new manual line item with empty/default fields.

```typescript
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  const estimate = await requireEstimateAccess(params.id, user.id)
  if (!estimate) return apiError('Not found', 404)

  const body = await req.json() as { trade_id: string; description?: string }

  const newItem = {
    estimate_id:        params.id,
    trade_id:           body.trade_id,
    description:        body.description ?? '',
    area_location:      '',
    quantity:           0,
    material_unit_cost: 0,
    labor_unit_cost:    0,
    total:              0,
    dimension_type:     'assumed',
    source_sheet:       'MANUAL',
    source_grid:        '',
    confidence:         0,
    is_manual_override: true,
    is_deleted:         false,
    ai_baseline_snapshot: null,
    created_at:         new Date().toISOString(),
    updated_at:         new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('line_items')
    .insert(newItem)
    .select()
    .single()

  if (error) return apiError(error.message, 500)
  return NextResponse.json(data, { status: 201 })
}
```

---

### `DELETE /api/estimates/[id]/line-items/[itemId]`

Soft delete — sets `is_deleted: true`.

```typescript
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; itemId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  const estimate = await requireEstimateAccess(params.id, user.id)
  if (!estimate) return apiError('Not found', 404)

  const { error } = await supabase
    .from('line_items')
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq('id', params.itemId)
    .eq('estimate_id', params.id)

  if (error) return apiError(error.message, 500)
  return NextResponse.json({ ok: true })
}
```

---

### `POST /api/estimates/[id]/comments`

Inserts comment and triggers email notification.

```typescript
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  const body = await req.json() as { body: string; is_change_request?: boolean }
  if (!body.body?.trim()) return apiError('Comment body required', 400)

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  const comment = {
    estimate_id:       params.id,
    author_id:         user.id,
    author_name:       profile?.full_name ?? 'Unknown',
    author_role:       profile?.role ?? 'estimator',
    body:              body.body.trim(),
    is_change_request: body.is_change_request ?? false,
    created_at:        new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('estimate_comments')
    .insert(comment)
    .select()
    .single()

  if (error) return apiError(error.message, 500)

  // Trigger email notification (non-blocking — fire and forget)
  notifyCounterpart(params.id, comment).catch(console.error)

  return NextResponse.json(data, { status: 201 })
}

async function notifyCounterpart(estimateId: string, comment: typeof comment) {
  const supabase = createClient()
  const { data: estimate } = await supabase
    .from('estimates')
    .select('id, title, created_by, assigned_estimator')
    .eq('id', estimateId)
    .single()
  if (!estimate) return

  // Determine recipient (opposite party)
  const recipientId =
    comment.author_role === 'marco'
      ? estimate.assigned_estimator
      : estimate.created_by

  const { data: recipient } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('id', recipientId)
    .single()
  if (!recipient?.email) return

  // Use Supabase Edge Function or your email provider (Resend/SendGrid)
  await fetch(process.env.EMAIL_EDGE_FUNCTION_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    body: JSON.stringify({
      to:      recipient.email,
      subject: `New comment on estimate: ${estimate.title}`,
      html:    `<p><strong>${comment.author_name}</strong> commented:<br>${comment.body}</p>
                <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/estimates/${estimateId}">View estimate →</a></p>`,
    }),
  })
}
```

---

### `GET /api/estimates/[id]/comments`

```typescript
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  const estimate = await requireEstimateAccess(params.id, user.id)
  if (!estimate) return apiError('Not found', 404)

  const { data, error } = await supabase
    .from('estimate_comments')
    .select('*')
    .eq('estimate_id', params.id)
    .order('created_at', { ascending: true })

  if (error) return apiError(error.message, 500)
  return NextResponse.json(data)
}
```

---

## 7. Diff View Implementation

**File:** `src/hooks/useDiffView.ts`

```typescript
import { useEstimateStore } from '@/store/estimateStore'

export interface DiffCell {
  itemId: string
  field: EditableLineItemField
  aiValue: number | string
  currentValue: number | string
  delta: number  // for numeric fields, currentValue - aiValue
}

export function useDiffView() {
  const lineItems = useEstimateStore((s) => s.lineItems)
  const showDiff  = useEstimateStore((s) => s.showDiff)

  if (!showDiff) return { diffCells: new Map<string, DiffCell>(), summary: null }

  const diffCells = new Map<string, DiffCell>()
  let changedCount = 0
  let netDollarDelta = 0

  for (const item of Object.values(lineItems)) {
    if (!item.ai_baseline_snapshot || item.is_deleted) continue
    const snap = item.ai_baseline_snapshot
    const numericFields: (keyof LineItemSnapshot)[] = [
      'quantity', 'material_unit_cost', 'labor_unit_cost'
    ]
    for (const field of numericFields) {
      if (item[field] !== snap[field]) {
        const key = `${item.id}:${field}`
        diffCells.set(key, {
          itemId: item.id,
          field: field as EditableLineItemField,
          aiValue: snap[field],
          currentValue: item[field],
          delta: (item[field] as number) - (snap[field] as number),
        })
      }
    }
    // Compare derived totals
    const aiTotal  = snap.quantity * (snap.material_unit_cost + snap.labor_unit_cost)
    const nowTotal = item.total
    if (aiTotal !== nowTotal) {
      changedCount++
      netDollarDelta += nowTotal - aiTotal
    }
  }

  return {
    diffCells,
    summary: {
      changedCount,
      netDollarDelta,
    },
  }
}
```

### Using Diff in Cells

```tsx
// In your LineItemRow component:
const { diffCells, summary } = useDiffView()
const cellKey = `${item.id}:material_unit_cost`
const diff = diffCells.get(cellKey)

<td
  className={diff ? 'bg-yellow-100' : ''}
  title={diff ? `AI: $${diff.aiValue} → You: $${diff.currentValue}` : undefined}
>
  {formatCurrency(item.material_unit_cost)}
</td>
```

---

## 8. Labor Rate Impact Calculator

**File:** `src/utils/laborImpact.ts`

```typescript
export interface LaborRateImpact {
  affectedCount: number
  netDollarChange: number
  currentRate: number
  proposedRate: number
}

/**
 * Compute the net dollar change if a trade's blended labor rate changes.
 *
 * Each line item's labor cost = quantity × labor_unit_cost.
 * The AI sets labor_unit_cost proportionally from the blended rate.
 * Overriding the trade rate scales all non-manually-overridden items.
 *
 * ratioFactor = proposedRate / aiBlendedRate
 * for each item: newLaborCost = item.quantity × item.ai_baseline_snapshot.labor_unit_cost × ratioFactor
 * delta per item = (newLaborCost - item.quantity × item.labor_unit_cost)
 */
export function computeLaborRateImpact(
  tradeItems: LineItem[],
  aiBlendedRate: number,
  proposedRate: number,
): LaborRateImpact {
  if (aiBlendedRate === 0) {
    return { affectedCount: 0, netDollarChange: 0, currentRate: 0, proposedRate }
  }

  const ratioFactor = proposedRate / aiBlendedRate
  let affectedCount = 0
  let netDollarChange = 0

  for (const item of tradeItems) {
    if (item.is_deleted) continue
    // Skip items where labor was individually overridden
    if (item.is_manual_override && item.ai_baseline_snapshot?.labor_unit_cost !== item.labor_unit_cost) {
      continue
    }
    const baseLabor = item.ai_baseline_snapshot?.labor_unit_cost ?? item.labor_unit_cost
    const currentLabor = item.quantity * item.labor_unit_cost
    const newLabor     = item.quantity * baseLabor * ratioFactor
    netDollarChange += newLabor - currentLabor
    affectedCount++
  }

  return {
    affectedCount,
    netDollarChange,
    currentRate: aiBlendedRate,
    proposedRate,
  }
}
```

### Display in Trade Drawer

```
AI blended rate for Framing: $2.40/LF
Override rate: [_______ $2.80 _______]

↳ Changing $2.40 → $2.80 affects 35 items, net change: +$8,400

                        [ Reset to AI default ]
```

---

## 9. `EstimateComments.tsx` — Component Spec

**File:** `src/components/estimate/EstimateComments.tsx`

### Layout

Fixed at the bottom of the estimate review page (above the Approve button on mobile). On desktop it occupies a right-side panel that is always visible when the estimate is in review.

```typescript
interface EstimateCommentsProps {
  estimateId: string
  currentUserId: string
  currentUserRole: 'marco' | 'estimator'
}
```

### Fetch Strategy

- Initial load: `GET /api/estimates/[id]/comments` via `useEffect` on mount.
- Real-time: subscribe to Supabase Realtime channel `estimate_comments:estimate_id=eq.[id]` to receive inserts without polling.
- Optimistic insert: push to `pendingComments` in Zustand immediately on submit, then reconcile when the POST response arrives (replace temp id with real id).

### Comment Bubble Layout

```
┌─────────────────────────────────────────────────┐
│  [M]  Marco Vitela                   2d ago      │
│       Need to add 500 LF of blocking             │
│       on the east wall per RFI-04.               │
│                                           [CHANGE REQUEST] tag (gold badge)
├─────────────────────────────────────────────────┤
│                          Estimator · just now [E]│
│             Updated blocking on E-wall. See      │
│             trade section 3, rows 44-46.         │
└─────────────────────────────────────────────────┘
```

- Marco's comments: left-aligned, `bg-[#2d4a4a]/10` bubble.
- Estimator's comments: right-aligned, `bg-[#c8a55a]/20` bubble.
- Avatar: circle with initial, colored by role.
- Change request badge: gold `bg-[#c8a55a] text-[#2c2926]`, label "[CHANGE REQUEST]".

### Skeleton

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { useEstimateStore } from '@/store/estimateStore'
import type { Comment } from '@/types/estimate'

export function EstimateComments({ estimateId, currentUserId, currentUserRole }: EstimateCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [draft, setDraft]       = useState('')
  const [isChangeRequest, setIsChangeRequest] = useState(false)
  const [isSubmitting, setIsSubmitting]       = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/estimates/${estimateId}/comments`)
      .then((r) => r.json())
      .then(setComments)
  }, [estimateId])

  // Supabase realtime
  useEffect(() => {
    const { createClient } = require('@/lib/supabase/client')
    const sb = createClient()
    const channel = sb
      .channel(`comments:${estimateId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'estimate_comments',
        filter: `estimate_id=eq.${estimateId}`,
      }, (payload: { new: Comment }) => {
        setComments((prev) => {
          // Avoid duplicate if we optimistically added it
          if (prev.find((c) => c.id === payload.new.id)) return prev
          return [...prev, payload.new]
        })
      })
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [estimateId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments.length])

  const handleSubmit = async () => {
    if (!draft.trim()) return
    setIsSubmitting(true)
    const optimistic: Comment = {
      id:              `temp-${Date.now()}`,
      estimate_id:     estimateId,
      author_id:       currentUserId,
      author_name:     'You',
      author_role:     currentUserRole,
      body:            draft.trim(),
      is_change_request: isChangeRequest,
      created_at:      new Date().toISOString(),
    }
    setComments((prev) => [...prev, optimistic])
    setDraft('')

    const res = await fetch(`/api/estimates/${estimateId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: optimistic.body, is_change_request: isChangeRequest }),
    })
    const real: Comment = await res.json()
    setComments((prev) => prev.map((c) => c.id === optimistic.id ? real : c))
    setIsSubmitting(false)
  }

  return (
    <section className="flex flex-col h-full" aria-label="Comments">
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {comments.map((c) => (
          <CommentBubble key={c.id} comment={c} isMine={c.author_id === currentUserId} />
        ))}
        <div ref={bottomRef} />
      </div>
      {/* Compose area */}
      <div className="border-t border-[#2c2926]/10 p-4 flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm text-[#2c2926]/60 cursor-pointer">
          <input
            type="checkbox"
            checked={isChangeRequest}
            onChange={(e) => setIsChangeRequest(e.target.checked)}
            className="accent-[#c8a55a]"
          />
          Mark as change request
        </label>
        <div className="flex gap-2">
          <textarea
            rows={2}
            placeholder="Add a comment…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="flex-1 resize-none rounded-xl border border-[#2c2926]/20 px-3 py-2
                       text-sm text-[#2c2926] bg-white focus:outline-none focus:border-[#2d4a4a]"
          />
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !draft.trim()}
            className="self-end px-4 py-2 rounded-xl bg-[#2d4a4a] text-[#f5f0e8] text-sm font-semibold
                       disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </section>
  )
}
```

---

## 10. Desktop Inline Editing Spec

**File:** `src/components/estimate/LineItemCell.tsx`

### State machine per cell

```
DISPLAY  →  (click / Tab)  →  EDITING  →  (Enter / Tab)  →  commits + moves to next cell
                                        →  (Escape)       →  reverts, returns to DISPLAY
```

### Implementation Pattern

```tsx
'use client'
import { useRef, useState } from 'react'

interface LineItemCellProps {
  itemId: string
  field: EditableLineItemField
  value: string | number
  type: 'number' | 'text'
  isHighlighted: boolean   // from diff view
  aiValue?: string | number
  onCommit: (field: EditableLineItemField, value: string | number) => void
}

export function LineItemCell({
  itemId, field, value, type, isHighlighted, aiValue, onCommit
}: LineItemCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(String(value))
  const inputRef = useRef<HTMLInputElement>(null)

  const enter = () => {
    setDraft(String(value))
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const commit = () => {
    const coerced = type === 'number' ? parseFloat(draft) || 0 : draft
    onCommit(field, coerced)
    setEditing(false)
  }

  const cancel = () => {
    setDraft(String(value))
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        value={draft}
        type={type === 'number' ? 'text' : 'text'}
        inputMode={type === 'number' ? 'decimal' : 'text'}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); commit() }
          if (e.key === 'Escape') cancel()
        }}
        className="w-full px-2 py-1 border-2 border-[#2d4a4a] rounded text-sm focus:outline-none"
      />
    )
  }

  return (
    <span
      role="button"
      tabIndex={0}
      title={isHighlighted && aiValue !== undefined ? `AI: ${aiValue} → You: ${value}` : undefined}
      onClick={enter}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') enter() }}
      className={[
        'block w-full px-2 py-1 rounded cursor-pointer text-sm',
        'hover:bg-[#2d4a4a]/10 focus:outline-none focus:ring-1 focus:ring-[#2d4a4a]',
        isHighlighted ? 'bg-yellow-100' : '',
      ].join(' ')}
    >
      {value}
    </span>
  )
}
```

### Keyboard Navigation Across Cells

Maintain a 2D ref map of `[rowIndex][fieldIndex]` → input. On Tab in any cell, call `cellRefs[row][col + 1]?.focus()` (or wrap to next row).

---

## 11. ASCII Wireframes

### Mobile — Numeric Bottom Sheet Editor

```
┌────────────────────────────────────────┐
│ ▐▐▐▐▐▐ ESTIMATE PORTAL ▐▐▐▐▐▐        │  ← sticky header
│   Saved · ● just now                  │
├────────────────────────────────────────┤
│                                        │
│  FRAMING                    $84,320 ›  │
│  ─────────────────────────────────── │
│  2×6 studs @ 16"oc  [$2.80] [del]    │  ← tap $2.80 triggers sheet
│  Double top plate   [$1.20] [del]    │
│                                        │
│       [ + Add Row ]                    │
│                                        │
╞════════════════════════════════════════╡  ← bottom sheet slides up
│          ▬▬▬                           │  ← drag handle
│                                        │
│  FIELD: Material Unit Cost             │
│  2×6 studs @ 16"oc E-wall             │
│  AI value: $2.40                       │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │  $  2.80                    [×]  │  │  ← large input, inputMode=decimal
│  └──────────────────────────────────┘  │
│                                        │
│  [      Cancel      ]  [    Apply   ]  │
│                                        │  ← env(safe-area-inset-bottom)
└────────────────────────────────────────┘
```

---

### Mobile — "Edit Financials" Drawer

```
┌────────────────────────────────────────┐
│  Grand Total                           │
│                      $   1 2 4 , 8 0 0 │
│                                        │
│  [ Edit Financials ]                   │  ← tap to open
├════════════════════════════════════════╡  ← drawer slides up
│          ▬▬▬                           │
│  Edit Financials                       │
│  ─────────────────────────────────── │
│  Overhead        [  12.0  ] %          │
│  Profit          [  10.0  ] %          │
│  Contingency     [   5.0  ] %          │
│  GC Sub Markup   [   8.0  ] %          │
│                                        │
│  Live Grand Total:  $ 124,800          │  ← recalculates on keystroke
│                                        │
│  [ Cancel ]           [ Save Changes ] │
│                        (safe area)     │
└────────────────────────────────────────┘
```

---

### Desktop — Diff View with Yellow Highlights

```
╔══════════════════════════════════════════════════════════════════════════╗
║  SADDLEWOOD CONTRACTING PORTAL                                           ║
║  Bellevue Church – Framing Estimate                     ● Saved · 2m ago║
╠══════════════════════════════════════════════════════════════════════════╣
║  Financials (left sidebar)    │  [ Show changes ✓ ]  [ Changes: 8 items  ║
║  ─────────────────────────── │    Net impact: +$12,400 ]                 ║
║  Overhead     12.0 %          │                                          ║
║  Profit       10.0 %          │  FRAMING                      $84,320    ║
║  Contingency   5.0 %          │  ────────────────────────────────────── ║
║  GC Markup     8.0 %          │  Desc          Qty  Mat/U    Lab/U  Total║
║                               │  2×6 studs    480  [████]  $2.80  $2,304║
║  Grand Total                  │               LF   $1.20   ↑ diff        ║
║  $ 1 2 4 , 8 0 0              │  (yellow cells = differs from AI)        ║
║                               │  Hover cell:  "AI: $1.00 → You: $1.20"  ║
╚══════════════════════════════════════════════════════════════════════════╝

  Yellow highlighted cell key:
  ┌──────────────────────────────────────────────────────────────────────┐
  │  Desc           Qty   Mat/Unit    Lab/Unit    Total                  │
  │  2×6 studs      480   ████$1.20   $2.80       $1,939                 │
  │                       ↑ yellow   ↑ yellow     ↑ yellow (derived)    │
  │                       AI: $1.00  AI: $2.40    AI: $1,632             │
  └──────────────────────────────────────────────────────────────────────┘
```

---

### Comments Panel

```
╔══════════════════════════════════════════════════════╗
║  COMMENTS                               2 unread     ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  [M]  Marco Vitela                      May 10       ║
║       Need 500 LF of blocking on the                 ║
║       east wall per RFI-04.                          ║
║       ╔═══════════════════╗                          ║
║       ║  [CHANGE REQUEST] ║                          ║
║       ╚═══════════════════╝                          ║
║                                                      ║
║                      Estimator · May 11     [E]      ║
║           Updated blocking. See trade 3,             ║
║           rows 44–46.                                ║
║                                                      ║
╠══════════════════════════════════════════════════════╣
║  [✓] Mark as change request                          ║
║  ┌──────────────────────────────────────┐            ║
║  │  Add a comment…                      │  [Send]    ║
║  └──────────────────────────────────────┘            ║
╚══════════════════════════════════════════════════════╝
```

---

## 12. Testing Checklist

### Unit / Integration

- [ ] `computeLaborRateImpact` returns correct `affectedCount` when some items have individual overrides
- [ ] `computeLaborRateImpact` returns `netDollarDelta = 0` when `proposedRate === aiBlendedRate`
- [ ] `useDiffView` returns empty map when `showDiff = false`
- [ ] `useDiffView` correctly identifies changed vs unchanged cells
- [ ] `useAutosave` does not fire before 2000 ms debounce elapses
- [ ] `useAutosave` fires immediately on `triggerSave()` (manual retry)
- [ ] `useAutosave` status = 'error' when any PATCH returns non-2xx
- [ ] `useAutosave` marks only successful items clean when some fail
- [ ] PATCH `/line-items/[id]` strips `dimension_type`, `source_sheet`, `source_grid`, `confidence` from body
- [ ] PATCH `/line-items/[id]` recomputes `total` server-side
- [ ] POST `/line-items` returns 201 with full row including generated `id`
- [ ] DELETE `/line-items/[id]` sets `is_deleted: true`, does not hard-delete
- [ ] POST `/comments` inserts row and returns 201; email fires non-blocking
- [ ] `NumericBottomSheet` does not allow two decimal points
- [ ] `LineItemCell` reverts on Escape without calling `onCommit`

### E2E (Playwright or manual)

- [ ] iOS Safari: tap a dollar value → bottom sheet slides up with decimal keyboard
- [ ] iOS Safari: swipe down on bottom sheet → closes
- [ ] iOS Safari: keyboard appears → bottom sheet is not hidden behind keyboard
- [ ] Desktop: click cell → inline edit → Tab moves to next field → Enter commits
- [ ] Desktop: Escape cancels without saving
- [ ] Edit a quantity → wait 2.5 s → header shows "Saving…" then "Saved · just now"
- [ ] Edit a quantity → immediately close tab → reopen → value persisted
- [ ] Change Overhead % → Grand Total updates in < 16 ms (no stutter)
- [ ] Add Row → "MANUAL" badge appears → fill in description + values → autosaves
- [ ] Soft delete → strike-through → confirm → row disappears → "Show deleted" toggle reveals it
- [ ] Toggle "Show changes" → yellow cells appear on modified values → tooltip on hover
- [ ] Changes summary panel counts match actual diff
- [ ] Labor override drawer: change rate → impact preview shows correct count and delta → Apply → badge appears
- [ ] Labor "Reset to AI default" → badge disappears
- [ ] Post a comment as Marco → estimator email notification sent
- [ ] Estimator replies → Marco email notification sent
- [ ] Change request checkbox → gold `[CHANGE REQUEST]` badge renders in thread

---

## 13. Pitfalls & Mitigation

### iOS Keyboard Pushing Content Up

**Problem:** `100vh` in CSS refers to the full viewport height including the keyboard overlay on iOS < 15, causing the bottom sheet to be partially hidden.

**Fix:**
1. Use `100dvh` (dynamic viewport height) for all fixed-height containers. `dvh` updates when the keyboard appears.
2. Add to `app/layout.tsx`:
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content" />
   ```
   `interactive-widget=resizes-content` tells the browser to resize the layout viewport when the OSK appears, so `dvh` behaves correctly.
3. The bottom sheet's `maxHeight` is expressed in `dvh` units (see BottomSheet spec above).
4. Add `padding-bottom: env(safe-area-inset-bottom)` to the bottom sheet's inner container so content is not hidden behind the iPhone home indicator.

### Zustand Batch Updates for 200+ Items

**Problem:** Calling `updateLineItemField` per keystroke on a table with 200+ visible rows can trigger hundreds of component re-renders if selectors are too broad.

**Fixes:**

1. **Fine-grained selectors:** Each `LineItemRow` selects only its own item from the map:
   ```typescript
   const item = useEstimateStore((s) => s.lineItems[id])
   ```
   Zustand's shallow equality check means other rows are not re-rendered.

2. **Batch updates with `setState` + `immer`:**
   ```typescript
   // Correct — single set call
   set((state) => {
     state.lineItems[id][field] = value
     state.lineItems[id].total  = ...
     state.dirtyItemIds.add(id)
   })
   
   // Wrong — two separate set calls trigger two renders
   set(...)
   set(...)
   ```

3. **Virtual scrolling:** If the full list of items across all trades exceeds ~150 visible rows, add `@tanstack/react-virtual` to the trade section tables. Only render items in the visible scroll window.

4. **`startTransition` for non-urgent updates:** Wrap the diff view recalculation (which scans all items) in `React.startTransition` so it doesn't block the keystrokes that triggered it.
   ```typescript
   startTransition(() => {
     // recompute diffCells
   })
   ```

5. **Avoid derived data in store:** `total`, `grandTotal`, and `diffCells` should be computed in hooks (`useMemo` / selector) not stored in Zustand state. Storing them means double-writing on every edit.

### Other Pitfalls

| Issue | Mitigation |
|---|---|
| Autosave fires on unmount (navigation away) | `useEffect` cleanup cancels timer; call `triggerSave` on `beforeunload` event |
| `Promise.allSettled` masks partial failures | Check each result individually; mark only succeeded IDs as clean |
| Two rapid edits to the same cell before save | Debounce captures the latest value; `dirtyItemIds` is a `Set` so no duplicates |
| `ai_baseline_snapshot` is null for manual rows | Diff view skips items where `ai_baseline_snapshot === null` |
| Supabase Realtime echoes our own comment back | Deduplicate by checking `c.id` before appending in the realtime handler |
| Labor override reset when `null` | Handle `null` in the PATCH route explicitly; Supabase `.update({ labor_rate_override: null })` sets the column to NULL correctly |
| `env(safe-area-inset-bottom)` on non-iOS | Returns `0` on non-iOS browsers; no negative effect |
| Inline edit Tab goes outside the trade table | Constrain Tab navigation to within the current trade section's cells only |
