import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, Chip, Empty, ScreenTitle, SectionTitle } from "@/components/bot/ui";
import { day, money } from "@/components/money/format";
import { getViewer } from "@/lib/crew/auth";
import { moneyOverview, type OpenDocument } from "@/lib/billing/overview";

export const dynamic = "force-dynamic";

// Who owes what. One line per open document: balance, how it stands (sent,
// delivered, viewed), and the next step on the ladder.

function standing(d: OpenDocument): { tone: "ok" | "warn" | "bad" | "quiet"; text: string } {
  const p = d.proof;
  if (p.state === "bounced") return { tone: "bad", text: `Bounced ${day(p.bouncedAt)}` };
  if (p.views.length > 0) return { tone: "ok", text: `Viewed ${day(p.views[p.views.length - 1].at)}` };
  if (d.unconfirmed) return { tone: "warn", text: `Sent ${day(p.firstSentAt)}, not viewed` };
  if (p.state === "delivered") return { tone: "quiet", text: `Delivered ${day(p.deliveredAt)}` };
  if (p.state === "sent") return { tone: "quiet", text: `Sent ${day(p.firstSentAt)}` };
  return { tone: "warn", text: "Not sent" };
}

export default async function MoneyScreen() {
  if ((await getViewer()).kind !== "staff") redirect("/app");
  const o = await moneyOverview();
  const waiting = o.clients.flatMap((c) => c.documents).filter((d) => d.unconfirmed || (d.next && d.next.who === "marco" && d.next.on <= o.today));

  return (
    <main className="mx-auto max-w-xl px-4 pb-24 pt-5">
      <ScreenTitle eyebrow="Money" title={money(o.totalOpenCents)}>
        <p className="text-sm text-[var(--color-charcoal-light)]">open across {o.clients.length} client{o.clients.length === 1 ? "" : "s"}</p>
      </ScreenTitle>

      <SectionTitle count={waiting.length}>Waiting on you</SectionTitle>
      {waiting.length === 0 ? (
        <Empty>Nothing needs a decision today.</Empty>
      ) : (
        <div className="space-y-2">
          {waiting.map((d) => (
            <Link key={d.doc.id} href={`/app/money/${d.doc.id}`} className="block">
              <Card>
                <p className="text-sm font-medium text-[var(--color-charcoal)]">
                  {d.clientName} · {d.doc.number}
                </p>
                <p className="text-sm text-[var(--color-charcoal-light)]">
                  {d.unconfirmed ? "Not viewed since it was sent. Resend and ask them to confirm receipt." : `${d.next?.label} was due ${day(d.next?.on ?? null)}.`}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {o.clients.map((c) => (
        <section key={c.id ?? "none"}>
          <SectionTitle action={<span className="text-sm font-medium text-[var(--color-charcoal)]">{money(c.openCents)}</span>}>{c.name}</SectionTitle>
          <div className="space-y-2">
            {c.documents.map((d) => {
              const s = standing(d);
              return (
                <Link key={d.doc.id} href={`/app/money/${d.doc.id}`} className="block">
                  <Card>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--color-charcoal)]">{d.doc.number}</p>
                        <p className="truncate text-xs text-[var(--color-charcoal-light)]">{d.doc.title || d.doc.kind}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium tabular-nums text-[var(--color-charcoal)]">{money(d.balanceCents)}</p>
                        {d.paidCents > 0 ? <p className="text-xs text-[var(--color-charcoal-light)]">{money(d.paidCents)} paid</p> : null}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Chip tone={s.tone}>{s.text}</Chip>
                      {d.next ? (
                        <span className="text-xs text-[var(--color-charcoal-light)]">
                          Next: {d.next.label}, {day(d.next.on)}
                          {d.next.daysLate > 0 ? ` · ${d.next.daysLate} days on the clock` : ""}
                        </span>
                      ) : null}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
      {o.clients.length === 0 ? <Empty>Nothing is open.</Empty> : null}
    </main>
  );
}
