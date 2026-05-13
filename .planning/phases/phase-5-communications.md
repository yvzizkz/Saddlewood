# Phase 5 — Communications Layer: Email Templates & Compose Flow

## Phase Goal

Build the complete communication layer for the Saddlewood estimate portal: 12 production-ready React Email templates covering the full estimate lifecycle, a compose-and-send panel for estimators, and the API routes that drive delivery, email verification, and activity logging.

## Success Criteria

- [ ] All 12 React Email templates render correctly in email clients (Gmail, Apple Mail, Outlook)
- [ ] Base `EmailLayout` component renders table-based, mobile-first layout with Saddlewood branding
- [ ] `ComposePanel` opens as a right slide-in, sends estimate, logs to `email_log`
- [ ] `POST /api/estimates/[id]/export` creates an `export_links` row with token + `recipient_email`
- [ ] `POST /api/estimates/[id]/send-email` sends via Resend, fires internal notification emails
- [ ] `GET /api/share/[token]` verifies token, records `email_verified_at` on first click, increments `view_count`
- [ ] Email preview route `/internal/estimates/[id]/email-preview` renders live preview of `client-delivery` template
- [ ] All email links point to correct portal or share URLs
- [ ] SPF/DKIM verified on Resend dashboard for `saddlewoodcontracting.com`
- [ ] Resend webhook endpoint records delivery/bounce/open events into `email_log`
- [ ] End-to-end test: create estimate → send → client clicks link → `email_verified_at` set → accept → confirmation sent

---

## Directory Structure

```
src/
  emails/
    components/
      EmailLayout.tsx          ← shared base layout (header + footer, table-based)
      EmailButton.tsx          ← CTA button component (table cell, not <a> alone)
      EmailDivider.tsx         ← <hr> wrapper
      EmailSection.tsx         ← padded content section
    estimate-ready.tsx
    estimate-approved-internal.tsx
    estimate-changes-requested.tsx
    estimate-sent-confirmation.tsx
    estimate-viewed-by-client.tsx
    estimate-accepted.tsx
    estimate-expired-internal.tsx
    client-delivery.tsx
    client-accepted-confirmation.tsx
    client-reminder-3d.tsx
    client-followup-7d.tsx
    client-expiring-soon.tsx
  components/
    portal/
      ComposePanel.tsx
  app/
    api/
      estimates/
        [id]/
          export/
            route.ts
          send-email/
            route.ts
      share/
        [token]/
          route.ts
      webhooks/
        resend/
          route.ts
    internal/
      estimates/
        [id]/
          email-preview/
            page.tsx
    share/
      [token]/
        page.tsx           ← (already exists or will be built Phase 4 — update server-side logic here)
```

---

## ENV Variables

```env
RESEND_API_KEY=<already set>
RESEND_FROM_ADDRESS=info@saddlewoodcontracting.com
MARCO_EMAIL=marco@saddlewoodcontracting.com
NEXT_PUBLIC_APP_URL=https://saddlewoodcontracting.com
RESEND_WEBHOOK_SECRET=<set after webhook registration on resend.com>
```

---

## Base Email Layout Component

**File:** `src/emails/components/EmailLayout.tsx`

### Purpose
Every template wraps its content in `EmailLayout`. It provides:
- Full-width teal header with Saddlewood wordmark/logo
- Centered white content card (max-width 600px)
- Footer: address, ROC license number, website, unsubscribe note
- Mobile-first: uses `<table>` + inline styles — no flexbox, no grid (email clients)

### Props Interface

```typescript
interface EmailLayoutProps {
  previewText?: string;   // appears in inbox preview, hidden in body
  children: React.ReactNode;
}
```

### Component Structure

```tsx
import {
  Html, Head, Preview, Body, Container, Section,
  Row, Column, Text, Link, Hr, Img
} from '@react-email/components';

const BRAND = {
  teal:     '#2d4a4a',
  gold:     '#c8a55a',
  cream:    '#f5f0e8',
  charcoal: '#2c2926',
  white:    '#ffffff',
};

const font = {
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

export function EmailLayout({ previewText, children }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        {/* Inline <style> for email-safe responsive rules */}
        <style>{`
          @media only screen and (max-width: 600px) {
            .email-container { width: 100% !important; }
            .stack-col { display: block !important; width: 100% !important; }
          }
        `}</style>
      </Head>
      {previewText && <Preview>{previewText}</Preview>}
      <Body style={{ backgroundColor: BRAND.cream, margin: 0, padding: 0, ...font }}>
        {/* Outer wrapper table */}
        <table width="100%" cellPadding={0} cellSpacing={0} role="presentation"
          style={{ backgroundColor: BRAND.cream }}>
          <tr>
            <td align="center" style={{ padding: '24px 16px' }}>

              {/* HEADER */}
              <table className="email-container" width="600" cellPadding={0} cellSpacing={0}
                role="presentation" style={{ maxWidth: 600 }}>
                <tr>
                  <td style={{
                    backgroundColor: BRAND.teal,
                    padding: '24px 32px',
                    borderRadius: '8px 8px 0 0',
                  }}>
                    {/* Logo: hosted at NEXT_PUBLIC_APP_URL/logo-email.png — white on teal */}
                    <Img
                      src={`${process.env.NEXT_PUBLIC_APP_URL}/logo-email.png`}
                      alt="Saddlewood Contracting"
                      width="200"
                      height="48"
                      style={{ display: 'block' }}
                    />
                  </td>
                </tr>

                {/* CONTENT CARD */}
                <tr>
                  <td style={{
                    backgroundColor: BRAND.white,
                    padding: '40px 32px',
                  }}>
                    {children}
                  </td>
                </tr>

                {/* FOOTER */}
                <tr>
                  <td style={{
                    backgroundColor: BRAND.charcoal,
                    padding: '24px 32px',
                    borderRadius: '0 0 8px 8px',
                  }}>
                    <Text style={{
                      color: '#9ca3af',
                      fontSize: 12,
                      lineHeight: '18px',
                      margin: '0 0 4px',
                      ...font,
                    }}>
                      Saddlewood Contracting LLC
                    </Text>
                    <Text style={{ color: '#9ca3af', fontSize: 12, margin: '0 0 4px', ...font }}>
                      ROC License #[LICENSE_NUMBER] · Arizona Licensed General Contractor
                    </Text>
                    <Text style={{ color: '#9ca3af', fontSize: 12, margin: 0, ...font }}>
                      <Link href="https://saddlewoodcontracting.com"
                        style={{ color: BRAND.gold, textDecoration: 'none' }}>
                        saddlewoodcontracting.com
                      </Link>
                      {' · '}
                      <Link href="tel:+1XXXXXXXXXX"
                        style={{ color: '#9ca3af', textDecoration: 'none' }}>
                        (XXX) XXX-XXXX
                      </Link>
                    </Text>
                  </td>
                </tr>
              </table>

            </td>
          </tr>
        </table>
      </Body>
    </Html>
  );
}
```

