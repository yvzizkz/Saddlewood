# Phase 9 — E-Signature: Dropbox Sign Integration

**Status:** Optional upgrade — implement when triggers are met (see §13)
**Target project:** Saddlewood Contracting LLC — internal estimate review portal
**Stack:** Next.js 16.1.6 (App Router), TypeScript strict, Supabase, Resend
**Depends on:** Phase 5 (compose panel), Phase 6 (typed-name acceptance flow), Phase 7 (PDF/DOCX export)

---

## 1. Phase Goal

Replace the Phase 6 typed-name acceptance flow with a Dropbox Sign-hosted signature request for estimates that require a legally executed proposal. Phase 6 remains the default — this phase adds a per-estimate opt-in toggle that routes the send and acceptance flow through Dropbox Sign when enabled.

**Implementation triggers (any one is sufficient):**
- Estimate total exceeds $500,000
- Client or GC explicitly requests a countersigned formal proposal
- Project is a commercial GC subcontract where a signed sub proposal is contractually required

---

## 2. Success Criteria

- [ ] `npm run build` exits 0 with no TypeScript errors
- [ ] "E-signature required (Dropbox Sign)" toggle appears in the compose panel only when estimate total > $500K or manually forced on
- [ ] Toggle state persists to `export_links.use_esignature` on save/send
- [ ] "E-SIGNATURE REQUIRED" badge renders on the review page estimate header when `use_esignature = true`
- [ ] Clicking "Send to Client" with toggle ON calls Dropbox Sign API and stores `dropbox_sign_signature_request_id` and `dropbox_sign_signing_url` in `export_links`
- [ ] Client email CTA links to Dropbox Sign signing URL, not the portal share link
- [ ] Client can sign on mobile (Responsive Signer Experience) without creating a Dropbox account
- [ ] `POST /api/webhooks/dropbox-sign` receives `signature_request_signed` event, verifies HMAC, updates `acceptance_records`, and triggers Marco notification email
- [ ] `signed_document_url` is stored in `acceptance_records` after signing
- [ ] Activity log records `esignature_sent`, `esignature_viewed`, and `esignature_signed` events
- [ ] If Dropbox Sign API is unreachable at send time, the system falls back gracefully (see §11)
- [ ] With toggle OFF (or absent), Phase 6 typed-name flow is completely unchanged
- [ ] Sandbox mode does not consume production signing quota
- [ ] No `DROPBOX_SIGN_API_KEY` exposure in client-side JS

---

## 3. Dropbox Sign API Authentication

### API Key Setup

Sign up at https://app.hellosign.com and obtain an API key from:
**Account Settings → API → API Keys → Create Key**

Dropbox Sign uses HTTP Basic Auth where the API key is the username and the password is empty:

```
Authorization: Basic <base64(API_KEY + ":")>
```

In practice, use the official SDK which handles this automatically.

### SDK Installation

```bash
npm install @dropbox/sign
```

### Server-Side API Client

File: `src/lib/dropbox-sign.ts`

```typescript
import * as HellosignSDK from "@dropbox/sign";

// Singleton — instantiated once, reused across server actions
let _client: HellosignSDK.SignatureRequestApi | null = null;

export function getDropboxSignClient(): HellosignSDK.SignatureRequestApi {
  if (!_client) {
    const config = HellosignSDK.createConfiguration({
      username: process.env.DROPBOX_SIGN_API_KEY ?? "",
    });
    _client = new HellosignSDK.SignatureRequestApi(config);
  }
  return _client;
}
```

**Env var (server-only, never prefixed with NEXT_PUBLIC_):**
```
DROPBOX_SIGN_API_KEY=<from Dropbox Sign dashboard>
```

Add to `.env.local` for dev, Vercel environment variables for prod. Add to `.env.example` with a placeholder value.

---

## 4. Document Upload Flow

Dropbox Sign accepts document uploads inline with signature request creation — there is no separate upload step. The document is passed as a `File` object (multipart form) or as a base64-encoded string in the request body.

### Preferred Approach: Inline PDF Upload

Phase 7 already generates a PDF/DOCX export. At send time, call the existing export function server-side to get a `Buffer`, then pass it directly to the API call.

