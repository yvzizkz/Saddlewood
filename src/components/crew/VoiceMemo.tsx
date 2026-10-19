'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Mic, RotateCcw, Square, X } from 'lucide-react'

import type { BotFileRef } from '@/lib/bot/types'
import { MEMO_MAX_SECONDS } from '@/lib/crew/types'
import { uploadAudio, useCrew } from './CrewProvider'

// A voice memo for the end-of-day check-in, for a worker who would rather
// talk than type (Marco, 10/16). Recorded on the phone with MediaRecorder,
// uploaded the moment they stop, and sent with the form as an audio file.
// The Mac transcribes it afterwards (bot/crew.py), so it reaches the brief
// and the next day's plan like a typed answer.

/** An iPhone records AAC in MP4; Chrome and Android record Opus in WebM. */
const MIME_CHOICES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/mpeg']

const EXT: Record<string, string> = { 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' }

export function memoSupported(): boolean {
  return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

function pickMime(): string {
  for (const m of MIME_CHOICES) if (MediaRecorder.isTypeSupported(m)) return m
  return ''
}

export type MemoPhase = 'idle' | 'recording' | 'uploading' | 'ready' | 'failed' | 'denied'

export function useVoiceMemo() {
  const { t, toast } = useCrew()
  // The sheet is mounted on a tap, never on the server, so this runs in the browser.
  const [supported] = useState(() => memoSupported())
  const [phase, setPhase] = useState<MemoPhase>('idle')
  const [seconds, setSeconds] = useState(0)
  const [ref, setRef] = useState<BotFileRef | null>(null)
  const [preview, setPreview] = useState('')
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const timer = useRef<number | null>(null)
  const startedAt = useRef(0)
  const previewUrl = useRef('')

  const release = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current)
    timer.current = null
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
    recorder.current = null
  }, [])

  // Closing the sheet mid-recording lets go of the microphone.
  useEffect(
    () => () => {
      release()
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    },
    [release],
  )

  const setPreviewUrl = useCallback((url: string) => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    previewUrl.current = url
    setPreview(url)
  }, [])

  const stop = useCallback(() => {
    const r = recorder.current
    if (r && r.state !== 'inactive') r.stop()
  }, [])

  const start = useCallback(async () => {
    if (!memoSupported()) return
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.current = media
      const mime = pickMime()
      const r = mime ? new MediaRecorder(media, { mimeType: mime }) : new MediaRecorder(media)
      chunks.current = []
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data)
      }
      r.onstop = async () => {
        const took = Math.min(MEMO_MAX_SECONDS, Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)))
        const type = (r.mimeType || mime || 'audio/webm').split(';')[0].trim()
        const blob = new Blob(chunks.current, { type })
        release()
        if (!blob.size) return setPhase('failed')
        setSeconds(took)
        setPreviewUrl(URL.createObjectURL(blob))
        setPhase('uploading')
        try {
          const uploaded = await uploadAudio(blob, type, `memo-${new Date().toISOString().slice(0, 10)}.${EXT[type] ?? 'webm'}`)
          setRef(uploaded)
          setPhase('ready')
        } catch {
          setRef(null)
          setPhase('failed')
          toast(t.eodMemoFailed, 'bad')
        }
      }
      startedAt.current = Date.now()
      setSeconds(0)
      setRef(null)
      setPhase('recording')
      recorder.current = r
      r.start(1000)
      timer.current = window.setInterval(() => {
        const s = Math.round((Date.now() - startedAt.current) / 1000)
        setSeconds(Math.min(s, MEMO_MAX_SECONDS))
        if (s >= MEMO_MAX_SECONDS) stop()
      }, 500)
    } catch (e) {
      release()
      setPhase((e as DOMException | undefined)?.name === 'NotAllowedError' ? 'denied' : 'failed')
    }
  }, [release, setPreviewUrl, stop, t, toast])

  const discard = useCallback(() => {
    release()
    setRef(null)
    setSeconds(0)
    setPhase('idle')
    setPreviewUrl('')
  }, [release, setPreviewUrl])

  return {
    supported,
    phase,
    seconds,
    /** The uploaded memo, to send with the form. */
    ref,
    preview,
    start,
    stop,
    discard,
    /** Recording or uploading: the form's Send waits for this. */
    busy: phase === 'recording' || phase === 'uploading',
  }
}