### EmailButton Component

```tsx
// src/emails/components/EmailButton.tsx
interface EmailButtonProps {
  href: string;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';  // primary=teal, secondary=gold
}

export function EmailButton({ href, children, variant = 'primary' }: EmailButtonProps) {
  const bg = variant === 'primary' ? '#2d4a4a' : '#c8a55a';
  const color = variant === 'primary' ? '#ffffff' : '#2c2926';
  return (
    // Table-based button — required for Outlook compatibility
    <table cellPadding={0} cellSpacing={0} role="presentation" style={{ margin: '24px 0' }}>
      <tr>
        <td style={{
          backgroundColor: bg,
          borderRadius: 6,
          textAlign: 'center' as const,
        }}>
          <a href={href} style={{
            display: 'inline-block',
            padding: '14px 32px',
            color,
            fontSize: 15,
            fontWeight: 600,
            textDecoration: 'none',
            fontFamily: 'Inter, sans-serif',
            letterSpacing: '0.02em',
          }}>
            {children}
          </a>
        </td>
      </tr>
    </table>
  );
}
```

---

## All 12 Template Specs

### Shared Types

```typescript
// src/emails/types.ts
export interface BaseEmailProps {
  jobName: string;
  estimateId: string;
}

export interface ClientEmailProps extends BaseEmailProps {
  clientName: string;
  clientEmail: string;
  shareToken: string;  // for share URL construction
}
```

---

### 1. `estimate-ready.tsx` — New Estimate for Marco

**Recipient:** Marco (`marco@saddlewoodcontracting.com`)
**Trigger:** Pipeline pushes new estimate to portal

**Props:**
```typescript
interface EstimateReadyProps {
  jobName: string;
  estimateId: string;
  grandTotal: number;      // dollars, no cents formatting
  bidDueDate: string;      // ISO date string
  flagCount: number;       // 0 = no flag note shown
  tradeCount: number;
  portalUrl: string;       // /internal/estimates/[id]
}
```

**Subject:** `New estimate ready for review: [jobName]`

**Layout:**
```
[Header — teal]

JOB NAME (24px, charcoal, Georgia/Fraunces with Georgia fallback)

$XXX,XXX                    ← 48px, teal, bold
Grand Total

Bid Due: [date]  ·  [N] Trades
[flag banner if flagCount > 0: gold background, "⚑ N item(s) flagged for review"]

[REVIEW NOW →]  ← teal button, full width on mobile

[Footer]
```

**Notes:**
- Mobile-optimized: button full width, large teal total impossible to miss
- Flag banner: `background: #fff7e6; border-left: 4px solid #c8a55a;` — rendered as table row, not div

---

### 2. `estimate-approved-internal.tsx` — Marco Approved, to Estimator

**Recipient:** Estimator (from `email_log` context)
**Trigger:** Marco clicks Approve in portal

**Props:**
```typescript
interface EstimateApprovedInternalProps {
  jobName: string;
  estimateId: string;
  approvedAmount: number;
  marcoNotes?: string;     // undefined = omit section
  sendToClientUrl: string; // /internal/estimates/[id] (with ?action=send)
}
```

**Subject:** `Marco approved [jobName] — $[approvedAmount]. Ready to send.`

**Layout:**
```
✓ Approved  ← small teal badge (table cell, background #2d4a4a10, text #2d4a4a)

[Job Name]
$[Amount]

Marco's Notes:  ← only if marcoNotes present
"[notes text in italic, bordered left with teal]"

[SEND TO CLIENT →]
```

---

### 3. `estimate-changes-requested.tsx` — Marco Requested Changes, to Estimator

**Props:**
```typescript
interface EstimateChangesRequestedProps {
  jobName: string;
  estimateId: string;
  overallNote: string;
  changeItems: Array<{
    lineItemDescription: string;
    changeRequest: string;
  }>;
  portalUrl: string;
}
```

**Subject:** `Changes requested on [jobName]`

**Layout:**
```
Changes Requested

Overall: "[overallNote]"

Requested Changes:
• [lineItemDescription]: [changeRequest]   ← rendered as <ul> via table rows
• ...

[VIEW IN PORTAL →]
```

**Note:** List rendered as a `<table>` with alternating row backgrounds since `<ul>` rendering is unreliable in Outlook.

---

### 4. `estimate-sent-confirmation.tsx` — Sent to Client, to Marco

**Props:**
```typescript
interface EstimateSentConfirmationProps {
  jobName: string;
  estimateId: string;
  clientName: string;
  clientEmail: string;
  sentAt: string;           // ISO datetime
  formatChosen: string;     // "Trade Summary" | "Itemized" | etc.
  shareUrl: string;         // full share URL
  clientViewUrl: string;    // /share/[token] as seen by client
}
```

**Subject:** `Estimate sent to [clientName] — [jobName]`

**Layout:**
```
Estimate Sent

Sent to: [clientName] <[clientEmail]>
Sent at: [formattedDateTime]
Format:  [formatChosen]
Link:    [shareUrl] (copyable text, linked)

[VIEW WHAT CLIENT SEES →]  ← links to shareUrl
```

