import path from 'node:path'

import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'

import { normalizeState } from '../core'
import { buildWorkbook, workbookBuffer } from '../workbook'
import state08 from './fixtures/powell-3526-08.state.json'
import state09 from './fixtures/powell-3526-09.state.json'

// The workbook must come out identical to build_tracker.py (the Python builder
// in the Powell Progress folder), which itself reproduces the hand-built
// trackers the Powells have received. The fixtures are Python outputs for the
// same two states; every cell is compared for value/formula, number format,
// font, fill, alignment, border, plus merges, widths, heights, and the freeze.

const FIX = path.join(__dirname, 'fixtures')

type Sig = Record<string, unknown>

function rgb6(c: Partial<ExcelJS.Color> | undefined): string | null {
  const v = c?.argb
  return typeof v === 'string' ? v.slice(-6).toUpperCase() : null
}

function cellSig(cell: ExcelJS.Cell): Sig {
  const v = cell.value as ExcelJS.CellValue
  let value: unknown = v
  if (v && typeof v === 'object' && 'formula' in v) value = 'F:' + String((v as ExcelJS.CellFormulaValue).formula).replace(/\s/g, '')
  else if (v && typeof v === 'object' && 'richText' in v) value = (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join('')
  else if (typeof v === 'number' && Number.isInteger(v)) value = v
  const fill = cell.fill as ExcelJS.FillPattern | undefined
  const a = cell.alignment ?? {}
  const b = cell.border ?? {}
  return {
    value: value ?? null,
    numFmt: cell.numFmt ?? 'General',
    bold: !!cell.font?.bold,
    italic: !!cell.font?.italic,
    size: cell.font?.size ?? null,
    color: rgb6(cell.font?.color),
    fill: fill && fill.type === 'pattern' && fill.pattern === 'solid' ? rgb6(fill.fgColor) : null,
    h: a.horizontal ?? null,
    v: a.vertical ?? null,
    wrap: !!a.wrapText,
    indent: a.indent ?? 0,
    border: ['top', 'bottom', 'left', 'right'].map((k) => (b as Record<string, Partial<ExcelJS.Border> | undefined>)[k]?.style ?? null),
  }
}

function sheetSig(ws: ExcelJS.Worksheet): { cells: Record<string, Sig>; merges: string[]; widths: number[]; heights: Record<number, number>; ySplit: number | undefined } {
  const cells: Record<string, Sig> = {}
  const maxRow = ws.rowCount
  for (let r = 1; r <= maxRow; r++) {
    for (const col of 'ABCDEFGH') {
      const cell = ws.getCell(`${col}${r}`)
      if (cell.type === ExcelJS.ValueType.Merge) continue
      const empty = (cell.value === null || cell.value === undefined) && !cell.fill
      if (empty) continue
      cells[`${col}${r}`] = cellSig(cell)
    }
  }
  const heights: Record<number, number> = {}
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    if (row.height) heights[n] = row.height
  })
  const merges = ((ws as unknown as { model: { merges: string[] } }).model.merges ?? []).slice().sort()
  const widths = 'ABCDEFGH'.split('').map((c) => Number(ws.getColumn(c).width))
  const views = ws.views as ExcelJS.WorksheetViewFrozen[]
  return { cells, merges, widths, heights, ySplit: views?.[0]?.ySplit }
}

async function readPython(name: string): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path.join(FIX, name))
  return wb.getWorksheet(1)!
}

async function roundTrip(wb: ExcelJS.Workbook): Promise<ExcelJS.Worksheet> {
  // Write and read back so both sides go through the same xlsx reader.
  const buf = await wb.xlsx.writeBuffer()
  const wb2 = new ExcelJS.Workbook()
  await wb2.xlsx.load(buf as ArrayBuffer)
  return wb2.getWorksheet(1)!
}

describe('workbook parity with build_tracker.py', () => {
  for (const [label, state, file] of [
    ['#3526-08 (the invoice the Powells paid)', state08, 'powell-3526-08.python.xlsx'],
    ['#3526-09 (current)', state09, 'powell-3526-09.python.xlsx'],
  ] as const) {
    it(label, async () => {
      const ours = sheetSig(await roundTrip(buildWorkbook(normalizeState(state))))
      const theirs = sheetSig(await readPython(file))
      expect(ours.widths).toEqual(theirs.widths)
      expect(ours.merges).toEqual(theirs.merges)
      expect(ours.ySplit).toEqual(theirs.ySplit)
      expect(ours.heights).toEqual(theirs.heights)
      const refs = Array.from(new Set([...Object.keys(ours.cells), ...Object.keys(theirs.cells)])).sort()
      const diffs: string[] = []
      for (const ref of refs) {
        const a = JSON.stringify(ours.cells[ref] ?? null)
        const b = JSON.stringify(theirs.cells[ref] ?? null)
        if (a !== b) diffs.push(`${ref}: ours=${a} python=${b}`)
      }
      expect(diffs).toEqual([])
    })
  }

  it('produces a non-trivial xlsx buffer with the sheet name Marco expects', async () => {
    const buf = await workbookBuffer(normalizeState(state09))
    expect(buf.length).toBeGreaterThan(5000)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    expect(wb.worksheets[0].name).toBe('Progress Payments')
    expect(wb.worksheets[0].getCell('E2').value).toBe('Invoice #: 3526-09')
  })
})
