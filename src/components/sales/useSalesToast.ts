'use client'

import { useCallback } from 'react'

import { useBotOptional } from '@/components/bot/BotProvider'
import { useCrewOptional } from '@/components/crew/CrewProvider'

// Sales screens run in the owners' app and, for a seat with Sales on, in the
// crew app. Each shell has its own toast; this uses whichever one is there.

type Tone = 'ok' | 'bad' | 'info'

export function useSalesToast(): { toast: (text: string, tone?: Tone) => void } {
  const bot = useBotOptional()
  const crew = useCrewOptional()
  const toast = useCallback(
    (text: string, tone?: Tone) => {
      if (bot) bot.toast(text, tone)
      else if (crew) crew.toast(text, tone)
      else console.info(text)
    },
    [bot, crew],
  )
  return { toast }
}