```typescript
// src/actions/send-estimate-esign.ts (server action)
import { generateEstimatePdf } from "@/lib/pdf-generator"; // Phase 7 function
import { getDropboxSignClient } from "@/lib/dropbox-sign";

const pdfBuffer = await generateEstimatePdf(estimateId);
// pdfBuffer is a Buffer — pass as File to the SDK
const pdfFile = new File([pdfBuffer], `estimate-${estimateId}.pdf`, {
  type: "application/pdf",
});
```

### Document Naming Convention

`estimate-{estimate_id}-{client_slug}-{YYYYMMDD}.pdf`

Example: `estimate-ee4b2a-saddlewood-ridge-20260513.pdf`

---

## 5. Signature Request Creation

### API Call Spec

**Endpoint:** `POST /v3/signature_request/send`
**SDK method:** `signatureRequestApi.signatureRequestSend(...)`

```typescript
import * as HellosignSDK from "@dropbox/sign";

async function createSignatureRequest({
  estimateId,
  clientName,
  clientEmail,
  marcoEmail,
  estimateTitle,
  estimateTotal,
  pdfFile,
  signingRedirectUrl,
}: CreateSignatureRequestParams): Promise<{
  signatureRequestId: string;
  signingUrl: string;
}> {
  const client = getDropboxSignClient();

  const signingRequest: HellosignSDK.SignatureRequestSendRequest = {
    title: `Proposal: ${estimateTitle}`,
    subject: `Please sign: ${estimateTitle} — ${formatCurrency(estimateTotal)}`,
    message: `Hi ${clientName}, please review and sign the attached proposal. This link expires in 30 days.`,
    signers: [
      {
        emailAddress: clientEmail,
        name: clientName,
        order: 0,
      },
    ],
    ccEmailAddresses: [marcoEmail],
    files: [pdfFile],
    metadata: {
      estimate_id: estimateId,
      source: "saddlewood-portal",
    },
    signingRedirectUrl,   // portal URL to return to after signing
    testMode: process.env.NODE_ENV !== "production", // no charge in test mode
  };

  const response = await client.signatureRequestSend(signingRequest);
  const sigRequest = response.body.signatureRequest;

  // The signing URL for the first (and only) signer
  const signerInfo = sigRequest?.signatures?.[0];
  if (!signerInfo?.signatureId) {
    throw new Error("Dropbox Sign did not return a signature ID");
  }

  // Retrieve the embedded sign URL (or use the direct sign_url from the response)
  const signingUrl = sigRequest?.signingUrl ?? "";

  return {
    signatureRequestId: sigRequest?.signatureRequestId ?? "",
    signingUrl,
  };
}
```

### Required Fields Summary

| Field | Value |
|---|---|
| `title` | `"Proposal: {estimateTitle}"` |
| `subject` | Subject line of Dropbox Sign's own email (not our Resend email) |
| `message` | Body copy of Dropbox Sign's email |
| `signers[0].emailAddress` | Client email |
| `signers[0].name` | Client full name |
| `signers[0].order` | `0` (only signer) |
| `ccEmailAddresses` | `[marco@saddlewoodcontracting.com]` |
| `files` | PDF buffer as `File` |
| `metadata.estimate_id` | Used to correlate webhook events back to the estimate |
| `signingRedirectUrl` | `https://{PORTAL_DOMAIN}/share/{token}?signed=1` |
| `testMode` | `true` in non-production (free, no quota consumed) |

### Post-Creation DB Update

After the API call succeeds, immediately update the `export_links` row:

```sql
UPDATE export_links
SET
  dropbox_sign_signature_request_id = $1,
  dropbox_sign_signing_url           = $2,
  updated_at                         = now()
WHERE id = $3;
```

---

## 6. Webhook Handler

### File Location

`src/app/api/webhooks/dropbox-sign/route.ts`

### Webhook Registration

In Dropbox Sign dashboard: **API → Webhooks → Add Callback URL**
URL: `https://{PORTAL_DOMAIN}/api/webhooks/dropbox-sign`

Subscribe to events:
- `signature_request_signed` — required
- `signature_request_viewed` — for activity log
- `signature_request_sent` — for activity log confirmation

### HMAC Verification

Dropbox Sign signs each webhook payload with the account's API key using SHA-256. The hash is sent in the `X-HelloSign-Signature` header (note: header name is still `HelloSign` even after the rebrand).