---

### 5. `estimate-viewed-by-client.tsx` — Client Opened Link, to Marco + Estimator

**Props:**
```typescript
interface EstimateViewedByClientProps {
  jobName: string;
  estimateId: string;
  clientName: string;
  openedAt: string;         // ISO datetime
  viewCount: number;        // total views including this one
  portalUrl: string;
}
```

**Subject:** `[clientName] just opened the [jobName] estimate`

**Layout:**
```
[clientName] opened your estimate

Opened at: [formattedDateTime]
[if viewCount > 1: "This is their [viewCount]th time opening it."]

[VIEW ESTIMATE IN PORTAL →]
```

**Note:** viewCount ordinal: 1st / 2nd / 3rd / Nth — utility function `ordinal(n: number): string`.

---

### 6. `estimate-accepted.tsx` — Client Accepted, to Marco + Estimator

**Props:**
```typescript
interface EstimateAcceptedProps {
  jobName: string;
  estimateId: string;
  clientName: string;
  acceptedAmount: number;
  acceptedAt: string;       // ISO datetime
  clientSignature: string;  // typed name they entered
  bidLogUrl: string;        // /internal/bid-log
  pdfDownloadUrl: string;
}
```

**Subject:** `🎉 [clientName] accepted the estimate — $[acceptedAmount]`

**Layout:**
```
[Large gold/cream celebration banner — table row, background #c8a55a15, border #c8a55a]

JOB WON

[Job Name]
$[acceptedAmount]  ← 48px, teal

Accepted: [formattedDateTime]
Signed as: "[clientSignature]"

[MARK AS WON →]   ← gold button (secondary variant)
[Download PDF]    ← plain text link
```

---

### 7. `estimate-expired-internal.tsx` — Bid Expired, to Marco

**Props:**
```typescript
interface EstimateExpiredInternalProps {
  jobName: string;
  estimateId: string;
  expiredAt: string;
  clientStatus: 'never-opened' | 'opened' | 'opened-not-accepted';
  portalUrl: string;
}
```

**Subject:** `Estimate expired: [jobName] — no decision received`

**Layout:**
```
[Amber warning banner]

Estimate Expired

[Job Name]
Expired: [formattedDate]
Client: [human-readable status based on clientStatus enum]
  "never-opened"       → "Client never opened the estimate link."
  "opened"             → "Client opened the estimate but never responded."
  "opened-not-accepted"→ "Client viewed the estimate multiple times but did not accept."

[FOLLOW UP MANUALLY →]  ← links to portal estimate page
```

---

### 8. `client-delivery.tsx` — THE MAIN CLIENT EMAIL

**Recipient:** Client
**Trigger:** Estimator clicks Send in ComposePanel

**Props:**
```typescript
interface ClientDeliveryProps {
  jobName: string;
  clientName: string;
  grandTotal: number;
  estimatorMessage?: string;   // personal message from estimator, may be empty
  shareUrl: string;            // https://saddlewoodcontracting.com/share/[token]
  acceptUrl: string;           // https://saddlewoodcontracting.com/share/[token]?action=accept
  expiryDate: string;          // ISO date
  estimatorName: string;
  marcoPhone: string;          // Marco's direct number for footer
}
```

**Subject:** `Your estimate from Saddlewood Contracting — [jobName]`

**Layout:**
```
[Header — teal, Saddlewood logo]

Hi [clientName],

[estimatorMessage if present, italic, left-bordered teal]

─────────────────────────────
YOUR ESTIMATE
[jobName]

$[grandTotal]              ← 48px bold teal, centered in a cream box
─────────────────────────────

[VIEW YOUR ESTIMATE →]     ← teal primary button (verifies email on click)
[ACCEPT THIS ESTIMATE →]   ← gold secondary button

This estimate is valid through [formattedExpiryDate].

Questions? Reply to this email or call Marco directly:
[marcoPhone]

[Footer — charcoal]
```

**Critical Implementation Notes:**
- The "VIEW YOUR ESTIMATE" button links to `shareUrl` = `https://saddlewoodcontracting.com/share/[token]`
- When this link is clicked → server records `email_verified_at` (see Email Verification section)
- The "ACCEPT THIS ESTIMATE" button links to `acceptUrl` = `shareUrl + ?action=accept`
- Both the `VIEW` and `ACCEPT` links must resolve through the share page server-side logic
- The grand total box: table cell with `background: #f5f0e8; border: 2px solid #2d4a4a; border-radius: 8px; padding: 24px; text-align: center`
- This is the ONLY email that goes to the client. Make it count. No internal portal links.
- Mobile-first: test at 375px. Buttons must be at least 44px tall for thumb tap targets.

---

### 9. `client-accepted-confirmation.tsx` — After Client Accepts

**Recipient:** Client
**Trigger:** Client clicks Accept (or Accept button in portal)

**Props:**
```typescript
interface ClientAcceptedConfirmationProps {
  jobName: string;
  clientName: string;
  acceptedAmount: number;
  acceptedAt: string;
  clientSignature: string;
  pdfDownloadUrl: string;
  marcoPhone: string;
  marcoEmail: string;
}
```

**Subject:** `Confirmed: You've accepted the estimate for [jobName]`

**Layout:**
```
Thank you, [clientName]!

You've accepted the estimate for [jobName].

────────────────────────────
Amount accepted: $[acceptedAmount]
Accepted:        [formattedDateTime]
Signed as:       [clientSignature]
────────────────────────────

What's next:
  • Marco will contact you within 1 business day to schedule.
  • A copy of your accepted estimate is available below.

[DOWNLOAD YOUR ESTIMATE (PDF)]   ← gold button

Questions? Contact Marco:
Email: [marcoEmail]
Phone: [marcoPhone]

[Footer]
```

---

### 10. `client-reminder-3d.tsx` — 3-Day No-Open Reminder

