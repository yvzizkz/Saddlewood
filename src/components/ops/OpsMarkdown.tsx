import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Markdown renderer for the ops documents (SOPs, operating model, packets).
 *
 * Tables from the KB are 2 to 5 columns and mix one-letter keys with
 * paragraph-length cells. Two things keep them readable on a phone:
 *  - every table sits in its own horizontal scroll container, so the page
 *    never scrolls sideways and a wide table scrolls on its own;
 *  - each cell gets a minimum width from how much text it holds, so a
 *    column can never collapse to one character per line.
 */

type HastLike = { type?: string; value?: string; children?: HastLike[] }

function textOf(node: HastLike | undefined): string {
  if (!node) return ''
  if (node.type === 'text') return node.value ?? ''
  return (node.children ?? []).map(textOf).join('')
}

/** Size class by text length: none for keys like "A" or "#", then short / medium / long. */
function cellClass(len: number): string | undefined {
  if (len <= 3) return undefined
  if (len <= 40) return 'ops-cell-s'
  if (len <= 140) return 'ops-cell-m'
  return 'ops-cell-l'
}

const components: Components = {
  table: ({ node: _node, ...props }) => (
    <div className="ops-table-wrap">
      <table {...props} />
    </div>
  ),
  td: ({ node, className, ...props }) => {
    const size = cellClass(textOf(node as HastLike).trim().length)
    const cls = [className, size].filter(Boolean).join(' ') || undefined
    return <td className={cls} {...props} />
  },
}

export function OpsMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  )
}
