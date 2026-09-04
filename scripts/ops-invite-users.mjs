#!/usr/bin/env node
// One-time: create the portal's allowlisted users in Supabase Auth so a magic
// link can be issued for them (the login page uses shouldCreateUser: false).
//
//   vercel env pull .env.production.local        # brings SUPABASE_SERVICE_ROLE_KEY down
//   node --env-file=.env.production.local scripts/ops-invite-users.mjs
//
// Idempotent: an address that already exists is reported and skipped.
// Never commit .env.production.local.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(1);
}
const emails = (process.env.INTERNAL_ALLOWED_EMAILS || process.env.OPS_ALLOWED_EMAILS ||
  "marco@saddlewoodcontracting.com,ilene8a@gmail.com,info@saddlewoodcontracting.com,bot@saddlewoodcontracting.com,lando@saddlewoodcontracting.com")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: page, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listErr) { console.error(listErr.message); process.exit(1); }
const have = new Set((page?.users ?? []).map((u) => (u.email || "").toLowerCase()));

for (const email of emails) {
  if (have.has(email)) { console.log(`exists  ${email}`); continue; }
  const { error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  console.log(error ? `FAILED  ${email}: ${error.message}` : `created ${email}`);
}
