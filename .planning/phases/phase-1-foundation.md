# Phase 1 — Foundation: Auth + Portal Shell

**Status:** Pending execution  
**Target project:** Saddlewood Contracting LLC — internal estimate review portal  
**Stack:** Next.js 16.1.6 (App Router), React 19, TypeScript strict, Tailwind CSS v4, Supabase Auth

---

## 1. Phase Goal

Establish the authenticated portal shell alongside the existing marketing site by introducing Next.js route groups, wiring Supabase magic-link auth, and gating `/internal/*` behind middleware. After Phase 1, Marco can receive a magic link to his email and land on a placeholder dashboard — no estimate data yet.

---

## 2. Success Criteria

- [ ] `npm run build` exits 0 with no TypeScript errors
- [ ] All existing marketing pages (`/`, `/about`, `/contact`, `/portfolio`, `/services`, etc.) render identically to before — Navbar, Footer, and GHL chat widget still present
- [ ] `GET /login` renders the magic-link login form with Saddlewood branding
- [ ] Submitting `marco@saddlewoodcontracting.com` on `/login` triggers a Supabase magic-link email and shows the success state
- [ ] Submitting any other email returns an error: "You are not authorized to access this portal."
- [ ] Clicking the magic link in the email redirects through `/auth/callback` and lands on `/internal`
- [ ] `/internal` shows "Welcome, Marco" placeholder — no redirect loop
- [ ] Navigating to `/internal` while unauthenticated redirects to `/login`
- [ ] Navigating to `/internal` with a different authorized email than `INTERNAL_ALLOWED_EMAIL` redirects to `/login` (whitelist enforcement)
- [ ] `/share/[token]` (any token) renders a static placeholder page — no auth required
- [ ] No Supabase credentials exposed in client-side JS (`SUPABASE_SERVICE_ROLE_KEY` is server-only)
- [ ] `localStorage` / `sessionStorage` not used for auth state — Supabase SSR cookie flow only

---

## 3. Prerequisites — Manual Supabase Setup

Complete these steps in the Supabase dashboard **before writing any code**.

### 3a. Project settings
1. Dashboard → **Authentication → Providers → Email**: ensure "Enable email provider" is ON, "Confirm email" is ON, **"Enable email OTP"** is ON.
2. **Disable new signups**: Authentication → Settings → "Enable new user signups" → **OFF**. Marco's account must be pre-seeded.
3. **Allowed redirect URLs**: add `http://localhost:3000/auth/callback` (dev) and `https://<production-domain>/auth/callback` (prod) under Authentication → URL Configuration → Redirect URLs.
4. **Site URL**: set to `http://localhost:3000` for dev (change to prod URL before deploy).

### 3b. Create Marco's account
1. Authentication → Users → **"Invite user"** (or "Add user" depending on dashboard version).
2. Email: `marco@saddlewoodcontracting.com`
3. Send invite, Marco clicks link once — account is now confirmed.
4. No password is needed. Magic link is the only auth method.

### 3c. Collect credentials
From Project Settings → API:
- `NEXT_PUBLIC_SUPABASE_URL` — Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — `anon` / `public` key
- `SUPABASE_SERVICE_ROLE_KEY` — service_role key (keep secret)

---

## 4. Environment Variables

Create/update `.env.local` in the project root. **Never commit this file.**

```
NEXT_PUBLIC_SUPABASE_URL=https://rwzmcknxlucwbhsyxdcx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from dashboard>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from dashboard>
INTERNAL_ALLOWED_EMAIL=marco@saddlewoodcontracting.com
```

Confirm `.gitignore` includes `.env.local`.

---

## 5. Package Installation

```bash
npm install @supabase/supabase-js @supabase/ssr
```

No other new dependencies needed for Phase 1.

---

## 6. Complete File List — Create or Modify