```typescript
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

function verifyDropboxSignWebhook(
  rawBody: string,
  signature: string
): boolean {
  const apiKey = process.env.DROPBOX_SIGN_API_KEY ?? "";
  const expected = crypto
    .createHmac("sha256", apiKey)
    .update(rawBody)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(signature, "hex")
  );
}
```

Note: Dropbox Sign does not send a separate webhook secret — it reuses the API key for HMAC. Keep `DROPBOX_SIGN_API_KEY` server-only and treat it as both the API credential and the webhook verification key.

### Full Handler

```typescript
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hellosign-signature") ?? "";

  if (!verifyDropboxSignWebhook(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Dropbox Sign wraps the event in a "json" form field
  const formData = new URLSearchParams(rawBody);
  const payload = JSON.parse(formData.get("json") ?? "{}");
  const event = payload?.event;
  const sigRequest = payload?.signature_request;

  if (!event || !sigRequest) {
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  const estimateId: string = sigRequest?.metadata?.estimate_id ?? "";
  const eventType: string = event?.event_type ?? "";

  switch (eventType) {
    case "signature_request_sent":
      await logEstimateActivity(estimateId, "esignature_sent");
      break;

    case "signature_request_viewed":
      await logEstimateActivity(estimateId, "esignature_viewed");
      break;

    case "signature_request_signed": {
      // 1. Mark acceptance record
      const signedDocUrl: string =
        sigRequest?.signingUrl ?? ""; // replace with final_copy_uri after download if needed
      await createAcceptanceRecord({
        estimateId,
        signedDocumentUrl: signedDocUrl,
        signatureRequestId: sigRequest?.signatureRequestId ?? "",
        acceptedAt: new Date(event.event_time * 1000).toISOString(),
      });

      // 2. Update estimate status to "accepted"
      await markEstimateAccepted(estimateId);

      // 3. Activity log
      await logEstimateActivity(estimateId, "esignature_signed");

      // 4. Notify Marco + estimator via Resend (reuse Phase 6 "estimate-accepted" email template)
      await sendAcceptanceNotifications(estimateId);
      break;
    }

    default:
      // Unknown event type — ignore but acknowledge
      break;
  }

  // Dropbox Sign requires "Hello API Event Received" as the response body
  return new NextResponse("Hello API Event Received", { status: 200 });
}
```

### Helper Functions (new in this phase)

All live in `src/lib/esignature-helpers.ts`:

- `logEstimateActivity(estimateId, eventType)` — inserts into `activity_log`
- `createAcceptanceRecord({ estimateId, signedDocumentUrl, signatureRequestId, acceptedAt })` — upserts `acceptance_records`
- `markEstimateAccepted(estimateId)` — updates `estimates.status = 'accepted'`
- `sendAcceptanceNotifications(estimateId)` — calls existing Resend `estimate-accepted` email action

---

## 7. Compose Panel Toggle UI

### Where It Lives

File: `src/components/internal/compose-panel.tsx` (Phase 5)

### When the Toggle Appears

```typescript
const showEsignToggle =
  estimateTotal >= 500_000 || manualEsignOverride;
```

`manualEsignOverride` is a local state boolean that can be toggled via a "Force e-signature" link (admin-only, hidden behind `process.env.NODE_ENV !== "production"` OR a feature flag in Supabase `app_config`).

### Toggle Markup (Tailwind)

```tsx
{showEsignToggle && (
  <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
    <Switch
      id="esign-toggle"
      checked={useEsignature}
      onCheckedChange={setUseEsignature}
    />
    <label htmlFor="esign-toggle" className="text-sm font-medium text-amber-900">
      E-signature required (Dropbox Sign)
    </label>
    <span className="ml-auto text-xs text-amber-700">$1.50/signature</span>
  </div>
)}
```

Use `shadcn/ui` Switch component (already present if installed in Phase 5; otherwise add with `npx shadcn@latest add switch`).

### What Changes in the Send Flow When Toggle Is ON

**Normal send flow (Phase 6):**
1. Insert `export_links` row
2. Compose email with "REVIEW ESTIMATE" CTA linking to `/share/{token}`
3. Send via Resend

