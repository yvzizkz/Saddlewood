'use client'

import { useRef, useState } from 'react'
import type { EditableLineItemField } from '@/lib/estimates/types'

interface LineItemCellProps {
  field: EditableLineItemField
  value: string | number | null
  type: 'number' | 'text'
  /** Yellow highlight for overridden cells (from diff view in a later slice). */
  isHighlighted?: boolean
  /** AI baseline value shown as the hover tooltip when overridden. */
  aiValue?: string | number | null
  onCommit: (field: EditableLineItemField, value: string | number) => void
  /** Called after a successful commit. Parent can use this to advance focus. */
  onAfterCommit?: (direction: 'next' | 'prev') => void
  /** Display formatter for read mode. Defaults to String(value ?? ''). */
  format?: (v: string | number | null) => string
  className?: string
  ariaLabel?: string
}

// Convert the editor's string draft to the committed value. Exported for tests.
export function coerceCellValue(
  type: 'number' | 'text',
  draft: string,
  fallback: number | string
): number | string {
  if (type === 'text') return draft
  const n = parseFloat(draft)
  if (!Number.isFinite(n)) {
    return typeof fallback === 'number' ? fallback : 0
  }
  return n
}

/**
 * Desktop inline-edit cell. Click (or Enter/Space on the display span) →
 * input appears with the current value selected. Tab/Enter commit and
 * notify the parent to advance focus; Escape reverts.
 */
export function LineItemCell({
  field,
  value,
  type,
  isHighlighted = false,
  aiValue,
  onCommit,
  onAfterCommit,
  format,
  className,
  ariaLabel,
}: LineItemCellProps) {
  const [editing, setEditing] = useState<boolean>(false)
  const [draft, setDraft] = useState<string>('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Lock the value we entered the editor with so Escape can revert without
  // re-rendering the original from props (which may have changed mid-edit).
  const enteredFromRef = useRef<string | number | null>(value)

  function enter() {
    enteredFromRef.current = value
    setDraft(value === null || value === undefined ? '' : String(value))
    setEditing(true)
    // Select-all on next tick (input not yet mounted at click time).
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function commit(direction: 'next' | 'prev' | null = null) {
    const fallback = enteredFromRef.current ?? (type === 'number' ? 0 : '')
    const coerced = coerceCellValue(type, draft, fallback)
    onCommit(field, coerced)
    setEditing(false)
    if (direction) onAfterCommit?.(direction)
  }

  function cancel() {
    setDraft('')
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        type="text"
        inputMode={type === 'number' ? 'decimal' : 'text'}
        aria-label={ariaLabel ?? field}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(null)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit('next')
          } else if (e.key === 'Tab') {
            e.preventDefault()
            commit(e.shiftKey ? 'prev' : 'next')
          } else if (e.key === 'Escape') {
            e.preventDefault()
            cancel()
          }
        }}
        className={[
          'w-full px-2 py-1 border-2 border-[var(--color-teal)] rounded text-sm focus:outline-none',
          isHighlighted ? 'bg-yellow-100' : 'bg-white',
          className ?? '',
        ].join(' ')}
      />
    )
  }

  const display = format ? format(value) : value === null || value === undefined ? '' : String(value)

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={ariaLabel ?? `Edit ${field}`}
      title={
        isHighlighted && aiValue !== undefined && aiValue !== null
          ? `AI: ${aiValue} → You: ${display}`
          : undefined
      }
      onClick={enter}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          enter()
        }
      }}
      className={[
        'block w-full px-2 py-1 rounded cursor-pointer text-sm',
        'hover:bg-[var(--color-teal)]/10 focus:outline-none focus:ring-1 focus:ring-[var(--color-teal)]',
        isHighlighted ? 'bg-yellow-100' : '',
        className ?? '',
      ].join(' ')}
    >
      {display || <span className="text-[var(--color-charcoal-light)]">—</span>}
    </span>
  )
}