**Recipient:** Client
**Trigger:** Scheduled job — 3 days after send, `email_verified_at` is still null

**Props:**
```typescript
interface ClientReminder3dProps {
  jobName: string;
  clientName: string;
  grandTotal: number;
  shareUrl: string;
  expiryDate: string;
}
```

**Subject:** `Following up on your estimate — [jobName]`

**Layout:**
```
Hi [clientName],

Just wanted to make sure you received the estimate for [jobName].

Your estimate total: $[grandTotal]

If you have any questions, just reply to this email — we're happy to walk through the details.

[VIEW YOUR ESTIMATE →]

This estimate is valid through [expiryDate].

[Footer]
```

---

### 11. `client-followup-7d.tsx` — 7-Day Opened-Not-Accepted Follow-up

**Recipient:** Client
**Trigger:** Scheduled job — 7 days after send, `email_verified_at IS NOT NULL` but not accepted

**Props:**
```typescript
interface ClientFollowup7dProps {
  jobName: string;
  clientName: string;
  grandTotal: number;
  shareUrl: string;
  acceptUrl: string;
  marcoPhone: string;
  expiryDate: string;
}
```

**Subject:** `Do you have any questions about your [jobName] estimate?`

**Layout:**
```
Hi [clientName],

I saw you had a chance to look over the estimate for [jobName] — thank you for taking the time.

If you have any questions or would like to discuss anything, I'm happy to help.
You can also call Marco directly at [marcoPhone].

$[grandTotal] — valid through [expiryDate]

[VIEW ESTIMATE →]
[ACCEPT THIS ESTIMATE →]

[Footer]
```

---

### 12. `client-expiring-soon.tsx` — 5-Day Expiry Warning

**Recipient:** Client
**Trigger:** Scheduled job — `expiry_date - 5 days`, not yet accepted

**Props:**
```typescript
interface ClientExpiringSoonProps {
  jobName: string;
  clientName: string;
  grandTotal: number;
  shareUrl: string;
  acceptUrl: string;
  expiryDate: string;        // the actual expiry date
}
```

**Subject:** `Your estimate expires in 5 days — [jobName]`

**Layout:**
```
[Amber notice bar: "Estimate valid through [expiryDate]"]

Hi [clientName],

Your estimate for [jobName] is valid through [expiryDate].

$[grandTotal]

No pressure — but if you'd like to lock in this price, you can accept below.

[VIEW ESTIMATE →]
[ACCEPT AND LOCK IN PRICE →]   ← gold button

[Footer]
```

**Notes:** Do NOT use "expires" language aggressively. Tone is professional, not pushy.

---

## Compose Panel Component

**File:** `src/components/portal/ComposePanel.tsx`

### Behavior
- Slide-in panel from right edge: `fixed inset-y-0 right-0 w-[480px] z-50`
- Backdrop overlay when open
- Triggered by "Send to Client" button on estimate detail page

### Props

```typescript
interface ComposePanelProps {
  estimateId: string;
  jobName: string;
  clientName: string;
  clientEmail?: string;      // pre-fill if known
  grandTotal: number;
  onClose: () => void;
  onSent: (result: SendResult) => void;
}

interface SendResult {
  shareToken: string;
  shareUrl: string;
  emailId: string;           // Resend email ID
  sentAt: string;
}
```

### State

```typescript
const [toEmail, setToEmail] = useState(clientEmail ?? '');
const [additionalCC, setAdditionalCC] = useState<string[]>([]);
const [subject, setSubject] = useState(`Estimate for ${jobName} — Saddlewood Contracting`);
const [personalMessage, setPersonalMessage] = useState('');
const [format, setFormat] = useState<EstimateFormat>('trade-summary');
const [sendMode, setSendMode] = useState<'now' | 'scheduled'>('now');
const [scheduledAt, setScheduledAt] = useState<string>('');
const [isSending, setIsSending] = useState(false);
const [previewOpen, setPreviewOpen] = useState(false);
```

### Format Options

```typescript
type EstimateFormat = 
  | 'trade-summary'    // "Trade Summary"
  | 'itemized'         // "Itemized"
  | 'single-total'     // "Single Total"
  | 'csi'              // "CSI"
  | 'scope';           // "Scope"
```

### Component Structure