### Files to CREATE (new):
```
src/app/(marketing)/layout.tsx
src/app/(portal)/layout.tsx
src/app/(portal)/login/page.tsx
src/app/(portal)/internal/layout.tsx
src/app/(portal)/internal/page.tsx
src/app/(portal)/share/[token]/page.tsx
src/app/auth/callback/route.ts
src/lib/supabase/client.ts
src/lib/supabase/server.ts
src/lib/supabase/admin.ts
src/middleware.ts
```

### Files to MODIFY (existing):
```
src/app/layout.tsx          ← strip Navbar/Footer/GHL; become bare <html><body> shell
src/app/page.tsx            ← move to src/app/(marketing)/page.tsx
src/app/about/page.tsx      ← move to src/app/(marketing)/about/page.tsx
src/app/contact/page.tsx    ← move to src/app/(marketing)/contact/page.tsx
src/app/portfolio/page.tsx  ← move to src/app/(marketing)/portfolio/page.tsx
src/app/services/page.tsx   ← move to src/app/(marketing)/services/page.tsx
(... all other existing marketing pages follow the same pattern)
```

> **Migration note:** The "move" is a physical file relocation into `(marketing)/`. Next.js route groups use parentheses in the folder name — they do NOT change the URL. `/about` is still `/about` after moving to `(marketing)/about/page.tsx`.

---

## 7. File Implementation Specs

---

### 7.1 `src/app/layout.tsx` — Root Layout (modified)

Strip all marketing chrome. This becomes a minimal shell that both route groups inherit from.

```tsx
// src/app/layout.tsx
import type { Metadata } from 'next'
import { Inter, Fraunces } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Saddlewood Contracting',
  description: 'General contractor serving the greater Phoenix area.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body>{children}</body>
    </html>
  )
}
```

**What changed:** Navbar, Footer, and GHL script are removed here. They live exclusively in `(marketing)/layout.tsx` below.

---

### 7.2 `src/app/(marketing)/layout.tsx` — Marketing Layout (new)

Takes over the chrome that was in the root layout.

```tsx
// src/app/(marketing)/layout.tsx
import Navbar from '@/components/Navbar'       // adjust import paths to match existing codebase
import Footer from '@/components/Footer'
import Script from 'next/script'

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <Navbar />
      <main>{children}</main>
      <Footer />
      {/* GHL chat widget — copy exact script tag from current root layout */}
      <Script
        src="https://widgets.leadconnectorhq.com/loader.js"
        data-resources-url="https://widgets.leadconnectorhq.com/chat-widget/loader.js"
        strategy="lazyOnload"
      />
    </>
  )
}
```

**Note:** Verify the exact GHL script tag from the current `src/app/layout.tsx` before removing it. Copy it verbatim here.

---

### 7.3 `src/app/(portal)/layout.tsx` — Portal Layout (new)

Minimal shell. No Navbar, no Footer, no GHL. Sets a consistent background.

```tsx
// src/app/(portal)/layout.tsx
export default function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      {children}
    </div>
  )
}
```

---

### 7.4 `src/lib/supabase/client.ts` — Browser Client (new)

Used in Client Components only (`'use client'`).

```ts
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

---

### 7.5 `src/lib/supabase/server.ts` — Server Client (new)

Used in Server Components, Server Actions, and Route Handlers. Reads/writes cookies via the Next.js `cookies()` API.

```ts
// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll called from a Server Component — safe to ignore,
            // middleware will handle session refresh
          }
        },
      },
    }
  )
}
```

**Important:** `cookies()` in Next.js 15+ is async — the `await` on line 6 is required. Omitting it causes a build-time warning and runtime bugs.

---

### 7.6 `src/lib/supabase/admin.ts` — Service Role Client (new)

Server-only. Never import this in any file that could be bundled client-side.

```ts
// src/lib/supabase/admin.ts
import { createClient } from '@supabase/supabase-js'