**E-sign send flow (Phase 9):**
1. Insert `export_links` row with `use_esignature = true`
2. Generate PDF server-side
3. Call Dropbox Sign API → get `signatureRequestId` + `signingUrl`
4. Update `export_links` with both values
5. Compose email with "SIGN THIS ESTIMATE" CTA linking to `signingUrl`
6. Send via Resend
7. Log `esignature_sent` to activity log

The `use_esignature` flag is read in the send server action to branch between these two flows:

```typescript
if (exportLink.use_esignature) {
  return sendWithEsign(exportLink, estimate, client);
} else {
  return sendWithTypedName(exportLink, estimate, client); // Phase 6 path
}
```

---

## 8. Client Experience Difference

### With Typed Name (Phase 6 — default)

1. Client receives email with "REVIEW ESTIMATE" button
2. Client lands on `/share/{token}` — the portal review page
3. Client reads the estimate in the portal UI
4. Client types their full name in an input field
5. Client clicks "Accept & Authorize" — writes to `acceptance_records`
6. Confirmation state shown inline on the portal page

### With E-Signature (Phase 9 — opt-in)

1. Client receives email with "SIGN THIS ESTIMATE" button
2. Client is taken directly to Dropbox Sign's hosted signing page (no portal login required)
3. Dropbox Sign's "Responsive Signer Experience" renders on mobile — guided step-by-step signing
4. Client draws or types their signature, initials where required, clicks "I Agree"
5. Dropbox Sign sends a completion email to client with a PDF copy
6. Client is redirected back to `/share/{token}?signed=1` — portal shows "Thank you, your signed proposal has been received" state
7. Marco receives a notification email and can download the signed PDF from the portal

**Key differences visible to the client:**
- No portal account or login needed in either flow
- E-sign: client goes offsite to Dropbox Sign (reassuringly professional)
- E-sign: client receives a completed PDF copy automatically from Dropbox Sign
- E-sign: legally binding (ESIGN Act / UETA compliant)
- Typed name: stays on portal, faster, sufficient for smaller jobs

---

## 9. Per-Estimate Toggle Persistence

### Storage

The toggle state lives on the `export_links` row for that estimate:

```
export_links.use_esignature BOOLEAN DEFAULT false
```

A single estimate can have only one active export link at a time (Phase 5 logic). The `use_esignature` column is set at the moment the estimator clicks "Send to Client."

### How It Is Read

**Compose panel load:** When the compose panel opens, it reads the existing `export_links` row (if any) and pre-populates the toggle:

```typescript
const { data: existingLink } = await supabase
  .from("export_links")
  .select("use_esignature")
  .eq("estimate_id", estimateId)
  .maybeSingle();

setUseEsignature(existingLink?.use_esignature ?? false);
```

**At send time:** The server action reads `export_links.use_esignature` to determine routing — it does NOT trust a client-supplied boolean from the form.

**On the review page:** The review page reads `export_links.use_esignature` to decide whether to show the typed-name acceptance UI or the "awaiting e-signature" state:

```typescript
if (exportLink.use_esignature) {
  return <EsignatureStatus signatureRequestId={exportLink.dropbox_sign_signature_request_id} />;
} else {
  return <TypedNameAcceptance token={token} />; // Phase 6 component
}
```

---

## 10. Database Migrations

Run these migrations in order. Apply via Supabase migrations (`supabase/migrations/`) or the Supabase dashboard SQL editor.

### Migration 001 — Add e-signature columns to export_links

```sql
-- Migration: add_esignature_to_export_links
-- Description: Adds Dropbox Sign fields to export_links for Phase 9 e-signature flow

ALTER TABLE export_links
  ADD COLUMN IF NOT EXISTS use_esignature                      BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dropbox_sign_signature_request_id   TEXT,
  ADD COLUMN IF NOT EXISTS dropbox_sign_signing_url             TEXT;

COMMENT ON COLUMN export_links.use_esignature IS
  'When true, this estimate uses Dropbox Sign instead of the Phase 6 typed-name acceptance.';

COMMENT ON COLUMN export_links.dropbox_sign_signature_request_id IS
  'Dropbox Sign signature_request_id returned by POST /v3/signature_request/send.';

COMMENT ON COLUMN export_links.dropbox_sign_signing_url IS
  'Direct signing URL returned by Dropbox Sign for the first (and only) signer.';
```

### Migration 002 — Add signed_document_url to acceptance_records

