'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { ArrowUp, FileText, Loader2, Paperclip, X } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { botApi, useBot } from './BotProvider'
import BotMarkdown from './BotMarkdown'
import DraftSheet from './DraftSheet'
import { Button } from './ui'
import {
  MAX_ATTACHMENTS,
  MAX_UPLOAD_BYTES,
  MESSAGE_MAX_CHARS,
  UPLOAD_TYPES,
  type BotFileRef,
  type BotMessage,
} from '@/lib/bot/types'
import { dayTime, elapsed, firstName } from '@/lib/bot/view'

// Delegation, in the shape people already use with the bot: say what you
// need, attach a photo if it helps, and the answer comes back here. The same
// agent, rules and memory as a text or an email to the bot. Short commands
// ("drafts", "approve 4", "payments") are answered in seconds.

const STARTERS = [
  'What is waiting on me?',
  'Which bid invites have we not answered?',
  'Who owes us money right now?',
  'open drafts',
]

const TYPE_BY_EXT: Record<string, (typeof UPLOAD_TYPES)[number]> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heif',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

function uploadType(file: File): (typeof UPLOAD_TYPES)[number] | null {
  const known = (UPLOAD_TYPES as readonly string[]).includes(file.type) ? (file.type as (typeof UPLOAD_TYPES)[number]) : null
  return known ?? TYPE_BY_EXT[file.name.split('.').pop()?.toLowerCase() ?? ''] ?? null
}

