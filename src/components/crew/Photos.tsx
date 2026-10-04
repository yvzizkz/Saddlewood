'use client'

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Camera, ImagePlus, Loader2, X } from 'lucide-react'

import type { BotFileRef } from '@/lib/bot/types'
import { MAX_ENTRY_FILES } from '@/lib/crew/types'
import { uploadPhoto, useCrew } from './CrewProvider'

// Photos for a receipt, a progress note or the end-of-day check-in. Each one
// is shrunk on the phone and uploaded the moment it is picked, so "Send" at
// the bottom of the form has nothing left to wait for.

type Item = { key: string; preview: string; ref: BotFileRef | null; failed: boolean }

export function usePhotos() {
  const { t, toast } = useCrew()
  const [items, setItems] = useState<Item[]>([])
  const previews = useRef<string[]>([])

  useEffect(() => {
    const urls = previews.current
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [])

  const add = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        const key = `${Date.now()}-${Math.random().toString(16).slice(2)}`
        const preview = URL.createObjectURL(file)
        previews.current.push(preview)
        setItems((list) => (list.length >= MAX_ENTRY_FILES ? list : [...list, { key, preview, ref: null, failed: false }]))
        try {
          const ref = await uploadPhoto(file)
          setItems((list) => list.map((it) => (it.key === key ? { ...it, ref } : it)))
        } catch {
          setItems((list) => list.map((it) => (it.key === key ? { ...it, failed: true } : it)))
          toast(t.photoFailed, 'bad')
        }
      }
    },
    [t, toast],
  )

  const remove = useCallback((key: string) => setItems((list) => list.filter((it) => it.key !== key)), [])

  return {
    items,
    add,
    remove,
    /** Still uploading: the form's Send waits for this. */
    busy: items.some((it) => !it.ref && !it.failed),
    refs: items.flatMap((it) => (it.ref ? [it.ref] : [])),
  }
}

export function PhotoStrip({ photos, cameraFirst = false }: { photos: ReturnType<typeof usePhotos>; cameraFirst?: boolean }) {
  const { t } = useCrew()
  const camera = useRef<HTMLInputElement>(null)
  const library = useRef<HTMLInputElement>(null)
  const full = photos.items.length >= MAX_ENTRY_FILES

  function pick(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length) void photos.add(files)
  }

  const cameraButton = (
    <button
      type="button"
      disabled={full}
      onClick={() => camera.current?.click()}
      className="flex size-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--color-stone-mid)] bg-white text-[11px] font-medium text-[var(--color-charcoal)] disabled:opacity-40"
    >
      <Camera className="size-6" aria-hidden="true" />
      {t.takePhoto}
    </button>
  )
  const libraryButton = (
    <button
      type="button"
      disabled={full}
      onClick={() => library.current?.click()}
      className="flex size-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--color-stone-mid)] bg-white text-[11px] font-medium text-[var(--color-charcoal)] disabled:opacity-40"
    >
      <ImagePlus className="size-6" aria-hidden="true" />
      {t.addPhoto}
    </button>
  )

  return (
    <div className="flex flex-wrap gap-2">
      {photos.items.map((it) => (
        <div key={it.key} className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-[var(--color-stone)] bg-[var(--color-cream)]">
          {/* A local preview of the file just picked: nothing for next/image to optimize. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={it.preview} alt="" className={`size-full object-cover ${it.failed ? 'opacity-30' : ''}`} />
          {!it.ref && !it.failed ? (
            <span className="absolute inset-0 flex items-center justify-center bg-black/30" role="status" aria-label={t.uploading}>
              <Loader2 className="size-5 animate-spin text-white" aria-hidden="true" />
            </span>
          ) : null}
          <button
            type="button"
            aria-label={t.remove}
            onClick={() => photos.remove(it.key)}
            className="absolute right-0.5 top-0.5 flex size-7 items-center justify-center rounded-full bg-black/60 text-white"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ))}
      {cameraFirst ? cameraButton : libraryButton}
      {cameraFirst ? libraryButton : cameraButton}
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
      <input ref={library} type="file" accept="image/*" multiple className="hidden" onChange={pick} />
    </div>
  )
}