```tsx
<div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
<div className="fixed inset-y-0 right-0 z-50 w-[480px] bg-white shadow-2xl
                flex flex-col overflow-hidden">

  {/* Header */}
  <div className="px-6 py-4 border-b flex items-center justify-between
                  bg-[#2d4a4a] text-white">
    <h2 className="text-sm font-semibold tracking-widest uppercase">
      Send Estimate to Client
    </h2>
    <button onClick={onClose}>✕</button>
  </div>

  {/* Scrollable form body */}
  <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

    {/* TO field */}
    <div>
      <label className="label">To</label>
      <div className="flex gap-2">
        <input type="email" value={toEmail} onChange={...}
          className="input flex-1" placeholder="client@email.com" />
        <button onClick={addCCField} title="Add CC">+</button>
      </div>
    </div>

    {/* Fixed CC */}
    <div>
      <label className="label">CC</label>
      <div className="rounded bg-gray-50 border px-3 py-2 text-sm text-gray-500">
        marco@saddlewoodcontracting.com
        <span className="ml-2 text-xs">(auto, cannot remove)</span>
      </div>
    </div>

    {/* Fixed BCC */}
    <div>
      <label className="label">BCC</label>
      <div className="rounded bg-gray-50 border px-3 py-2 text-sm text-gray-500">
        info@saddlewoodcontracting.com
        <span className="ml-2 text-xs">(auto, cannot remove)</span>
      </div>
    </div>

    {/* Additional CC if added */}
    {additionalCC.map((cc, i) => (
      <div key={i} className="flex gap-2">
        <input type="email" value={cc} onChange={...} className="input flex-1" />
        <button onClick={() => removeCC(i)}>✕</button>
      </div>
    ))}

    {/* Subject */}
    <div>
      <label className="label">Subject</label>
      <input type="text" value={subject} onChange={...} className="input w-full" />
    </div>

    {/* Personal Message */}
    <div>
      <label className="label">Personal Message</label>
      <textarea
        value={personalMessage}
        onChange={...}
        rows={3}
        className="input w-full resize-none"
        placeholder={`Hi ${clientName},\n\nPlease find your estimate attached...`}
      />
    </div>

    {/* Format selector */}
    <div>
      <label className="label">Format</label>
      <div className="space-y-1.5">
        {(['trade-summary','itemized','single-total','csi','scope'] as const).map(f => (
          <label key={f} className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="format" value={f}
              checked={format === f} onChange={() => setFormat(f)} />
            <span className="text-sm">{formatLabel(f)}</span>
          </label>
        ))}
      </div>
    </div>

    {/* Preview link */}
    <button
      onClick={() => setPreviewOpen(true)}
      className="text-sm text-[#2d4a4a] underline"
    >
      Preview Client Email →
    </button>

    {/* Send timing */}
    <div>
      <label className="label">Send</label>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="radio" name="sendMode" value="now"
            checked={sendMode === 'now'} onChange={() => setSendMode('now')} />
          <span className="text-sm">Now</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="radio" name="sendMode" value="scheduled"
            checked={sendMode === 'scheduled'} onChange={() => setSendMode('scheduled')} />
          <span className="text-sm">Schedule</span>
        </label>
      </div>
      {sendMode === 'scheduled' && (
        <input type="datetime-local" value={scheduledAt}
          onChange={e => setScheduledAt(e.target.value)}
          className="input mt-2 w-full" />
      )}
    </div>

  </div>

  {/* Sticky footer — Send button */}
  <div className="px-6 py-4 border-t bg-white">
    <button
      onClick={handleSend}
      disabled={!toEmail || isSending}
      className="w-full py-3 bg-[#2d4a4a] text-white font-semibold
                 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed
                 hover:bg-[#243c3c] transition-colors"
    >
      {isSending ? 'Sending...' : 'Send Estimate'}
    </button>
  </div>

</div>
```

### handleSend Flow

```typescript
async function handleSend() {
  setIsSending(true);
  try {
    // 1. Create export link
    const exportRes = await fetch(`/api/estimates/${estimateId}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientEmail: toEmail, format }),
    });
    const { token, shareUrl } = await exportRes.json();

    // 2. Send email
    const sendRes = await fetch(`/api/estimates/${estimateId}/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: toEmail,
        additionalCC,
        subject,
        personalMessage,
        format,
        shareToken: token,
        shareUrl,
        scheduledAt: sendMode === 'scheduled' ? scheduledAt : undefined,
      }),
    });
    const { emailId, sentAt } = await sendRes.json();

    onSent({ shareToken: token, shareUrl, emailId, sentAt });
  } finally {
    setIsSending(false);
  }
}
```

---

## Email Preview Route

**File:** `src/app/internal/estimates/[id]/email-preview/page.tsx`

### Purpose
Shows what the `client-delivery` email looks like before sending. Estimator clicks "Preview Client Email →" in ComposePanel — opens in new tab or in a modal iframe.

### Implementation

```tsx
// Server component — renders the React Email template as HTML
import { render } from '@react-email/render';
import { ClientDelivery } from '@/emails/client-delivery';
import { createClient } from '@/lib/supabase/server';

export default async function EmailPreviewPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: {
    to?: string;
    message?: string;
    format?: string;
  };
}) {
  const supabase = createClient();
  const { data: estimate } = await supabase
    .from('estimates')
    .select('*, projects(*)')
    .eq('id', params.id)
    .single();

  const html = render(
    <ClientDelivery
      jobName={estimate.projects.name}
      clientName={searchParams.to ? 'Client' : '[Client Name]'}
      grandTotal={estimate.grand_total}
      estimatorMessage={searchParams.message}
      shareUrl={`${process.env.NEXT_PUBLIC_APP_URL}/share/preview-token`}
      acceptUrl={`${process.env.NEXT_PUBLIC_APP_URL}/share/preview-token?action=accept`}
      expiryDate={estimate.valid_until}
      estimatorName="[Your Name]"
      marcoPhone="(XXX) XXX-XXXX"
    />
  );

  // Return raw HTML so browser renders it
  return new Response(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}
```

**Note:** This route must be inside a `(auth)` layout group or protected by middleware — never accessible without authentication.

---

## API Routes

### POST `/api/estimates/[id]/export`

**File:** `src/app/api/estimates/[id]/export/route.ts`

**Purpose:** Generate a secure share token and create/update an `export_links` row.

**Request Body:**
```typescript
{
  recipientEmail: string;
  format: EstimateFormat;
}
```

**Response:**
```typescript
{
  token: string;
  shareUrl: string;
  exportLinkId: string;
}
```

**Implementation:**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { nanoid } from 'nanoid';  // npm install nanoid

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { recipientEmail, format } = await req.json();

  // Validate estimate exists and user has access
  const { data: estimate, error } = await supabase
    .from('estimates')
    .select('id, valid_until, projects(name)')
    .eq('id', params.id)
    .single();
  if (error || !estimate) {
    return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });
  }

  // Generate token — 32 chars, URL-safe
  const token = nanoid(32);

  // Create export_links row
  // IMPORTANT: store recipient_email here so link-click can be tied to this email
  const { data: exportLink, error: insertError } = await supabase
    .from('export_links')
    .insert({
      estimate_id: params.id,
      token,
      format,
      recipient_email: recipientEmail,
      expires_at: estimate.valid_until,
      // email_verified_at: null  ← set on first link click
      // first_opened_at: null    ← set on first link click
      // view_count: 0
    })
    .select('id')
    .single();

  if (insertError) {
    return NextResponse.json({ error: 'Failed to create export link' }, { status: 500 });
  }

  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL}/share/${token}`;

  return NextResponse.json({
    token,
    shareUrl,
    exportLinkId: exportLink.id,
  });
}
```