// Guard: fail loudly at module evaluation if the key is missing
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set — admin client cannot initialize')
}

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)
```

**Usage rule:** Only import `supabaseAdmin` inside `src/app/api/**` route handlers or `src/lib/` server utilities. Never in page files or components.

---

### 7.7 `src/middleware.ts` — Session Guard (new)

Runs on every request matching the config. Refreshes the Supabase session (required for SSR cookie rotation) and enforces `/internal/*` access control.

```ts
// src/middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Do not add logic between createServerClient and getUser().
  // A stale session that needs refreshing requires the cookie round-trip
  // to complete atomically.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Protect /internal/* routes
  if (pathname.startsWith('/internal')) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    // Email whitelist check
    const allowedEmail = process.env.INTERNAL_ALLOWED_EMAIL
    if (user.email !== allowedEmail) {
      // Signed in but not authorized — sign out and redirect
      await supabase.auth.signOut()
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('error', 'unauthorized')
      return NextResponse.redirect(url)
    }
  }

  // Redirect authenticated + authorized users away from /login
  if (pathname === '/login' && user && user.email === process.env.INTERNAL_ALLOWED_EMAIL) {
    const url = request.nextUrl.clone()
    url.pathname = '/internal'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     * - public folder assets
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

**Critical pitfall:** The `supabaseResponse` variable must be the return value — never return a new `NextResponse` after calling `createServerClient`, as that breaks cookie propagation and causes infinite auth loops.

---

### 7.8 `src/app/auth/callback/route.ts` — Magic Link Callback (new)

Supabase sends users to this URL after clicking the magic link. It exchanges the OTP code for a session and redirects into the portal.

```ts
// src/app/auth/callback/route.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // 'next' can be set by middleware to redirect back to intended page
  const next = searchParams.get('next') ?? '/internal'

  if (code) {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Session is now set in cookies. Redirect to portal.
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Something went wrong — send to login with error indicator
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
```

**Session persistence:** Supabase SSR sets `auth-token` as an HTTP-only cookie. The default expiry from Supabase is 3600 seconds (1 hour) for the access token, but the refresh token is long-lived (default ~30 days, configurable in dashboard under Authentication → Settings → "JWT expiry" and "Refresh token expiry"). Set "Refresh token expiry" to `2592000` (30 days) in the Supabase dashboard.

---

### 7.9 `src/app/(portal)/login/page.tsx` — Login Page (new)

Client component — needs `useState` for form state and `createClient()` from the browser client.

#### ASCII Wireframe (mobile-first, 390px)

```
┌──────────────────────────────────────┐
│                                      │
│           [SADDLEWOOD LOGO]          │
│                                      │
│     Sign in to Saddlewood Portal     │  ← Fraunces font, --color-charcoal
│                                      │
│  ┌────────────────────────────────┐  │
│  │  your@email.com                │  │  ← border-stone, focus ring teal
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │       Send Magic Link          │  │  ← bg --color-teal, text white
│  └────────────────────────────────┘  │
│                                      │
│         [error message here]         │  ← text-red-600, hidden unless error
│                                      │
└──────────────────────────────────────┘

SUCCESS STATE (replaces form):
┌──────────────────────────────────────┐
│                                      │
│           [SADDLEWOOD LOGO]          │
│                                      │
│         Check your email             │  ← Fraunces
│                                      │
│  We sent a magic link to             │
│  marco@saddlewoodcontracting.com     │  ← user's email, bold
│                                      │
│  The link expires in 60 minutes.     │
│                                      │
└──────────────────────────────────────┘
```

#### Full Implementation

```tsx
// src/app/(portal)/login/page.tsx
'use client'

import { useState, FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

type FormState = 'idle' | 'loading' | 'success' | 'error'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [formState, setFormState] = useState<FormState>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [submittedEmail, setSubmittedEmail] = useState('')
  const searchParams = useSearchParams()

  // Show error from middleware redirect (e.g., unauthorized, callback failure)
  const urlError = searchParams.get('error')

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormState('loading')
    setErrorMessage('')

    const allowedEmail = 'marco@saddlewoodcontracting.com'

    // Client-side whitelist check (middleware also enforces server-side)
    if (email.trim().toLowerCase() !== allowedEmail.toLowerCase()) {
      setFormState('error')
      setErrorMessage('You are not authorized to access this portal.')
      return
    }

    const supabase = createClient()

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: false, // Marco's account must exist; never auto-create
      },
    })

    if (error) {
      setFormState('error')
      setErrorMessage(error.message)
      return
    }

    setSubmittedEmail(email.trim())
    setFormState('success')
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: 'var(--color-background)' }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image
            src="/logo.png"           // adjust to actual logo path in /public
            alt="Saddlewood Contracting"
            width={160}
            height={48}
            priority
          />
        </div>

        {formState === 'success' ? (
          // ── Success state ──────────────────────────────────────────────────
          <div className="text-center">
            <h1
              className="text-2xl mb-4"
              style={{
                fontFamily: 'var(--font-fraunces)',
                color: 'var(--color-charcoal)',
              }}
            >
              Check your email
            </h1>
            <p style={{ color: 'var(--color-charcoal)' }}>
              We sent a magic link to{' '}
              <strong>{submittedEmail}</strong>
            </p>
            <p className="mt-2 text-sm" style={{ color: 'var(--color-charcoal)', opacity: 0.7 }}>
              The link expires in 60 minutes.
            </p>
          </div>
        ) : (
          // ── Form state ────────────────────────────────────────────────────
          <>
            <h1
              className="text-2xl text-center mb-8"
              style={{
                fontFamily: 'var(--font-fraunces)',
                color: 'var(--color-charcoal)',
              }}
            >
              Sign in to Saddlewood Portal
            </h1>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                disabled={formState === 'loading'}
                className="w-full px-4 py-3 rounded-lg border text-base outline-none transition-colors"
                style={{
                  borderColor: 'var(--color-stone)',
                  backgroundColor: 'white',
                  color: 'var(--color-charcoal)',
                }}
                // Focus ring via inline style fallback if Tailwind v4 focus utilities not available
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = 'var(--color-teal)')
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = 'var(--color-stone)')
                }
              />

              <button
                type="submit"
                disabled={formState === 'loading'}
                className="w-full py-3 rounded-lg text-white font-medium text-base transition-opacity disabled:opacity-60"
                style={{ backgroundColor: 'var(--color-teal)' }}
              >
                {formState === 'loading' ? 'Sending…' : 'Send Magic Link'}
              </button>
            </form>

            {/* Error display */}
            {(formState === 'error' || urlError) && (
              <p className="mt-4 text-sm text-center text-red-600">
                {formState === 'error'
                  ? errorMessage
                  : urlError === 'unauthorized'
                  ? 'You are not authorized to access this portal.'
                  : 'Sign-in failed. Please try again.'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
```

---

### 7.10 `src/app/(portal)/internal/layout.tsx` — Internal Area Layout (new)

Minimal. Future phases will add sidebar navigation here.

```tsx
// src/app/(portal)/internal/layout.tsx
export default function InternalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="min-h-screen">{children}</div>
}
```

---

### 7.11 `src/app/(portal)/internal/page.tsx` — Dashboard Placeholder (new)

Server Component — reads session from Supabase server client to personalize greeting.

```tsx
// src/app/(portal)/internal/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function InternalDashboard() {
  const supabase = await createClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  // Defensive: middleware should have caught this, but guard anyway
  if (!user || error) {
    redirect('/login')
  }

  const displayName = user.email === 'marco@saddlewoodcontracting.com' ? 'Marco' : user.email

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: 'var(--color-background)' }}
    >
      <div className="max-w-lg w-full text-center">
        <h1
          className="text-3xl mb-4"
          style={{
            fontFamily: 'var(--font-fraunces)',
            color: 'var(--color-charcoal)',
          }}
        >
          Welcome, {displayName}
        </h1>
        <p style={{ color: 'var(--color-charcoal)', opacity: 0.7 }}>
          Estimates will appear here once the pipeline is connected.
        </p>
      </div>
    </div>
  )
}
```

---

### 7.12 `src/app/(portal)/share/[token]/page.tsx` — Share Placeholder (new)

No auth required. Phase 1 is a static placeholder. Will be implemented in a later phase.

```tsx
// src/app/(portal)/share/[token]/page.tsx
interface SharePageProps {
  params: Promise<{ token: string }>
}

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: 'var(--color-background)' }}
    >
      <div className="max-w-lg w-full text-center">
        <h1
          className="text-2xl mb-4"
          style={{
            fontFamily: 'var(--font-fraunces)',
            color: 'var(--color-charcoal)',
          }}
        >
          Estimate Review
        </h1>
        <p style={{ color: 'var(--color-charcoal)', opacity: 0.7 }}>
          This shared estimate link ({token}) will be available soon.
        </p>
      </div>
    </div>
  )
}
```

**Note on `params`:** In Next.js 15+, route params are a `Promise`. The `await params` pattern is required. Using `params.token` directly without await produces a deprecation warning in dev and will break in a future release.

---

## 8. Migration Steps — Existing Pages

Perform these moves **before** creating the marketing layout. If any page has a `metadata` export, it will continue to work after the move.

```bash
# From project root
mkdir -p src/app/(marketing)

