import ExcelJS from 'exceljs'

import { displayDesc, lineCalc, N, notesText, numLit, paidLabel, summary } from './core'
import type { TrackerState } from './types'

// The client-facing workbook: same rows, colours, and formulas as the hand-built
// Powell trackers (#3526-03 … #3526-08) and as build_tracker.py. Server-side only
// (ExcelJS is ~1 MB); the page never needs it.

const P = {
  DARK_NAVY: '1F3864',
  MED_BLUE: '2F5496',
  LIGHT_BLUE: 'BDD7EE',
  XLIGHT_BLUE: 'DEEAF1',
  LIGHT_GREEN: 'E2EFDA',
  MED_GREEN: '548235',
  AMBER: 'FFD966',
  LIGHT_ORANGE: 'FCE4D6',
  LIGHT_RED: 'FFE2E2',
  GRAY: 'D9D9D9',
  DARK_GRAY: '595959',
  WHITE: 'FFFFFF',
  DARK_RED: 'C00000',
  DARK_GREEN: '375623',
} as const

const CURRENCY = '$#,##0.00'
const PCT = '0.00%'

type FontOpts = { bold?: boolean; italic?: boolean; size?: number; color?: string; name?: string }

const argb = (h: string) => ({ argb: 'FF' + h })
const fill = (h: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: argb(h) })
function font(o: FontOpts): Partial<ExcelJS.Font> {
  const f: Partial<ExcelJS.Font> = {}
  if (o.bold) f.bold = true
  if (o.italic) f.italic = true
  if (o.size) f.size = o.size
  if (o.color) f.color = argb(o.color)
  if (o.name) f.name = o.name
  return f
}
const side = (s: ExcelJS.BorderStyle): Partial<ExcelJS.Border> => ({ style: s })
const THIN: Partial<ExcelJS.Borders> = { top: side('thin'), bottom: side('thin'), left: side('thin'), right: side('thin') }
const MEDIUM: Partial<ExcelJS.Borders> = { top: side('medium'), bottom: side('medium'), left: side('medium'), right: side('medium') }
function align(h: 'left' | 'center' | 'right', v: 'center', extra?: Partial<ExcelJS.Alignment>): Partial<ExcelJS.Alignment> {
  return { horizontal: h, vertical: v === 'center' ? 'middle' : v, ...(extra ?? {}) }
}

type CellSpec = {
  value?: ExcelJS.CellValue
  numFmt?: string
  font?: Partial<ExcelJS.Font>
  fill?: ExcelJS.Fill
  align?: Partial<ExcelJS.Alignment>
  border?: Partial<ExcelJS.Borders>
}