```sql
-- Migration: add_signed_document_url_to_acceptance_records
-- Description: Stores Dropbox Sign final copy URL after a signature is completed

ALTER TABLE acceptance_records
  ADD COLUMN IF NOT EXISTS signed_document_url TEXT;

COMMENT ON COLUMN acceptance_records.signed_document_url IS
  'URL to download the fully signed PDF from Dropbox Sign. Populated by the webhook handler on signature_request_signed.';
```

### Migration 003 — Extend activity_log event_type check constraint

If `activity_log.event_type` has a `CHECK` constraint (verify with `\d activity_log`):

```sql
-- Add new e-signature event types to existing check constraint
-- First drop the old constraint (name may differ — check with \d activity_log)
ALTER TABLE activity_log
  DROP CONSTRAINT IF EXISTS activity_log_event_type_check;

ALTER TABLE activity_log
  ADD CONSTRAINT activity_log_event_type_check CHECK (
    event_type IN (
      -- existing Phase 6 types:
      'estimate_sent',
      'estimate_viewed',
      'estimate_accepted',
      'estimate_declined',
      -- new Phase 9 types:
      'esignature_sent',
      'esignature_viewed',
      'esignature_signed'
    )
  );
```

If there is no check constraint, skip Migration 003.

---

## 11. Fallback Handling

### Scenario: Dropbox Sign API is unreachable at send time

The estimator clicks "Send to Client" with e-sign ON. The Dropbox Sign `POST /v3/signature_request/send` call fails (timeout, 5xx, network error).

**Do not fall back silently to typed-name.** A silent fallback would send the client an email without the e-signature they (or the GC) require. This is a legal/contract risk.

**Instead:**

```typescript
try {
  const { signatureRequestId, signingUrl } = await createSignatureRequest(...);
  // proceed with send
} catch (err) {
  // Do NOT send the email
  // Return a structured error to the compose panel
  return {
    ok: false,
    error: "dropbox_sign_unavailable",
    message:
      "Dropbox Sign is temporarily unavailable. The estimate was NOT sent. " +
      "Try again in a few minutes, or disable e-signature to send with typed-name acceptance.",
  };
}
```

The compose panel displays this error inline (red banner) so the estimator can decide:
- Retry (try sending again)
- Disable the toggle and send with typed-name acceptance

### Scenario: Dropbox Sign API key is missing or invalid

On application boot (or in the send action), check:

```typescript
if (!process.env.DROPBOX_SIGN_API_KEY) {
  throw new Error(
    "DROPBOX_SIGN_API_KEY is not set. Cannot create signature request."
  );
}
```

The compose panel will not show the e-sign toggle if the key is missing (check with a server action that probes for the env var — never expose the check result to the client beyond a boolean `esignEnabled`).

### Scenario: Webhook delivery fails

Dropbox Sign retries failed webhooks for up to 3 days with exponential backoff. The acceptance record will be created when the webhook eventually arrives. No manual recovery needed.

If 3 days pass without webhook delivery (network issue, wrong URL configured), manual recovery: use Dropbox Sign dashboard to download the signed document and manually update `acceptance_records` via Supabase dashboard.

---

## 12. Testing Plan

### Sandbox Mode

Set `testMode: true` in all non-production API calls (already handled by `process.env.NODE_ENV !== "production"` check in §5). In test mode, signatures are not charged against the plan quota.

**Sandbox test credentials:**
- In Dropbox Sign sandbox, use any email — signing is simulated
- Sandbox signing: log into Dropbox Sign sandbox as the signer and click "Sign" — no real signature pad required
- Use `test-mode: 1` on the API key or a separate sandbox API key (available in the dashboard under "Test Mode")

### Recommended Test Sequence

1. **Unit test the HMAC verifier**
   - Mock a known payload + signature → verify `verifyDropboxSignWebhook` returns `true`
   - Tamper with the payload → verify it returns `false`
   - File: `src/lib/__tests__/esignature-helpers.test.ts`

2. **Integration test the signature request creation**
   - Use the sandbox API key
   - Upload a 1-page test PDF
   - Confirm `signatureRequestId` and `signingUrl` are returned
   - Confirm `export_links` row is updated in the local Supabase instance