**Required `export_links` table columns for this phase:**
```sql
ALTER TABLE export_links
  ADD COLUMN IF NOT EXISTS recipient_email     text,
  ADD COLUMN IF NOT EXISTS email_verified_at   timestamptz,
  ADD COLUMN IF NOT EXISTS first_opened_at     timestamptz,
  ADD COLUMN IF NOT EXISTS view_count          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS format              text;
```

---

### POST `/api/estimates/[id]/send-email`

**File:** `src/app/api/estimates/[id]/send-email/route.ts`

**Purpose:** Send the `client-delivery` email via Resend, fire internal notification (`estimate-sent-confirmation`), log to `email_log`.

**Request Body:**
```typescript
{
  to: string;
  additionalCC?: string[];
  subject: string;
  personalMessage?: string;
  format: EstimateFormat;
  shareToken: string;
  shareUrl: string;
  scheduledAt?: string;      // ISO datetime — if set, schedule via Resend
}
```

**Response:**
```typescript
{
  emailId: string;    // Resend email ID
  sentAt: string;     // ISO datetime
}
```

**Implementation:**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { createClient } from '@/lib/supabase/server';
import { ClientDelivery } from '@/emails/client-delivery';
import { EstimateSentConfirmation } from '@/emails/estimate-sent-confirmation';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const body = await req.json();
  const {
    to, additionalCC = [], subject, personalMessage,
    format, shareToken, shareUrl, scheduledAt
  } = body;

  // Fetch estimate details for email render
  const { data: estimate } = await supabase
    .from('estimates')
    .select('*, projects(name, client_name)')
    .eq('id', params.id)
    .single();

  // Fetch the current user (estimator) for estimatorName
  const { data: { user } } = await supabase.auth.getUser();
  const estimatorName = user?.user_metadata?.full_name ?? 'The Saddlewood Team';

  // Render client email HTML
  const clientHtml = render(
    <ClientDelivery
      jobName={estimate.projects.name}
      clientName={estimate.projects.client_name}
      grandTotal={estimate.grand_total}
      estimatorMessage={personalMessage}
      shareUrl={shareUrl}
      acceptUrl={`${shareUrl}?action=accept`}
      expiryDate={estimate.valid_until}
      estimatorName={estimatorName}
      marcoPhone={process.env.MARCO_PHONE ?? ''}
    />
  );

  // Build CC list: Marco always included, plus any additionalCC
  const cc = [
    process.env.MARCO_EMAIL!,
    ...additionalCC,
  ];
  const bcc = [process.env.RESEND_FROM_ADDRESS!];

  // Send via Resend
  const sendOptions: any = {
    from: `Saddlewood Contracting <${process.env.RESEND_FROM_ADDRESS}>`,
    to: [to],
    cc,
    bcc,
    subject,
    html: clientHtml,
    // reply_to: estimator email or Marco
  };

  if (scheduledAt) {
    sendOptions.scheduled_at = scheduledAt;  // Resend supports scheduled sends
  }

  const { data: resendData, error: resendError } = await resend.emails.send(sendOptions);
  if (resendError) {
    return NextResponse.json({ error: resendError.message }, { status: 500 });
  }

  const sentAt = new Date().toISOString();

  // Log to email_log
  await supabase.from('email_log').insert({
    estimate_id: params.id,
    resend_email_id: resendData.id,
    template: 'client-delivery',
    recipient: to,
    subject,
    format,
    share_token: shareToken,
    sent_at: sentAt,
    status: 'sent',
    // delivery_status updated via webhook
  });

  // Fire internal confirmation email to Marco
  const confirmHtml = render(
    <EstimateSentConfirmation
      jobName={estimate.projects.name}
      estimateId={params.id}
      clientName={estimate.projects.client_name}
      clientEmail={to}
      sentAt={sentAt}
      formatChosen={format}
      shareUrl={shareUrl}
      clientViewUrl={shareUrl}
    />
  );

  await resend.emails.send({
    from: `Saddlewood Portal <${process.env.RESEND_FROM_ADDRESS}>`,
    to: [process.env.MARCO_EMAIL!],
    subject: `Estimate sent to ${estimate.projects.client_name} — ${estimate.projects.name}`,
    html: confirmHtml,
  });

  return NextResponse.json({ emailId: resendData.id, sentAt });
}
```

**Required `email_log` table columns:**
```sql
CREATE TABLE IF NOT EXISTS email_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id      uuid REFERENCES estimates(id),
  resend_email_id  text,
  template         text NOT NULL,
  recipient        text NOT NULL,
  subject          text,
  format           text,
  share_token      text,
  sent_at          timestamptz DEFAULT now(),
  status           text DEFAULT 'sent',    -- sent | delivered | bounced | complained
  delivery_status  text,                   -- updated via webhook
  opened_at        timestamptz,            -- updated via webhook if tracking enabled
  created_at       timestamptz DEFAULT now()
);
```

---

### GET `/api/share/[token]`

**File:** `src/app/api/share/[token]/route.ts`

**Purpose:**
This is called server-side (from the share page `src/app/share/[token]/page.tsx`) to validate the token, record first open, and trigger email verification.

**Implementation:**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const supabase = createClient();  // server-side, service role for write
  const { token } = params;

  // 1. Look up export link
  const { data: link, error } = await supabase
    .from('export_links')
    .select('*, estimates(*, projects(*))')
    .eq('token', token)
    .eq('revoked', false)
    .single();

  if (error || !link) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
  }

  // 2. Check expiry
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This estimate link has expired' }, { status: 410 });
  }

  const now = new Date().toISOString();
  const updates: Record<string, any> = {};

  // 3. Email verification: first click = verified
  if (!link.email_verified_at) {
    updates.email_verified_at = now;
  }

  // 4. First open tracking
  if (!link.first_opened_at) {
    updates.first_opened_at = now;
  }

  // 5. Increment view count (always)
  updates.view_count = (link.view_count ?? 0) + 1;

  // Apply updates
  if (Object.keys(updates).length > 0) {
    await supabase
      .from('export_links')
      .update(updates)
      .eq('id', link.id);
  }

  // 6. If this is the first open AND view_count was 0, fire "viewed" notification
  const isFirstOpen = !link.first_opened_at;
  if (isFirstOpen) {
    // Fire-and-forget: notify Marco + estimator
    // (fetch internal API or call a queue — keep this non-blocking)
    fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/internal/notify-viewed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        estimateId: link.estimate_id,
        clientName: link.estimates.projects.client_name,
        openedAt: now,
        viewCount: updates.view_count,
      }),
    }).catch(() => {}); // non-blocking
  }

  // 7. Return estimate data for the share page to render
  return NextResponse.json({
    estimate: link.estimates,
    link: {
      id: link.id,
      format: link.format,
      email_verified_at: updates.email_verified_at ?? link.email_verified_at,
      view_count: updates.view_count,
    },
  });
}
```