# Move each existing marketing page
# Repeat for all existing route folders
mv src/app/page.tsx          src/app/(marketing)/page.tsx
mv src/app/about             src/app/(marketing)/about
mv src/app/contact           src/app/(marketing)/contact
mv src/app/portfolio         src/app/(marketing)/portfolio
mv src/app/services          src/app/(marketing)/services
# ... add any other marketing routes found in src/app/
```

After moving, verify there are no duplicate `page.tsx` files at both the root and inside `(marketing)`.

---

## 9. Middleware Logic Summary

```
Request path         | Authenticated + whitelisted | Authenticated, not whitelisted | Unauthenticated
---------------------|----------------------------|-------------------------------|----------------
/internal/*          | Allow through               | Sign out → /login?error=unauthorized | → /login
/login               | → /internal                 | Allow (to see error)          | Allow
/share/[token]       | Allow through               | Allow through                 | Allow
/* (marketing)       | Allow through               | Allow through                 | Allow
```

---

## 10. Testing Checklist

### Environment setup
- [ ] `.env.local` populated with all four variables
- [ ] `npm install` run after adding `@supabase/supabase-js @supabase/ssr`
- [ ] `npm run dev` starts without errors

### Marketing site regression
- [ ] `http://localhost:3000` — homepage renders with Navbar and Footer
- [ ] `http://localhost:3000/about` — renders normally
- [ ] `http://localhost:3000/contact` — renders normally, contact form works
- [ ] GHL chat widget appears on marketing pages

### Login page
- [ ] `http://localhost:3000/login` — renders with Saddlewood logo, headline in Fraunces, teal button
- [ ] Submit an arbitrary email (not Marco's) → error message "You are not authorized…"
- [ ] Submit `marco@saddlewoodcontracting.com` → success state shows "Check your email"
- [ ] Check Marco's inbox — magic link email arrives within ~30 seconds
- [ ] Email subject line and body look reasonable (Supabase default template; customize later)

### Auth callback
- [ ] Click magic link in email
- [ ] Browser redirects to `http://localhost:3000/auth/callback?code=...`
- [ ] After processing, browser redirects to `http://localhost:3000/internal`
- [ ] Dashboard shows "Welcome, Marco"
- [ ] Browser DevTools → Application → Cookies → `localhost`: Supabase cookies (`sb-*-auth-token`) are present as HTTP-only cookies

### Session persistence
- [ ] After successful login, close and reopen browser tab
- [ ] `http://localhost:3000/internal` still loads without redirecting to login (session cookie still valid)
- [ ] Open incognito window → `http://localhost:3000/internal` → redirects to `/login`

### Middleware enforcement
- [ ] In incognito: `http://localhost:3000/internal` → redirects to `/login`
- [ ] Logged-in as Marco: `http://localhost:3000/login` → redirects to `/internal`

### Share route
- [ ] `http://localhost:3000/share/abc123` → placeholder renders, no auth required

### Build verification
- [ ] `npm run build` → exits 0
- [ ] No TypeScript errors in output
- [ ] `SUPABASE_SERVICE_ROLE_KEY` does not appear in `.next/static/` chunk files (verify with `grep -r "service_role" .next/static/` — should return nothing)

---

## 11. Common Pitfalls

### Cookie/session issues

**Pitfall: Returning a new `NextResponse` inside middleware after `createServerClient`**
The `setAll` callback stores cookies on the `supabaseResponse` object. If you return anything other than `supabaseResponse`, those cookies are lost and the session refresh loop triggers on every request.
Fix: always `return supabaseResponse` (or a redirect derived from it).

**Pitfall: Forgetting `await cookies()` in server.ts**
Next.js 15+ made `cookies()` async. Calling it without `await` returns a Promise object, not the cookie store. All `.getAll()` calls return empty arrays, so Supabase thinks the user is logged out on every server render.

**Pitfall: Using `getSession()` instead of `getUser()` in middleware**
`getSession()` reads from the cookie without server-side validation and can be spoofed. Always use `getUser()` in middleware — it makes a network call to Supabase to validate the JWT.

**Pitfall: Setting `shouldCreateUser: true` on `signInWithOtp`**
Supabase auto-creates the user even if signups are disabled via this option. Use `shouldCreateUser: false` explicitly.

### Route group migration

**Pitfall: Leaving a page.tsx at both `src/app/page.tsx` and `src/app/(marketing)/page.tsx`**
Next.js will throw: "You cannot have two parallel pages that resolve to the same path." Ensure the original files are removed after moving.

**Pitfall: Moving `src/app/layout.tsx` into `(marketing)/`**
The root layout (`src/app/layout.tsx`) must stay at root — it is the entry point for both route groups. Only create a new `(marketing)/layout.tsx` alongside it.

### TypeScript

**Pitfall: `params` not awaited on dynamic routes**
In Next.js 15, `params` and `searchParams` in page components are `Promise<...>`. Destructuring them directly without `await` triggers a TS error in strict mode. Always `const { token } = await params`.

**Pitfall: Missing `!` on env var access**
With `strict: true`, TypeScript marks `process.env.X` as `string | undefined`. Use the non-null assertion (`!`) only after confirming the var is set, or add a runtime guard like the one in `admin.ts`.

### Supabase configuration

**Pitfall: Magic link redirects to wrong URL**
If "Site URL" in Supabase dashboard is set to production but you're developing locally, the email redirect goes to production. Keep Site URL as `http://localhost:3000` in dev. Use environment-specific Supabase projects for prod/dev separation (recommended) or swap the URL manually.

**Pitfall: `emailRedirectTo` not in allowed list**
Supabase blocks redirects to URLs not listed under Authentication → URL Configuration → Redirect URLs. Add both `http://localhost:3000/auth/callback` and the production callback URL before testing.

**Pitfall: User account not confirmed**
If Marco's account was created via "Invite" but he never clicked the invite link, `signInWithOtp` will succeed server-side but the session cookie will have no user after callback. Confirm the account is in "Confirmed" state in the Supabase Users table.

---

## 12. Phase Completion Definition

Phase 1 is complete when:
1. `npm run build` passes with zero errors
2. The manual testing checklist above has all items checked
3. Marco has successfully signed in from his iPhone and seen the dashboard placeholder
4. No marketing page behavior has regressed

Phase 2 will add the estimates database schema, file upload to Supabase Storage, and the estimate creation form.
