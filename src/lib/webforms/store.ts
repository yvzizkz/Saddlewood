import { getSupabaseAdmin } from "@/lib/supabase/admin";

// What the website's forms send, kept in the app beside GoHighLevel and email.
// keepSubmission never throws: a form still answers from its other channels.

export type WebForm = "contact" | "trade_partner" | "careers";
export type WebStatus = "new" | "called" | "texted" | "dismissed";

export type NewSubmission = { form: WebForm; name?: unknown; email?: unknown; phone?: unknown; company?: unknown; about?: unknown; summary: string };
export type Submission = { id: number; form: WebForm; name: string; email: string; phone: string; company: string; about: string; summary: string; status: WebStatus; createdAt: string };

/** The forms are public, so what's kept is bounded. */
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

const WINDOW_DAYS = 90;
const APPLICATIONS: WebForm[] = ["trade_partner", "careers"];

export async function keepSubmission(s: NewSubmission): Promise<boolean> {
  try {
    const { error } = await getSupabaseAdmin()
      .from("web_submissions")
      .insert({ form: s.form, name: text(s.name, 200), email: text(s.email, 200), phone: text(s.phone, 40), company: text(s.company, 200), about: text(s.about, 300), summary: text(s.summary, 8000) });
    if (error) throw new Error(error.message);
    return true;
  } catch (err) {
    console.error(`[web_submissions] ${s.form} not kept:`, err);
    return false;
  }
}

/** Newest first, the last 90 days. */
export async function listSubmissions(forms: WebForm[]): Promise<Submission[]> {
  const from = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  const { data, error } = await getSupabaseAdmin().from("web_submissions").select("*").in("form", forms).gte("created_at", from).order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error(`web_submissions: ${error.message}`);
  return ((data ?? []) as (Omit<Submission, "createdAt"> & { created_at: string })[]).map(({ created_at, ...s }) => ({ ...s, createdAt: created_at }));
}

/** Trade-partner and job applications. None rather than failing, as before 0067 is applied. */
export async function listApplications(): Promise<Submission[]> {
  try {
    return await listSubmissions(APPLICATIONS);
  } catch (err) {
    console.error("[web_submissions] applications:", err);
    return [];
  }
}

/** Trade-partner and job applications nobody has closed. */
export async function applicationsWaiting(): Promise<number> {
  return (await listApplications()).filter((s) => s.status !== "dismissed").length;
}

/** False when no such submission, or it's on a form this seat can't mark. */
export async function markSubmission(id: number, status: WebStatus, forms: WebForm[]): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().from("web_submissions").update({ status }).eq("id", id).in("form", forms).select("id");
  if (error) throw new Error(`web_submissions: ${error.message}`);
  return (data ?? []).length > 0;
}