**Note:** The share page `src/app/share/[token]/page.tsx` should call this API route (or use the same Supabase logic inline) as a Server Component so it runs on the server. Do NOT call this from client-side JavaScript — the verification must happen at page load, not on a button click.

---

## Email Verification Logic

### Design Decision Recap

When the client clicks "VIEW YOUR ESTIMATE" in the delivery email (template 8), the browser navigates to `https://saddlewoodcontracting.com/share/[token]`. This URL is unique to the email sent to the client. Only someone who received that email can have that token.

Therefore: clicking the link proves the client owns (or has access to) the inbox that received the email. This is equivalent to clicking a "verify your email" link.

### Exact Implementation

1. **At send time** (`POST /api/estimates/[id]/export`):
   - Row created in `export_links` with `token`, `recipient_email = toEmail`, `email_verified_at = NULL`

2. **At link click** (`GET /share/[token]` page server component or API route):
   - Query `export_links WHERE token = $1`
   - If `email_verified_at IS NULL` → `UPDATE export_links SET email_verified_at = NOW() WHERE id = $2`
   - This update happens on the server during SSR — before the page is delivered to the browser

3. **At acceptance** (when client clicks Accept):
   - Server checks: `SELECT email_verified_at FROM export_links WHERE token = $1`
   - If `email_verified_at IS NULL` → reject acceptance with message "Please open the estimate link first before accepting"
   - (This case should be rare — they had to open the page to see the Accept button — but guard it defensively)
   - Acceptance record: `INSERT INTO acceptances (export_link_id, ...) VALUES (link.id, ...)`
   - `export_links.id` carries the `recipient_email` → acceptance is traceable to the verified email

4. **RLS note:** The `export_links` table update (setting `email_verified_at`) must use the service role key or a Postgres function with `SECURITY DEFINER` — the share page is unauthenticated (no user session).

### Database function for atomic verification + view count

```sql
-- Creates an atomic function to avoid race conditions on first open
CREATE OR REPLACE FUNCTION record_share_link_view(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_link export_links%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_link FROM export_links
    WHERE token = p_token AND revoked = false
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < v_now THEN
    RETURN json_build_object('error', 'expired');
  END IF;

  UPDATE export_links SET
    email_verified_at = COALESCE(v_link.email_verified_at, v_now),
    first_opened_at   = COALESCE(v_link.first_opened_at, v_now),
    view_count        = v_link.view_count + 1
  WHERE id = v_link.id;

  RETURN json_build_object(
    'estimate_id',       v_link.estimate_id,
    'format',            v_link.format,
    'is_first_open',     v_link.first_opened_at IS NULL,
    'was_unverified',    v_link.email_verified_at IS NULL,
    'view_count',        v_link.view_count + 1
  );
END;
$$;
```

Call this from the server using `supabase.rpc('record_share_link_view', { p_token: token })`.

---

## Resend Webhook Setup

**File:** `src/app/api/webhooks/resend/route.ts`

**Purpose:** Receive delivery status updates (delivered, bounced, complained, opened) and update `email_log`.

### Setup Steps (resend.com dashboard)
1. Go to Resend → Webhooks → Add endpoint
2. URL: `https://saddlewoodcontracting.com/api/webhooks/resend`
3. Events to subscribe: `email.delivered`, `email.bounced`, `email.complained`, `email.opened` (if tracking enabled)
4. Copy the signing secret → `RESEND_WEBHOOK_SECRET` env var