function FileChip({ file }: { file: BotFileRef }) {
  return (
    <a
      href={`/api/bot/files?path=${encodeURIComponent(file.path)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[var(--color-stone-mid)] bg-white px-2.5 py-1.5 text-[13px] text-[var(--color-charcoal)]"
    >
      <FileText className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{file.name}</span>
    </a>
  )
}

/** How much of the bottom of the screen the on-screen keyboard covers (iOS). */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const measure = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)))
    vv.addEventListener('resize', measure)
    vv.addEventListener('scroll', measure)
    return () => {
      vv.removeEventListener('resize', measure)
      vv.removeEventListener('scroll', measure)
    }
  }, [])
  return inset
}

export default function AskScreen() {
  const { home, toast, refresh } = useBot()
  const [messages, setMessages] = useState<BotMessage[] | null>(null)
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [openDraft, setOpenDraft] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const scroller = useRef<HTMLDivElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const stick = useRef(true)
  const newestReply = useRef<number | null>(null)
  const keyboard = useKeyboardInset()

  const load = useCallback(async () => {
    try {
      const res = await botApi<{ messages: BotMessage[] }>('/api/bot/messages')
      setMessages(res.messages)
      // A new answer may carry a draft: bring Home (and its drafts) up to date
      // now, so the "Review draft" button under it works right away.
      const newest = res.messages.reduce((max, m) => (m.role === 'user' ? max : Math.max(max, m.id)), 0)
      if (newestReply.current !== null && newest > newestReply.current) void refresh()
      newestReply.current = newest
    } catch {
      // Home already reports a lost connection; keep what is on screen.
    }
  }, [refresh])

  const waiting = !!messages?.some((m) => m.role === 'user' && (m.status === 'queued' || m.status === 'working'))

  useEffect(() => {
    let timer: number | undefined
    let stopped = false
    async function tick() {
      if (stopped) return
      if (document.visibilityState === 'visible') {
        await load()
        setNow(Date.now())
      }
      if (!stopped) timer = window.setTimeout(tick, waiting ? 4000 : 15000)
    }
    void tick()
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        window.clearTimeout(timer)
        void tick()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load, waiting])

  // Stay pinned to the newest message unless the person scrolled up to read.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [messages, keyboard])

  // Grow the box with the message (CSS field-sizing does it where supported).
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [text])

  function onScroll() {
    const el = scroller.current
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  function pick(e: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files ?? [])
    e.target.value = ''
    const next = [...files]
    for (const f of chosen) {
      if (next.length >= MAX_ATTACHMENTS) {
        toast(`Up to ${MAX_ATTACHMENTS} files per message.`, 'bad')
        break
      }
      if (!uploadType(f)) toast(`${f.name}: photos, PDFs, spreadsheets and Word files only.`, 'bad')
      else if (f.size > MAX_UPLOAD_BYTES) toast(`${f.name} is over 15 MB.`, 'bad')
      else next.push(f)
    }
    setFiles(next)
  }

  async function send(body: string, attach: File[]) {
    const clean = body.trim()
    if ((!clean && !attach.length) || sending) return
    setSending(true)
    try {
      const refs: BotFileRef[] = []
      if (attach.length) {
        const supabase = createClient()
        for (const f of attach) {
          const type = uploadType(f)
          if (!type) continue
          const slot = await botApi<{ bucket: string; path: string; token: string; file: BotFileRef }>('/api/bot/uploads', {
            method: 'POST',
            body: JSON.stringify({ name: f.name, type, size: f.size }),
          })
          const { error } = await supabase.storage.from(slot.bucket).uploadToSignedUrl(slot.path, slot.token, f, { contentType: type })
          if (error) throw new Error(`${f.name} did not upload: ${error.message}`)
          refs.push(slot.file)
        }
      }
      const res = await botApi<{ message: BotMessage }>('/api/bot/messages', {
        method: 'POST',
        body: JSON.stringify({ body: clean, attachments: refs }),
      })
      stick.current = true
      setMessages((ms) => [...(ms ?? []), res.message])
      setText('')
      setFiles([])
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setSending(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void send(text, files)
  }

  const online = !!home?.bridge.online
  const seat = home ? !!home.me.role : true
  const draft = home?.sections.drafts.find((d) => d.n === openDraft) ?? null
  const keyboardUp = keyboard > 140

  return (
    <div
      className="fixed inset-x-0 mx-auto flex max-w-xl flex-col"
      style={{
        top: 'calc(53px + env(safe-area-inset-top, 0px))',
        bottom: keyboardUp ? keyboard : 'calc(56px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div ref={scroller} onScroll={onScroll} className="bot-thread flex-1 overflow-y-auto px-4 pt-4 pb-2">
        {messages === null ? (
          <div className="flex justify-center pt-10 text-[var(--color-charcoal-light)]">
            <Loader2 className="size-5 animate-spin" aria-label="Loading" />
          </div>
        ) : messages.length === 0 ? (
          <div className="pt-6">
            <p className="text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)', fontSize: '1.5rem', lineHeight: 1.2 }}>
              What do you need{home?.me.name ? `, ${firstName(home.me.name)}` : ''}?
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-charcoal-light)]">
              Ask the way you would text it. It looks things up, drafts the email, builds the waiver, logs the receipt.
              Anything going outside the company comes back as a draft for your OK first.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={sending || !seat}
                  onClick={() => void send(s, [])}
                  className="min-h-11 rounded-xl border border-[var(--color-stone-mid)] bg-white px-4 py-2.5 text-left text-[15px] text-[var(--color-charcoal)] active:bg-[var(--color-cream)] disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="flex flex-col gap-3">
            {messages.map((m) => {
              if (m.role === 'user') {
                return (
                  <li key={m.id} className="flex flex-col items-end">
                    <div className="max-w-[86%] rounded-2xl rounded-br-md bg-[var(--color-teal)] px-3.5 py-2.5 text-[15px] leading-relaxed text-white">
                      {m.body ? <p className="whitespace-pre-wrap break-words">{m.body}</p> : null}
                      {m.attachments.length ? (
                        <div className={`flex flex-wrap gap-1.5 ${m.body ? 'mt-2' : ''}`}>
                          {m.attachments.map((f) => (
                            <FileChip key={f.path} file={f} />
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--color-charcoal-light)]">
                      {m.status === 'queued'
                        ? online
                          ? 'Sent · the bot picks it up within a minute'
                          : 'Sent · waiting for the bot to come back online'
                        : m.status === 'working'
                          ? `Working on it · ${elapsed(m.claimedAt ?? m.createdAt, now)}`
                          : m.status === 'failed'
                            ? 'Did not go through'
                            : dayTime(m.createdAt)}
                    </p>
                  </li>
                )
              }
              if (m.role === 'system') {
                return (
                  <li key={m.id} className="mx-auto max-w-[90%] rounded-xl bg-[var(--color-cream)] px-3 py-2 text-center text-[13px] text-[var(--color-charcoal)]">
                    {m.body}
                  </li>
                )
              }
              const n = typeof m.meta.draftN === 'number' ? m.meta.draftN : null
              const stillOpen = n !== null && !!home?.sections.drafts.some((d) => d.n === n)
              return (
                <li key={m.id} className="flex flex-col items-start">
                  <div className="max-w-[94%] rounded-2xl rounded-bl-md border border-[var(--color-stone)] bg-white px-3.5 py-3">
                    <BotMarkdown
                      text={m.body}
                      draftFooter={
                        n === null ? null : stillOpen ? (
                          <Button variant="primary" full onClick={() => setOpenDraft(n)}>
                            Review draft #{n}
                          </Button>
                        ) : now - Date.parse(m.createdAt) < 3 * 60_000 ? (
                          <p className="text-xs text-[var(--color-charcoal-light)]">Getting draft #{n} ready to approve…</p>
                        ) : (
                          <p className="text-xs text-[var(--color-charcoal-light)]">Draft #{n} is closed: sent or cancelled.</p>
                        )
                      }
                    />
                    {m.attachments.length ? (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {m.attachments.map((f) => (
                          <FileChip key={f.path} file={f} />
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--color-charcoal-light)]">
                    SaddleWoodBot · {dayTime(m.createdAt)}
                    {typeof m.meta.duty === 'string' ? ` · duty: ${m.meta.duty}` : ''}
                  </p>
                </li>
              )
            })}
          </ol>
        )}
      </div>

      <form onSubmit={onSubmit} className="border-t border-[var(--color-stone)] bg-[var(--color-background)] px-3 pt-2 pb-2">
        {files.length ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <span key={`${f.name}-${i}`} className="inline-flex max-w-full items-center gap-1 rounded-lg border border-[var(--color-stone-mid)] bg-white py-1 pl-2.5 pr-1 text-[13px]">
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))}
                  className="flex size-7 items-center justify-center rounded-full text-[var(--color-charcoal-light)] active:bg-[var(--color-stone)]"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <input
            ref={picker}
            type="file"
            multiple
            hidden
            accept="image/*,application/pdf,.csv,.txt,.xlsx,.docx"
            onChange={pick}
          />
          <button
            type="button"
            aria-label="Attach a photo or file"
            disabled={sending || !seat}
            onClick={() => picker.current?.click()}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--color-charcoal)] active:bg-[var(--color-stone)] disabled:opacity-50"
          >
            <Paperclip className="size-5" aria-hidden="true" />
          </button>
          <textarea
            ref={box}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends from a real keyboard; on a phone Enter is a new line.
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) {
                e.preventDefault()
                void send(text, files)
              }
            }}
            rows={1}
            maxLength={MESSAGE_MAX_CHARS}
            placeholder={seat ? 'Ask or hand something off' : 'Ask Lando for a seat first'}
            disabled={!seat}
            aria-label="Message to the bot"
            className="max-h-36 min-h-11 flex-1 resize-none rounded-2xl border border-[var(--color-stone-mid)] bg-white px-3.5 py-2.5 text-base leading-snug text-[var(--color-charcoal)] placeholder:text-[#9a938a] focus:border-[var(--color-teal)] focus:outline-none"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={sending || !seat || (!text.trim() && !files.length)}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-teal)] text-white disabled:opacity-40"
          >
            {sending ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <ArrowUp className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </form>

      <DraftSheet key={`draft-${draft?.n ?? 'none'}`} draft={draft} onClose={() => setOpenDraft(null)} />
    </div>
  )
}
