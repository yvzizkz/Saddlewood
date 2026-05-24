'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useEstimateStore } from '@/store/estimateStore'
import type { LineItem } from '@/lib/estimates/types'

interface UseAutosaveOptions {
  estimateId: string | null
  /** Quiet-window length per item, in ms. Default 2000. */
  debounceMs?: number
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface UseAutosaveReturn {
  status: SaveStatus
  lastSavedAt: Date | null
  /** Bypass the per-item debounce and flush all currently-dirty items now. */
  triggerSave: () => void
}

// Snapshot of the fields PATCH cares about. Used both as the request body and
// as the comparison point for detecting mid-save edits.
interface EditableSnapshot {
  quantity: number
  material_unit_cost: number
  labor_unit_cost: number
  description: string
  area_location: string | null
}

function snapshotEditableFields(item: LineItem): EditableSnapshot {
  return {
    quantity: item.quantity,
    material_unit_cost: item.material_unit_cost,
    labor_unit_cost: item.labor_unit_cost,
    description: item.description,
    area_location: item.area_location,
  }
}

function snapshotsEqual(a: EditableSnapshot, b: EditableSnapshot): boolean {
  return (
    a.quantity === b.quantity &&
    a.material_unit_cost === b.material_unit_cost &&
    a.labor_unit_cost === b.labor_unit_cost &&
    a.description === b.description &&
    a.area_location === b.area_location
  )
}

/**
 * Pure flush — PATCH all supplied ids in parallel and report which were
 * cleanly saved vs. which failed or had mid-save edits. Exported so the
 * React-free behaviour is fully unit-testable.
 *
 * "Clean" means the PATCH succeeded AND the item's value at flush completion
 * still equals the snapshot we sent. Items edited mid-PATCH stay dirty.
 *
 * Temp-prefixed ids are silently skipped: they belong to optimistically-
 * added rows whose POST hasn't returned yet, so PATCHing them would 404.
 */
export async function flushDirty(opts: {
  estimateId: string
  ids: string[]
  /** Read the live store value for an id (called before AND after the PATCH). */
  getCurrentItem: (id: string) => LineItem | undefined
  fetchFn?: typeof fetch
}): Promise<{ cleanIds: string[]; failedIds: string[] }> {
  const fetchImpl = opts.fetchFn ?? fetch
  if (opts.ids.length === 0) {
    return { cleanIds: [], failedIds: [] }
  }

  // Snapshot before PATCH. Skip temp-prefixed ids — they don't exist
  // server-side yet, so they'd 404 and pin the status to 'error' for the
  // entire window of the optimistic add.
  const snapshots = new Map<string, EditableSnapshot>()
  for (const id of opts.ids) {
    if (id.startsWith('temp-')) continue
    const item = opts.getCurrentItem(id)
    if (item) snapshots.set(id, snapshotEditableFields(item))
  }
  const activeIds = Array.from(snapshots.keys())

  const results = await Promise.allSettled(
    activeIds.map((id) =>
      fetchImpl(`/api/estimates/${opts.estimateId}/line-items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshots.get(id)),
      }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
      })
    )
  )

  const cleanIds: string[] = []
  const failedIds: string[] = []
  for (let i = 0; i < activeIds.length; i++) {
    const id = activeIds[i]
    const result = results[i]
    if (result.status === 'rejected') {
      failedIds.push(id)
      continue
    }
    const snap = snapshots.get(id)
    const after = opts.getCurrentItem(id)
    if (snap && after && snapshotsEqual(snapshotEditableFields(after), snap)) {
      cleanIds.push(id)
    }
    // else: item changed during PATCH; leave dirty for next debounce cycle.
  }

  return { cleanIds, failedIds }
}

const IDLE_REVERT_MS = 5000

/**
 * Per-item debounced autosave. Each item gets its own timer that resets on
 * every edit, so a quick burst of edits across multiple items doesn't pile
 * up into one giant save burst — each item flushes 2s after its own last
 * keystroke.
 */
export function useAutosave({
  estimateId,
  debounceMs = 2000,
}: UseAutosaveOptions): UseAutosaveReturn {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)

  const dirtyItemIds = useEstimateStore((s) => s.dirtyItemIds)
  const lineItems = useEstimateStore((s) => s.lineItems)

  // Per-item timers — keyed by line item id.
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  )
  // Previous lineItem references for change detection. Immer gives stable
  // refs for unchanged items, so `current !== prev` is a reliable
  // "did this item just change" check.
  const prevLineItemsRef = useRef<Record<string, LineItem>>({})
  // Auto-revert "Saved" → "idle" after 5s of quiet.
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runFlush = useCallback(
    async (ids: string[]): Promise<void> => {
      if (!estimateId || ids.length === 0) return

      setStatus('saving')
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current)
        idleTimerRef.current = null
      }

      const { cleanIds, failedIds } = await flushDirty({
        estimateId,
        ids,
        getCurrentItem: (id) => useEstimateStore.getState().lineItems[id],
      })

      if (cleanIds.length > 0) {
        useEstimateStore.getState().markItemsClean(cleanIds)
      }

      if (failedIds.length > 0) {
        setStatus('error')
      } else {
        setLastSavedAt(new Date())
        setStatus('saved')
        idleTimerRef.current = setTimeout(() => {
          if (useEstimateStore.getState().dirtyItemIds.size === 0) {
            setStatus('idle')
          }
          idleTimerRef.current = null
        }, IDLE_REVERT_MS)
      }
    },
    [estimateId]
  )

  // Schedule / reschedule per-item timers as items change.
  // Temp-prefixed ids belong to optimistically-added rows whose POST hasn't
  // returned yet — PATCHing them would 404. They'll get picked up after
  // replaceLineItemId migrates the dirty membership to the real server id.
  useEffect(() => {
    for (const id of dirtyItemIds) {
      if (id.startsWith('temp-')) continue
      const current = lineItems[id]
      const prev = prevLineItemsRef.current[id]
      if (current && current !== prev) {
        const existing = timersRef.current.get(id)
        if (existing) clearTimeout(existing)
        const t = setTimeout(() => {
          timersRef.current.delete(id)
          void runFlush([id])
        }, debounceMs)
        timersRef.current.set(id, t)
      }
    }
    prevLineItemsRef.current = lineItems
  }, [lineItems, dirtyItemIds, debounceMs, runFlush])

  // Cleanup all timers on unmount.
  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const t of timers.values()) clearTimeout(t)
      timers.clear()
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
  }, [])

  const triggerSave = useCallback(() => {
    const ids = Array.from(useEstimateStore.getState().dirtyItemIds).filter(
      (id) => !id.startsWith('temp-')
    )
    for (const t of timersRef.current.values()) clearTimeout(t)
    timersRef.current.clear()
    if (ids.length > 0) void runFlush(ids)
  }, [runFlush])

  return { status, lastSavedAt, triggerSave }
}