### Implementation

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';  // Resend uses Svix for webhook verification
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const headers = {
    'svix-id':        req.headers.get('svix-id') ?? '',
    'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
    'svix-signature': req.headers.get('svix-signature') ?? '',
  };

  let event: any;
  try {
    const wh = new Webhook(process.env.RESEND_WEBHOOK_SECRET!);
    event = wh.verify(body, headers);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = createClient();
  const emailId = event.data?.email_id;

  if (!emailId) return NextResponse.json({ ok: true });

  const statusMap: Record<string, string> = {
    'email.delivered':  'delivered',
    'email.bounced':    'bounced',
    'email.complained': 'complained',
    'email.opened':     'opened',
  };

  const status = statusMap[event.type];
  if (!status) return NextResponse.json({ ok: true });

  await supabase
    .from('email_log')
    .update({
      delivery_status: status,
      ...(status === 'opened' ? { opened_at: new Date().toISOString() } : {}),
    })
    .eq('resend_email_id', emailId);

  return NextResponse.json({ ok: true });
}
```

**Dependencies to install:**
```bash
npm install svix
```

---

## Testing Checklist

### Setup
- [ ] Run `npm install @react-email/components @react-email/render resend nanoid svix`
- [ ] Set all ENV vars in `.env.local` and Vercel project settings
- [ ] Run `npx react-email dev` — opens email preview server at localhost:3000
- [ ] Verify SPF/DKIM for `saddlewoodcontracting.com` in Resend dashboard (Domain → Settings → DNS)

### Email Rendering
- [ ] Each template renders without errors in `npx react-email dev`
- [ ] All 12 templates display correctly at 600px (desktop) and 375px (mobile)
- [ ] Send test of each template to a real inbox (Gmail, Apple Mail)
- [ ] Test `client-delivery` in Outlook via Litmus or Email on Acid — especially button rendering

### Link and Token Tests
- [ ] Export API creates `export_links` row with correct `recipient_email`
- [ ] Share URL resolves to correct estimate
- [ ] Clicking share link sets `email_verified_at` (check Supabase table directly)
- [ ] `view_count` increments on each visit
- [ ] `first_opened_at` set only once even with multiple visits
- [ ] Expired token returns 410 response
- [ ] Revoked token returns 404 response

### Send Flow
- [ ] ComposePanel: subject auto-populates from job name
- [ ] Marco always in CC, cannot be removed
- [ ] BCC silently goes to `info@saddlewoodcontracting.com`
- [ ] Preview button renders live `client-delivery` template in new tab
- [ ] Scheduled send: verify Resend queues it (check Resend dashboard)
- [ ] After send: `email_log` row created with `resend_email_id`
- [ ] After send: Marco receives `estimate-sent-confirmation` email

### Webhook
- [ ] Simulate delivery webhook via Resend dashboard → `email_log.delivery_status` updates
- [ ] Simulate bounce → status updates to `bounced`

### Email Verification + Acceptance
- [ ] Client opens share link → `email_verified_at` set
- [ ] Client accepts without opening first → rejected with appropriate error
- [ ] Accepted estimate references correct `export_links.id` (and thus `recipient_email`)

### Internal Notifications
- [ ] Marco receives `estimate-ready` when new estimate created (wire up to estimate creation flow)
- [ ] Estimator receives `estimate-approved-internal` when Marco approves
- [ ] Estimator receives `estimate-changes-requested` with correct change items
- [ ] Both Marco and estimator receive `estimate-viewed-by-client` on first open
- [ ] Both receive `estimate-accepted` when client accepts

---

## Common Pitfalls

### Email Client CSS Support
- **No flexbox** — use `<table>` for all layout. `display: flex` is ignored in Outlook (Windows).
- **No CSS Grid** — same reason.
- **No `<div>` for layout** — Outlook ignores most div-level styling. Use `<table>/<tr>/<td>`.
- **No CSS variables** — inline all styles. `var(--color-teal)` will not work.
- **No shorthand `padding`** on `<td>` in some clients — use `padding-top`, `padding-right`, etc. individually.
- **No `border-radius` in Outlook** — buttons will look square in Outlook desktop. Acceptable.
- **Use `role="presentation"` on layout tables** — assistive technology skips layout tables.
- **`<img>` must have `width` and `height` attributes** — prevents layout shift and broken rendering.
- **Fonts:** Inter won't render in most email clients — always list system font fallbacks: `Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif`.
- **Fraunces headings:** Fraunces is a web font. In emails, use `Georgia, 'Times New Roman', serif` as the heading font fallback. Most email clients will render Georgia.

### Image Hosting for Logo
- The Saddlewood logo must be hosted at a public URL — NOT a relative path, NOT a local file.
- Host at: `https://saddlewoodcontracting.com/logo-email.png`
- Provide both a full-color version (for white/cream backgrounds) and a white version (for teal header).
- Logo dimensions: max 200px wide, 48px tall — keep file size under 50KB.
- Gmail will block images from unknown senders by default — always include `alt` text.

### SPF/DKIM Must Be Verified
- **Required** before sending real client emails. Without this, emails land in spam.
- In Resend dashboard: Domains → Add Domain → `saddlewoodcontracting.com` → follow DNS instructions.
- Add the TXT records to DNS (wherever the domain is managed — GoDaddy, Cloudflare, etc.).
- Verification can take up to 48 hours for DNS propagation.
- Test with: `nslookup -type=TXT _resend._domainkey.saddlewoodcontracting.com`

### Resend Rate Limits
- Free tier: 100 emails/day. Production: check current plan.
- Internal notification emails (to Marco/estimator) count against the limit.
- Deduplicate: if both Marco and estimator are the same person, send one email.

### React Email Render Function
- `render()` from `@react-email/render` is synchronous in v0.0.x, async in newer versions.
- Check the installed version: `npm list @react-email/render`
- If async: `const html = await render(<Component {...props} />)`

### Supabase Service Role for Unauthenticated Share Pages
- The share page at `/share/[token]` has no user session.
- The `export_links` update (setting `email_verified_at`) requires write access.
- Use `createClient()` with the `SERVICE_ROLE_KEY` for the server-side share route — never expose this to the browser.
- Add RLS policy: allow `SELECT` on `export_links` for anon role (token is the auth), but `UPDATE` only via service role or SECURITY DEFINER function.

### Token Security
- `nanoid(32)` generates ~160 bits of entropy — sufficient for this use case.
- Tokens should not be logged in application logs.
- Set `revoked = true` on `export_links` when an estimate is deleted or superseded.
- Tokens are single-estimate-use — do not reuse tokens across different estimates.

### Compose Panel: `personalMessage` XSS
- The estimator's personal message is inserted into the email HTML via `@react-email` — React's JSX escapes string content by default, so `{personalMessage}` in JSX is safe.
- Do NOT use `dangerouslySetInnerHTML` with this field.

---

## Implementation Order

1. Install dependencies
2. Add DB migrations (`export_links` columns, `email_log` table, `record_share_link_view` function)
3. Build `EmailLayout`, `EmailButton`, shared components
4. Build all 12 templates (start with `client-delivery` — most complex, most important)
5. Set up `npx react-email dev` and verify all templates visually
6. Build `POST /api/estimates/[id]/export`
7. Build `POST /api/estimates/[id]/send-email`
8. Build/update `GET /api/share/[token]` (or share page server component) for verification logic
9. Build `ComposePanel`
10. Build email preview route
11. Wire up `ComposePanel` to estimate detail page
12. Set up Resend webhook
13. Run full end-to-end test
