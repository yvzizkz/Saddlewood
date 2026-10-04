import { addDays, clockText, dayShort } from "./time";
import type { CrewLang } from "./types";

// What the server says to a crew member, in their language: why something was
// refused, and the text of a notification. (The screens' own wording lives in
// src/components/crew/strings.ts. What owners read is English only.)

type Both = { en: string; es: string };

export function say(lang: CrewLang, text: Both): string {
  return lang === "es" ? text.es : text.en;
}

/** "today", "tomorrow", or "on Mon, Oct 5". */
function dayWord(day: string, today: string): Both {
  if (day === today) return { en: "today", es: "hoy" };
  if (day === addDays(today, 1)) return { en: "tomorrow", es: "mañana" };
  return { en: `on ${dayShort(day, "en")}`, es: `el ${dayShort(day, "es")}` };
}

export const MSG = {
  jobGone: { en: "That job is no longer on the list. Pick another one.", es: "Ese trabajo ya no está en la lista. Elige otro." },
  alreadyOn: (job: string, since: string): Both => ({
    en: `You are already on the clock at ${job} since ${since}.`,
    es: `Ya marcaste entrada en ${job} desde las ${since}.`,
  }),
  notOn: { en: "You are not on the clock.", es: "No has marcado entrada." },
  tooOld: {
    en: "That punch is too old to count. Send a time fix and the office will enter it.",
    es: "Esa marca es demasiado vieja. Manda una corrección de horas y la oficina la registra.",
  },
  beforeStart: { en: "That time is before you clocked in.", es: "Esa hora es antes de tu entrada." },
  sameJob: { en: "You are already on that job.", es: "Ya estás en ese trabajo." },
  changed: {
    en: "Your time changed while you were tapping. Look at it and try again.",
    es: "Tus horas cambiaron mientras tocabas. Revísalas e intenta de nuevo.",
  },
  tooMany: { en: "That is a lot for one day. Call the office if you need to send more.", es: "Eso es mucho para un día. Llama a la oficina si necesitas mandar más." },
  notYours: { en: "That photo could not be attached. Take it again.", es: "No se pudo adjuntar esa foto. Tómala de nuevo." },
  needNoteOrPhoto: { en: "Add a note or a photo.", es: "Agrega una nota o una foto." },
  eodDay: { en: "The end of day can be sent for today or yesterday.", es: "El fin del día se puede mandar de hoy o de ayer." },
  fixDay: { en: "A time fix can go back 14 days.", es: "Una corrección de horas puede ser de hasta 14 días atrás." },
  fixOrder: { en: "The end time has to be after the start time.", es: "La hora de salida tiene que ser después de la entrada." },
  noShift: { en: "That shift could not be found.", es: "No se encontró ese turno." },
  noQuestion: { en: "That question was already answered.", es: "Esa pregunta ya fue contestada." },
  notATime: { en: "Pick the time you left.", es: "Elige la hora en que saliste." },
  future: { en: "That time has not happened yet.", es: "Esa hora todavía no pasa." },
  tooLong: {
    en: "That would be more than 20 hours. Check the time, or send a time fix.",
    es: "Eso serían más de 20 horas. Revisa la hora o manda una corrección.",
  },
  notAnAmount: { en: "Type the amount, like 146.61.", es: "Escribe la cantidad, como 146.61." },
  noTask: { en: "That task could not be found.", es: "No se encontró esa tarea." },
  noSchedule: { en: "That is no longer on your schedule.", es: "Eso ya no está en tu horario." },

  // ---- notifications to a crew member ----
  scheduled: (job: string, day: string, today: string, time: string): { title: Both; body: Both } => {
    const d = dayWord(day, today);
    const at = time ? clockText(time) : "";
    return {
      title: { en: "Your schedule", es: "Tu horario" },
      body: {
        en: `You are on ${job} ${d.en}${at ? ` at ${at}` : ""}.`,
        es: `Te toca ${job} ${d.es}${at ? ` a las ${at}` : ""}.`,
      },
    };
  },
  unscheduled: (job: string, day: string, today: string): { title: Both; body: Both } => {
    const d = dayWord(day, today);
    return {
      title: { en: "Schedule change", es: "Cambio de horario" },
      body: { en: `You are off ${job} ${d.en}.`, es: `Ya no vas a ${job} ${d.es}.` },
    };
  },
  newTask: (title: string): { title: Both; body: Both } => ({
    title: { en: "New task", es: "Nueva tarea" },
    body: { en: title, es: title },
  }),
  newQuestion: (body: string, bodyEs: string, fromBot: boolean): { title: Both; body: Both } => ({
    title: fromBot ? { en: "Quick question", es: "Una pregunta" } : { en: "The office has a question", es: "La oficina tiene una pregunta" },
    body: { en: body, es: bodyEs || body },
  }),
  fixDecided: (day: string, approved: boolean, note: string): { title: Both; body: Both } => ({
    title: { en: "Your time fix", es: "Tu corrección de horas" },
    body: approved
      ? { en: `Approved for ${dayShort(day, "en")}.`, es: `Aprobada para el ${dayShort(day, "es")}.` }
      : {
          en: `Not approved for ${dayShort(day, "en")}.${note ? ` ${note}` : ""}`,
          es: `No se aprobó para el ${dayShort(day, "es")}.${note ? ` ${note}` : ""}`,
        },
  }),
} as const;