export function buildWorkbook(state: TrackerState): ExcelJS.Workbook {
  const proj = state.project
  const inv = state.invoice
  const payments = state.payments
  const lines = state.lines
  const calcs = lines.map(lineCalc)
  const s = summary(state, calcs)

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Progress Payments', { properties: { tabColor: argb(P.DARK_NAVY) } })
  const widths: Record<string, number> = { A: 44, B: 15, C: 17, D: 15, E: 12, F: 17, G: 16, H: 17 }
  for (const k of Object.keys(widths)) ws.getColumn(k).width = widths[k]

  const setRowH = (r: number, h: number) => {
    ws.getRow(r).height = h
  }
  const styleCell = (ref: string, o: CellSpec) => {
    const c = ws.getCell(ref)
    if ('value' in o) c.value = o.value ?? null
    if (o.numFmt) c.numFmt = o.numFmt
    if (o.font) c.font = o.font
    if (o.fill) c.fill = o.fill
    if (o.align) c.alignment = o.align
    if (o.border) c.border = o.border
    return c
  }
  // Every formula also carries its computed result, so previewers that do not
  // recalculate (iOS Mail, Gmail, Slack) still show the totals.
  const f = (formula: string, result?: number): ExcelJS.CellFormulaValue => ({ formula, ...(result === undefined ? {} : { result }), date1904: false })
  wb.calcProperties.fullCalcOnLoad = true

  setRowH(1, 42)
  ws.mergeCells('A1:H1')
  styleCell('A1', {
    value: proj.name.toUpperCase() + '   |   PROGRESS PAYMENT TRACKER',
    font: font({ bold: true, size: 18, color: P.WHITE, name: 'Calibri' }),
    fill: fill(P.DARK_NAVY),
    align: align('center', 'center'),
  })

  setRowH(2, 20)
  ws.mergeCells('A2:D2')
  styleCell('A2', {
    value: 'Contractor: ' + proj.contractor + '   |   Owners: ' + proj.owners + '   |   ' + proj.address,
    font: font({ size: 9, italic: true, color: P.DARK_NAVY }),
    fill: fill(P.XLIGHT_BLUE),
    align: align('left', 'center', { indent: 1 }),
  })
  ws.mergeCells('E2:F2')
  styleCell('E2', { value: 'Invoice #: ' + inv.number, font: font({ bold: true, size: 9, color: P.DARK_NAVY }), fill: fill(P.XLIGHT_BLUE), align: align('center', 'center') })
  ws.mergeCells('G2:H2')
  styleCell('G2', { value: 'Date: ' + inv.date, font: font({ bold: true, size: 9, color: P.DARK_NAVY }), fill: fill(P.XLIGHT_BLUE), align: align('center', 'center') })

  setRowH(3, 7)
  for (const c of 'ABCDEFGH') ws.getCell(c + '3').fill = fill(P.MED_BLUE)

  setRowH(4, 26)
  ws.mergeCells('A4:H4')
  styleCell('A4', { value: '  PAYMENT SUMMARY  (Cash Received to Date)', font: font({ bold: true, size: 12, color: P.WHITE }), fill: fill(P.MED_BLUE), align: align('left', 'center') })

  const PAY_START = 5
  const PAY_TOTAL_ROW = PAY_START + payments.length
  payments.forEach((p, i) => {
    const rn = PAY_START + i
    setRowH(rn, 22)
    ws.mergeCells(`A${rn}:E${rn}`)
    styleCell('A' + rn, { value: '  ' + p.label + '   —   ' + p.date, font: font({ size: 10, color: P.DARK_NAVY }), fill: fill(P.XLIGHT_BLUE), align: align('left', 'center'), border: THIN })
    ws.mergeCells(`F${rn}:H${rn}`)
    styleCell('F' + rn, { value: N(p.amount), numFmt: CURRENCY, font: font({ bold: true, size: 11, color: P.DARK_NAVY }), fill: fill(P.XLIGHT_BLUE), align: align('right', 'center'), border: THIN })
  })
  setRowH(PAY_TOTAL_ROW, 26)
  ws.mergeCells(`A${PAY_TOTAL_ROW}:E${PAY_TOTAL_ROW}`)
  styleCell('A' + PAY_TOTAL_ROW, { value: '  TOTAL PAID TO DATE', font: font({ bold: true, size: 12, color: P.WHITE }), fill: fill(P.MED_BLUE), align: align('left', 'center') })
  ws.mergeCells(`F${PAY_TOTAL_ROW}:H${PAY_TOTAL_ROW}`)
  styleCell('F' + PAY_TOTAL_ROW, {
    value: payments.length ? f(payments.map((_, i) => 'F' + (PAY_START + i)).join('+'), s.paid) : 0,
    numFmt: CURRENCY,
    font: font({ bold: true, size: 12, color: P.WHITE }),
    fill: fill(P.MED_BLUE),
    align: align('right', 'center'),
  })

  const STRIPE_ROW = PAY_TOTAL_ROW + 1
  setRowH(STRIPE_ROW, 7)
  for (const c of 'ABCDEFGH') ws.getCell(c + STRIPE_ROW).fill = fill(P.MED_BLUE)

  const HEADER_ROW = STRIPE_ROW + 1
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: HEADER_ROW - 2, topLeftCell: 'A' + (HEADER_ROW - 1), activeCell: 'A1' }]
  setRowH(HEADER_ROW, 44)
  const headers: [string, string][] = [
    ['A', 'DESCRIPTION OF WORK'],
    ['B', 'CONTRACT $\n(Original Quoted)'],
    ['C', 'CHANGE ORDERS\n(+ Increase / − Decrease)'],
    ['D', 'TOTAL $\n(Current Contract)'],
    ['E', '%\nCOMPLETE'],
    ['F', 'PREVIOUSLY PERFORMED\n(Prior to This Invoice)'],
    ['G', 'CURRENT $ DUE\n(This Invoice)'],
    ['H', 'TOTAL TO DATE\n(Performed + Draw)'],
  ]
  for (const [col, text] of headers) {
    styleCell(col + HEADER_ROW, { value: text, font: font({ bold: true, size: 9, color: P.WHITE }), fill: fill(P.DARK_NAVY), align: align('center', 'center', { wrapText: true }), border: THIN })
  }

  const START_ROW = HEADER_ROW + 1
  const END_DATA = START_ROW + lines.length - 1
  const TOTALS_ROW = END_DATA + 1
  const SUM_HEADER = TOTALS_ROW + 2
  const SUM_CONTRACT = SUM_HEADER + 1
  const SUM_PERFORMED = SUM_HEADER + 2
  const SUM_PAID = SUM_HEADER + 3
  const SUM_BAL = SUM_HEADER + 4
  const SUM_DRAW = SUM_HEADER + 5
  const SUM_DUE = SUM_HEADER + 6
  const SUM_PCT = SUM_HEADER + 7
  const SUM_REMAINING = SUM_HEADER + 8
  const BG = { complete: P.LIGHT_GREEN, partial: P.AMBER, tbd: P.GRAY, normal: P.WHITE } as const

  lines.forEach((line, i) => {
    const row = START_ROW + i
    const c = calcs[i]
    const rtype = c.status
    const bg = BG[rtype]
    setRowH(row, rtype === 'partial' ? 22 : 19)
    styleCell('A' + row, {
      value: displayDesc(line, c),
      font: font({ size: 10, bold: rtype === 'complete', color: rtype === 'complete' ? P.MED_GREEN : P.DARK_NAVY }),
      fill: fill(bg),
      align: align('left', 'center', { indent: 1 }),
      border: THIN,
    })
    styleCell('B' + row, { value: c.contract, numFmt: CURRENCY, font: font({ size: 10, color: P.DARK_NAVY }), fill: fill(bg), align: align('right', 'center'), border: THIN })
    const co = c.co
    styleCell('C' + row, {
      value: co,
      numFmt: CURRENCY,
      border: THIN,
      align: align('right', 'center'),
      fill: co > 0 ? fill(P.LIGHT_ORANGE) : co < 0 ? fill(P.XLIGHT_BLUE) : fill(bg),
      font: co > 0 ? font({ size: 10, bold: true, color: P.DARK_NAVY }) : co < 0 ? font({ size: 10, bold: true, color: P.DARK_RED }) : font({ size: 10, color: P.DARK_GRAY }),
    })
    styleCell('D' + row, { value: f(`B${row}+C${row}`, c.D), numFmt: CURRENCY, font: font({ size: 10, bold: true, color: P.DARK_NAVY }), fill: fill(bg), align: align('right', 'center'), border: THIN })
    const eVal: ExcelJS.CellValue = rtype === 'complete' ? 1 : rtype === 'partial' && c.D > 0 ? f(`${numLit(c.completed)}/D${row}`, c.pct) : 0
    const pct = c.pct
    const txt = pct >= 1 ? P.MED_GREEN : pct > 0 ? P.DARK_NAVY : P.DARK_GRAY
    styleCell('E' + row, { value: eVal, numFmt: PCT, font: font({ size: 10, bold: pct >= 1, color: txt }), fill: fill(bg), align: align('center', 'center'), border: THIN })
    styleCell('F' + row, {
      value: f(c.cp ? `D${row}*E${row}-${numLit(c.cp)}` : `D${row}*E${row}`, c.F),
      numFmt: CURRENCY,
      font: font({ size: 10, color: P.DARK_NAVY }),
      fill: fill(bg),
      align: align('right', 'center'),
      border: THIN,
    })
    const g = c.cp + c.draw
    styleCell('G' + row, {
      value: g,
      numFmt: CURRENCY,
      align: align('right', 'center'),
      border: THIN,
      fill: g > 0 ? fill(P.LIGHT_RED) : fill(bg),
      font: g > 0 ? font({ size: 10, bold: true, color: P.DARK_RED }) : font({ size: 10, color: P.DARK_GRAY }),
    })
    styleCell('H' + row, { value: f(`F${row}+G${row}`, c.H), numFmt: CURRENCY, font: font({ size: 10, color: P.DARK_NAVY }), fill: fill(bg), align: align('right', 'center'), border: THIN })
  })

  setRowH(TOTALS_ROW, 26)
  styleCell('A' + TOTALS_ROW, { value: 'PROJECT TOTALS', font: font({ bold: true, size: 11, color: P.WHITE }), fill: fill(P.DARK_NAVY), align: align('center', 'center'), border: MEDIUM })
  const totals: Record<string, string> = {
    B: `SUM(B${START_ROW}:B${END_DATA})`,
    C: `SUM(C${START_ROW}:C${END_DATA})`,
    D: `SUM(D${START_ROW}:D${END_DATA})`,
    E: '—',
    F: `SUM(F${START_ROW}:F${END_DATA})`,
    G: `SUM(G${START_ROW}:G${END_DATA})`,
    H: `SUM(H${START_ROW}:H${END_DATA})`,
  }
  const totalResults: Record<string, number> = {
    B: calcs.reduce((a, c) => a + c.contract, 0),
    C: s.sumCo,
    D: s.contract,
    F: calcs.reduce((a, c) => a + c.F, 0),
    G: s.sumG,
    H: calcs.reduce((a, c) => a + c.H, 0),
  }
  for (const col of Object.keys(totals)) {
    const dash = totals[col] === '—'
    styleCell(col + TOTALS_ROW, {
      value: dash ? '—' : f(totals[col], totalResults[col]),
      numFmt: dash ? 'General' : CURRENCY,
      font: font({ bold: true, size: 11, color: P.WHITE }),
      fill: fill(P.DARK_NAVY),
      align: align(dash ? 'center' : 'right', 'center'),
      border: MEDIUM,
    })
  }
  setRowH(TOTALS_ROW + 1, 12)

  setRowH(SUM_HEADER, 26)
  ws.mergeCells(`A${SUM_HEADER}:H${SUM_HEADER}`)
  styleCell('A' + SUM_HEADER, { value: '  FINANCIAL SUMMARY', font: font({ bold: true, size: 12, color: P.WHITE }), fill: fill(P.DARK_NAVY), align: align('left', 'center') })
  const balance = Math.round(s.balance * 100) / 100
  const due = Math.round(s.totalDue * 100) / 100
  const srows: [number, string, string, number, string, boolean, string, string][] = [
    [SUM_CONTRACT, 'Total Contract Value (All Current Pricing incl. Change Orders)', `SUM(D${START_ROW}:D${END_DATA})`, s.contract, P.XLIGHT_BLUE, false, P.DARK_NAVY, CURRENCY],
    [SUM_PERFORMED, 'Total Work Performed to Date  (Value Earned)', `SUMPRODUCT(D${START_ROW}:D${END_DATA},E${START_ROW}:E${END_DATA})`, s.performed, P.LIGHT_BLUE, false, P.DARK_NAVY, CURRENCY],
    [SUM_PAID, paidLabel(state), `F${PAY_TOTAL_ROW}`, s.paid, P.LIGHT_GREEN, true, P.DARK_NAVY, CURRENCY],
    [SUM_BAL, 'Balance Due on Completed Work  (Performed − Paid)', `ROUND(F${SUM_PERFORMED}-F${SUM_PAID},2)`, balance, P.XLIGHT_BLUE, false, P.DARK_NAVY, CURRENCY],
    [SUM_DRAW, 'New Advance Draws Requested — Next-Phase Mobilization', `F${SUM_DUE}-F${SUM_BAL}`, due - balance, P.LIGHT_ORANGE, false, P.DARK_NAVY, CURRENCY],
    [SUM_DUE, 'TOTAL DUE THIS INVOICE  (#' + inv.number + ')  =  Total to Date − Paid', `ROUND(SUM(H${START_ROW}:H${END_DATA})-F${SUM_PAID},2)`, due, P.AMBER, true, P.DARK_RED, CURRENCY],
    [SUM_PCT, 'Overall Project % Complete  (Performed ÷ Contract)', `F${SUM_PERFORMED}/F${SUM_CONTRACT}`, s.pct, P.LIGHT_GREEN, false, P.DARK_GREEN, PCT],
    [SUM_REMAINING, 'Total Remaining — Future Work Not Yet Started', `F${SUM_CONTRACT}-F${SUM_PERFORMED}`, s.remaining, P.XLIGHT_BLUE, false, P.DARK_NAVY, CURRENCY],
  ]
  for (const [r, label, formula, result, bg, boldV, txt, nf] of srows) {
    setRowH(r, 26)
    ws.mergeCells(`A${r}:E${r}`)
    styleCell('A' + r, { value: '  ' + label, font: font({ size: 10, bold: boldV, color: txt }), fill: fill(bg), align: align('left', 'center'), border: THIN })
    ws.mergeCells(`F${r}:H${r}`)
    styleCell('F' + r, { value: f(formula, result), numFmt: nf, font: font({ bold: true, size: boldV ? 13 : 12, color: txt }), fill: fill(bg), align: align('right', 'center'), border: THIN })
  }

  const legendRow = SUM_REMAINING + 2
  setRowH(legendRow - 1, 8)
  setRowH(legendRow, 20)
  ws.mergeCells(`A${legendRow}:H${legendRow}`)
  styleCell('A' + legendRow, {
    value:
      '  KEY:   [ Green ] = 100% Complete   [ Yellow ] = In Progress   [ Gray ] = TBD / Pricing Pending   [ Orange CO ] = Price Increase   [ Blue CO ] = Price Decrease / Savings   [ Red Current Due ] = Billed This Invoice',
    font: font({ size: 8, italic: true, color: P.DARK_GRAY }),
    fill: fill(P.GRAY),
    align: align('left', 'center'),
  })
  const notesRow = legendRow + 1
  setRowH(notesRow, 132)
  ws.mergeCells(`A${notesRow}:H${notesRow}`)
  styleCell('A' + notesRow, {
    value: notesText(state, calcs, s),
    font: font({ size: 8, italic: true, color: P.DARK_GRAY }),
    fill: fill(P.XLIGHT_BLUE),
    align: align('left', 'center', { wrapText: true }),
    border: THIN,
  })
  return wb
}

/** The workbook as bytes, ready to attach to an email or stream as a download. */
export async function workbookBuffer(state: TrackerState): Promise<Buffer> {
  const wb = buildWorkbook(state)
  const out = await wb.xlsx.writeBuffer()
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer)
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