3. **End-to-end webhook test via ngrok**
   - Run `ngrok http 3000` to get a public tunnel
   - Register the ngrok URL as the Dropbox Sign webhook callback temporarily
   - Trigger a signature in the sandbox
   - Verify the webhook hits `/api/webhooks/dropbox-sign`, HMAC passes, and `acceptance_records` is created
   - Verify Marco's notification email is dispatched (check Resend logs)

4. **Mobile signing UX test**
   - Send a sandbox signature request to your own email
   - Open the signing URL on an iPhone browser
   - Verify the Responsive Signer Experience renders correctly
   - Complete the signature and confirm redirect back to `/share/{token}?signed=1`

5. **Fallback test**
   - Set `DROPBOX_SIGN_API_KEY` to an invalid value in `.env.local`
   - Click "Send to Client" with e-sign toggle ON
   - Confirm the compose panel shows the error banner, NOT an email send confirmation
   - Confirm no email is sent (check Resend logs — no request should appear)

### Test Estimates for QA

Create two test estimates in the portal:
- `TEST-ESIGN-001`: total = $750,000 (auto-triggers toggle visibility)
- `TEST-ESIGN-002`: total = $200,000 (toggle hidden by default, verify Phase 6 flow unchanged)

---

## 13. Cost Management

### Guardrails to Prevent Accidental E-Sign Usage

1. **Threshold enforcement:** The toggle is hidden for estimates under $500K. An estimator cannot accidentally enable it for a $50K bathroom renovation.

2. **Visual cost reminder:** The toggle label includes `$1.50/signature` as a reminder. Small cost, but visible friction prevents casual use.

3. **Sandbox mode in non-production:** `testMode: true` ensures all dev, staging, and test sends are free. Production is the only environment that consumes quota.

4. **No auto-trigger:** The toggle defaults to `false` regardless of estimate size. High-value estimates show the toggle but do NOT pre-check it. The estimator must explicitly opt in.

5. **Monthly usage monitoring:** Add a simple admin counter: query `SELECT COUNT(*) FROM export_links WHERE use_esignature = true AND created_at >= date_trunc('month', now())` to track monthly e-sign sends. Surface this in Marco's dashboard if desired.

### Pricing Reality Check

| Metric | Value |
|---|---|
| Dropbox Sign base plan | $75/month for 50 signing requests |
| Cost per signature | $1.50 |
| Estimated e-sign volume (20% of 30 proposals/month) | 6 signatures/month |
| Monthly cost at 6 signatures | $75 (base covers up to 50) |
| Break-even vs. DocuSign ($300/month for 100 requests) | Day 1 — Dropbox Sign is 4x cheaper at this volume |

The base plan covers 50 signatures/month, which is well above the projected 6/month. No overages expected unless Marco scales to 30+ e-sign estimates per month.

---

## 14. Should We Do This?

### When typed-name acceptance (Phase 6) is sufficient

- All estimates under $500K
- Residential clients (homeowner, no legal department reviewing)
- Clients who found Saddlewood via GHL/marketing (informal relationship)
- Fast-turnaround change orders
- Any situation where speed matters more than legal formality

**Typed name is legally sufficient** for most contractor proposals. Under the ESIGN Act, a typed name with a timestamp and IP address constitutes an electronic signature. Phase 6 already captures this.

### When Dropbox Sign is worth the friction

- Commercial GC subcontracts where the GC's legal team requires a wet-equivalent signature
- Projects > $500K where a signed document is a prerequisite to mobilization
- Public/institutional work (schools, churches, municipalities) with procurement requirements
- Any client who asks "can you send a proper contract for me to sign?"
- Repeat commercial clients building a document trail

### Recommended trigger criteria

Implement Phase 9 when **any two of the following are true:**

1. Marco has closed at least 3 commercial GC subcontracts in the past 90 days
2. At least one GC has asked for a countersigned document
3. The average commercial estimate total exceeds $400K (e-sign toggle will appear naturally)
4. Marco feels the typed-name flow is "too informal" for his client mix

### What to do before Phase 9

If e-signature is needed before Phase 9 is built: send the estimate PDF via DocuSign or Dropbox Sign manually, outside the portal. Phase 9 just automates what can be done manually today.

### Verdict

Phase 9 is low-risk to implement ($75/month, minimal code surface) and high-value when commercial GC work picks up. Build it when the first GC client asks for a formal signed proposal — that conversation is the clearest trigger.
