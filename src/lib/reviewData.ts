// Internal approval queue - batches of decisions for the owner.
// The token in the link is the authentication: whoever has the link can decide.
// Links are only ever sent to the owner's mailbox. Pages are noindex.

export const REVIEW_TOKEN =
  process.env.REVIEW_TOKEN || "e9d455e6e9af6a0172c4d879ceb2fc5e";

export type ReviewItem = {
  id: string;
  title: string;
  summary: string;
  detail?: string[];
  images?: { src: string; caption: string }[];
  // "decision" = approve / reject / changes. "choice" = pick one option.
  kind: "decision" | "choice";
  options?: { key: string; label: string; hint: string }[];
};

export type ReviewBatch = {
  id: string;
  title: string;
  intro: string;
  items: ReviewItem[];
};

export const BATCHES: Record<string, ReviewBatch> = {
  m1: {
    id: "m1",
    title: "Marketing approvals",
    intro:
      "Seven decisions. Tap a button on each card. Add a note if you want changes. Every answer is saved the moment you tap it.",
    items: [
      {
        id: "letters",
        kind: "decision",
        title: "1. Introduction letters to 24 builders",
        summary:
          "Five letters in your voice to the CBUSA builder list Jeff sent. Owners, estimators, and project managers each get a different angle. Sent a few per day from your own mailbox so they land in the inbox, not junk. Replies are tracked automatically.",
        detail: [
          "Letter for owners: \"Quick introduction: we're a Scottsdale framing crew that self-performs slab to trusses, wood and structural steel with our own people, which I know is rare in the Valley. Right now that looks like a ground-up custom in Paradise Valley where our crew set the steel skeleton and is framing the rest...\"",
          "Letter for estimators: \"I'd like to be on your bid list for framing packages. Plans to info@ or Procore both work. We confirm receipt same day and flag plan conflicts with the takeoff, not after mobilization.\"",
          "Every letter is personalized with a real fact about that builder's current work. All AFT references are held back for the podcast.",
        ],
      },
      {
        id: "email-style",
        kind: "choice",
        title: "2. Email style",
        summary:
          "Same letter, two looks. Plain text reads like you typed it. Polished adds a clean signature and one gold line, still no images, still lands in the inbox.",
        images: [
          {
            src: "/review/rv-email-styles.jpeg",
            caption: "Top: plain text. Bottom: polished minimal.",
          },
        ],
        options: [
          { key: "plain", label: "Plain", hint: "Reads 100% personal" },
          { key: "polished", label: "Polished", hint: "Light branding, still filter safe" },
        ],
      },
      {
        id: "mail-piece",
        kind: "decision",
        title: "3. Printed mail piece",
        summary:
          "We print the capability sheet styled like a page from a permit set, add a short signed note, and hand-address it to each owner. Letter lands Monday, email follows Thursday. About $60 for the whole list. Nobody else is mailing builders a drawing sheet.",
        images: [
          {
            src: "/review/rv-design-b.jpeg",
            caption: "The SF-01 sheet that goes in the envelope.",
          },
        ],
      },
      {
        id: "design",
        kind: "choice",
        title: "4. Campaign look",
        summary:
          "Four design directions for everything a builder sees after they reply: the follow-up package, bid packets, future campaigns. The logo stays the same in all four. Pick the one that feels like Saddlewood.",
        images: [
          { src: "/review/rv-design-a.jpeg", caption: "A. Estate. Matches the website." },
          { src: "/review/rv-design-b.jpeg", caption: "B. Blueprint. Reads like a permit set." },
          { src: "/review/rv-design-c.jpeg", caption: "C. Ironwork. Dark steel, jobsite pride." },
          { src: "/review/rv-design-d.jpeg", caption: "D. Gallery. White space, photos talk." },
        ],
        options: [
          { key: "A", label: "A. Estate", hint: "Safe, matches the site" },
          { key: "B", label: "B. Blueprint", hint: "Speaks fluent GC" },
          { key: "C", label: "C. Ironwork", hint: "Boldest, most jobsite" },
          { key: "D", label: "D. Gallery", hint: "High design, minimal" },
        ],
      },
      {
        id: "website",
        kind: "decision",
        title: "5. Two website pages ready to publish",
        summary:
          "A new framing capability statement page (where every outreach letter points) and the careers page upgrade with the crew photo. Approve publishes both.",
        images: [
          { src: "/review/rv-capabilities.jpeg", caption: "New: /framing/capabilities" },
          { src: "/review/rv-careers.jpeg", caption: "Upgraded: /careers" },
        ],
      },
      {
        id: "reviews",
        kind: "decision",
        title: "6. Google review texts to past clients",
        summary:
          "When a job's final payment lands, the client gets one text asking for a Google review, with an escape valve: \"if anything's not right, reply here instead and we'll fix it first.\" Unhappy clients come to us, not to Google. Nobody with an open issue ever gets asked. English and Spanish.",
        detail: [
          "English: \"Hi {first}, it's the Saddlewood team. It was a pleasure building with you. If you have 60 seconds, a Google review helps our small crew more than you'd guess: {link}. And if anything's not right, reply here instead and we'll fix it first.\"",
          "Spanish: \"Hola {first}, somos el equipo de Saddlewood. Fue un gusto trabajar con usted. Si tiene 60 segundos, una resena en Google nos ayuda muchisimo: {link}. Y si algo no quedo bien, respondanos aqui primero y lo arreglamos.\"",
        ],
      },
      {
        id: "presence",
        kind: "decision",
        title: "7. Where Saddlewood should be listed",
        summary:
          "We audited the platforms builders use to find subs. Recommendation, in order: 1) Google Business Profile tune-up, free, biggest local payoff. 2) Claim the Procore profile after we verify the unclaimed page is really ours, free, direct bid invitations from GCs. 3) Downtobid listing, free, bid invites arrive by email and flow into our system automatically. 4) HBACA membership, about $1,000 a year, networking, can wait. 5) BBB, skip for now.",
        detail: [
          "Once listed, bid invitations arrive at info@ and our system already reads that mailbox. Each invitation gets logged, matched to capacity, and queued for a takeoff decision. That is the automation: invitations become tracked opportunities without anyone forwarding anything.",
          "Approve means: we do 1 through 3 now and hold 4 and 5.",
        ],
      },
    ],
  },
};