export type VoiceMemo = ReturnType<typeof useVoiceMemo>

export function clockOf(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** The recording panel: the prompt, one big button, the time, and the way back to the form. */
export function VoiceMemoPanel({ memo, onUseForm }: { memo: VoiceMemo; onUseForm: () => void }) {
  const { t } = useCrew()
  const status =
    memo.phase === 'recording'
      ? `${t.eodRecording} ${clockOf(memo.seconds)}`
      : memo.phase === 'uploading'
        ? t.uploading
        : memo.phase === 'ready'
          ? `${t.eodMemoReady} · ${clockOf(memo.seconds)}`
          : memo.phase === 'denied'
            ? t.eodMicDenied
            : memo.phase === 'failed'
              ? t.eodMemoFailed
              : t.eodRecord
  const big = 'flex size-24 items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95'
  return (
    <div className="rounded-2xl border border-[var(--color-stone)] bg-white px-4 py-4">
      <p className="text-[15px] leading-relaxed text-[var(--color-charcoal)]">{t.eodMemoPrompt}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-charcoal-light)]">{t.eodMemoMax}</p>
      <div className="mt-4 flex flex-col items-center gap-3">
        {memo.phase === 'recording' ? (
          <button type="button" onClick={memo.stop} aria-label={t.eodStop} className={`${big} bg-[#9a2a1f]`}>
            <Square className="size-9" fill="currentColor" aria-hidden="true" />
          </button>
        ) : memo.phase === 'uploading' ? (
          <span className={`${big} bg-[var(--color-stone-mid)]`} role="status" aria-label={t.uploading}>
            <Loader2 className="size-9 animate-spin" aria-hidden="true" />
          </span>
        ) : (
          <button
            type="button"
            onClick={() => void memo.start()}
            aria-label={memo.phase === 'ready' ? t.eodRecordAgain : t.eodRecord}
            className={`${big} bg-[var(--color-teal)]`}
          >
            {memo.phase === 'ready' ? <RotateCcw className="size-9" aria-hidden="true" /> : <Mic className="size-10" aria-hidden="true" />}
          </button>
        )}
        <p
          className="text-center text-sm font-medium tabular-nums text-[var(--color-charcoal)]"
          style={{ color: memo.phase === 'denied' || memo.phase === 'failed' ? '#7f1d1d' : undefined }}
          aria-live="polite"
        >
          {status}
        </p>
        {memo.phase === 'ready' && memo.preview ? <audio controls preload="metadata" src={memo.preview} className="w-full" /> : null}
      </div>
      <button type="button" onClick={onUseForm} className="mt-4 min-h-11 w-full text-center text-sm font-medium text-[var(--color-teal)]">
        {t.eodUseForm}
      </button>
    </div>
  )
}

/** A recorded memo, shown above the typed form when the person went back to it. */
export function VoiceMemoChip({ memo }: { memo: VoiceMemo }) {
  const { t } = useCrew()
  if (!memo.ref) return null
  return (
    <div className="flex items-center gap-2 rounded-xl border border-[var(--color-stone)] bg-white px-3 py-2 text-sm text-[var(--color-charcoal)]">
      <Mic className="size-4 shrink-0 text-[var(--color-teal)]" aria-hidden="true" />
      <span className="flex-1">
        {t.eodMemoReady} · {clockOf(memo.seconds)}
      </span>
      <button type="button" aria-label={t.eodMemoRemove} onClick={memo.discard} className="flex size-9 items-center justify-center rounded-full text-[var(--color-charcoal-light)]">
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}
