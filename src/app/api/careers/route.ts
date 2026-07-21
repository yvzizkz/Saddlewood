import { NextResponse } from "next/server";
import { Resend } from "resend";
import { renderNotificationEmail } from "@/lib/emailTemplate";

/**
 * Careers application API route — sister to /api/trade-partners and /api/contact,
 * same never-lose-a-submission contract: GHL upsert (tagged `applicant` + the role)
 * plus a Resend notification; success only if at least one channel delivers.
 *
 * Deliberately captures basics only — role, contact, salary expectation, start
 * date, experience, languages — no work-history essay. Resumes arrive by reply.
 */

const GHL_API_KEY = process.env.GHL_API_KEY || "";
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || "";
const GHL_CF_VISION_ID = process.env.GHL_CF_VISION_ID || "bPd6r0bYyAKBbrn2wXVn";

const MARCO_EMAIL = process.env.MARCO_EMAIL || "marco@saddlewoodcontracting.com";
const TO = ["info@saddlewoodcontracting.com", MARCO_EMAIL].filter(
  (addr, i, all) => addr && all.indexOf(addr) === i
);
const FROM =
  process.env.RESEND_FROM_ADDRESS || "notifications@saddlewoodcontracting.com";

interface CareersBody {
  role?: string;
  name?: string;
  email?: string;
  phone?: string;
  city?: string;
  salary?: string;
  startDate?: string;
  experience?: string;
  languages?: string;
  heardFrom?: string;
  message?: string;
  /** Honeypot — must be empty. */
  company?: string;
}

function buildSummary(b: CareersBody): string {
  return [
    b.role ? `Applying for: ${b.role}` : "",
    b.name ? `Name: ${b.name}` : "",
    b.email ? `Email: ${b.email}` : "",
    b.phone ? `Phone: ${b.phone}` : "",
    b.city ? `City/Area: ${b.city}` : "",
    b.salary ? `Salary expectation: ${b.salary}` : "",
    b.startDate ? `Earliest start: ${b.startDate}` : "",
    b.experience ? `Experience: ${b.experience}` : "",
    b.languages ? `Languages: ${b.languages}` : "",
    b.heardFrom ? `Heard about us via: ${b.heardFrom}` : "",
    b.message ? `Notes: ${b.message}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function sendEmail(b: CareersBody): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;
  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: TO,
      replyTo: b.email,
      subject: `Job application — ${b.name ?? "Unknown"} · ${b.role ?? "General"}`,
      html: renderNotificationEmail({
        eyebrow: "New job application",
        heading: `${b.name || "Someone"} applied — ${b.role || "General"}`,
        intro:
          "A new application just came in from the careers page. Reply to reach them and ask for a resume.",
        rows: [
          { label: "Role", value: b.role },
          { label: "Name", value: b.name },
          { label: "Email", value: b.email, href: b.email ? `mailto:${b.email}` : undefined },
          {
            label: "Phone",
            value: b.phone,
            href: b.phone ? `tel:${b.phone.replace(/[^0-9+]/g, "")}` : undefined,
          },
          { label: "City / area", value: b.city },
          { label: "Salary expectation", value: b.salary },
          { label: "Earliest start", value: b.startDate },
          { label: "Experience", value: b.experience },
          { label: "Languages", value: b.languages },
          { label: "Heard via", value: b.heardFrom },
        ],
        noteLabel: "Notes",
        noteText: b.message,
        replyEmail: b.email,
        replyLabel: b.name ? `Reply to ${b.name}` : "Reply",
        footerNote: "Sent from the Careers page at saddlewoodcontracting.com",
      }),
    });
    if (error) {
      console.error("[Resend careers error]", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Resend careers error]", err);
    return false;
  }
}

async function upsertToGhl(b: CareersBody): Promise<boolean> {
  if (!GHL_API_KEY || !GHL_LOCATION_ID) return false;
  try {
    const roleTag = (b.role || "general")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const summary = buildSummary(b);
    const res = await fetch("https://services.leadconnectorhq.com/contacts/upsert", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GHL_API_KEY}`,
        "Content-Type": "application/json",
        Version: "2021-07-28",
      },
      body: JSON.stringify({
        locationId: GHL_LOCATION_ID,
        name: b.name,
        email: b.email,
        phone: b.phone,
        source: "Website Careers Application",
        tags: ["applicant", "careers", `role-${roleTag}`],
        customFields: summary ? [{ id: GHL_CF_VISION_ID, field_value: summary }] : [],
      }),
    });
    if (!res.ok) {
      console.error("[GHL careers upsert error]", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[GHL careers upsert error]", err);
    return false;
  }
}

export async function POST(request: Request) {
  let body: CareersBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  // Honeypot: silently accept and drop bot submissions.
  if (body.company) return NextResponse.json({ success: true });

  if (!body.name || (!body.email && !body.phone) || !body.role) {
    return NextResponse.json(
      { success: false, error: "Name, role, and an email or phone are required." },
      { status: 400 }
    );
  }

  const [ghlOk, emailOk] = await Promise.all([upsertToGhl(body), sendEmail(body)]);

  if (!ghlOk && !emailOk) {
    console.error("[careers] ALL delivery channels failed. Payload:", buildSummary(body));
    return NextResponse.json(
      { success: false, error: "We couldn't submit your application — please email info@saddlewoodcontracting.com." },
      { status: 500 }
    );
  }
  return NextResponse.json({ success: true });
}
