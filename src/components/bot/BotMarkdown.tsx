import { Fragment, type ReactNode } from 'react'

// Renders what the bot writes. It is held to a small format (bot/prompt.md in
// the KB repo): "## " headers, "- " bullets, "1." steps, **bold**, blank line
// between paragraphs, and at most a === DRAFT === block. Same rules as the
// email renderer in bot/poll.py (md_to_html), drawn as React nodes so nothing
// the bot quotes from an outside email can ever run as HTML.

const INLINE_RE = /(\*\*[^*\n]+\*\*)|(https?:\/\/[^\s<]+[^\s<.,)])|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let i = 0
  for (const m of text.matchAll(INLINE_RE)) {
    const at = m.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    if (m[1]) out.push(<strong key={i++}>{m[1].slice(2, -2)}</strong>)
    else if (m[2])
      out.push(
        <a key={i++} href={m[2]} target="_blank" rel="noopener noreferrer">
          {m[2].replace(/^https?:\/\//, '')}
        </a>,
      )
    else if (m[3]) out.push(<a key={i++} href={`mailto:${m[3]}`}>{m[3]}</a>)
    last = at + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

type ListBlock = { kind: 'ul'; items: string[] } | { kind: 'ol'; items: string[] }
type ParaBlock = { kind: 'p'; lines: string[] }
type Block = { kind: 'heading'; text: string } | ListBlock | ParaBlock | { kind: 'draft'; lines: string[] }

export function parseReply(md: string): Block[] {
  const blocks: Block[] = []
  let draft: string[] | null = null
  // The list or paragraph the next line may continue. A blank line, a header
  // or a draft marker ends it.
  let open: ListBlock | ParaBlock | null = null
  for (const raw of md.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.replace(/\s+$/, '')
    const t = line.trim()
    if (t === '=== DRAFT ===') {
      open = null
      draft = []
      continue
    }
    if (t === '=== END DRAFT ===' && draft) {
      blocks.push({ kind: 'draft', lines: draft })
      draft = null
      continue
    }
    if (draft) {
      draft.push(line)
      continue
    }
    if (!t) {
      open = null
      continue
    }
    const heading = /^#{1,4}\s+(.*)$/.exec(t)
    if (heading) {
      open = null
      blocks.push({ kind: 'heading', text: heading[1] })
      continue
    }
    const bullet = /^[-*•]\s+(.*)$/.exec(t)
    const step = /^\d+[.)]\s+(.*)$/.exec(t)
    if (bullet || step) {
      const kind = bullet ? 'ul' : 'ol'
      const text = (bullet ?? step)![1]
      if (open && open.kind === kind) open.items.push(text)
      else {
        const list: ListBlock = { kind, items: [text] }
        blocks.push(list)
        open = list
      }
      continue
    }
    if (open && open.kind === 'p') open.lines.push(t)
    else {
      const para: ParaBlock = { kind: 'p', lines: [t] }
      blocks.push(para)
      open = para
    }
  }
  // A draft the bot never closed is still a draft: show it as one.
  if (draft) blocks.push({ kind: 'draft', lines: draft })
  return blocks
}

export function draftHeader(lines: string[]): { to: string; subject: string; body: string } {
  let to = ''
  let subject = ''
  let start = 0
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (/^to:/i.test(l)) to = l.slice(3).trim()
    else if (/^subject:/i.test(l)) subject = l.slice(8).trim()
    else if (!l.trim() && to && subject) {
      start = i + 1
      break
    }
  }
  return { to, subject, body: lines.slice(start).join('\n').trim() }
}

export default function BotMarkdown({ text, draftFooter }: { text: string; draftFooter?: ReactNode }) {
  const blocks = parseReply(text)
  return (
    <div className="bot-reply">
      {blocks.map((b, i) => {
        if (b.kind === 'heading') {
          return (
            <p key={i} role="heading" aria-level={3} className="bot-reply-heading">
              {inline(b.text)}
            </p>
          )
        }
        if (b.kind === 'ul') {
          return (
            <ul key={i}>
              {b.items.map((it, j) => (
                <li key={j}>{inline(it)}</li>
              ))}
            </ul>
          )
        }
        if (b.kind === 'ol') {
          return (
            <ol key={i}>
              {b.items.map((it, j) => (
                <li key={j}>{inline(it)}</li>
              ))}
            </ol>
          )
        }
        if (b.kind === 'draft') {
          const d = draftHeader(b.lines)
          return (
            <div
              key={i}
              className="my-3 rounded-xl border border-[var(--color-stone-mid)] border-l-4 bg-[var(--color-cream)]/60 p-3"
              style={{ borderLeftColor: 'var(--color-gold-accessible)' }}
            >
              <p className="text-[10.5px] font-mono font-medium tracking-[0.12em] uppercase mb-2" style={{ color: 'var(--color-gold-accessible)' }}>
                Draft · nothing has been sent
              </p>
              {d.to ? (
                <p className="text-[13px] m-0">
                  <span className="text-[var(--color-charcoal-light)]">To </span>
                  {d.to}
                </p>
              ) : null}
              {d.subject ? <p className="text-[13px] font-semibold m-0 mt-0.5">{d.subject}</p> : null}
              <p className="mt-2 mb-0 whitespace-pre-wrap text-[14px] leading-relaxed">{d.body || b.lines.join('\n')}</p>
              {draftFooter ? <div className="mt-3">{draftFooter}</div> : null}
            </div>
          )
        }
        return (
          <p key={i}>
            {b.lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 ? <br /> : null}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}
