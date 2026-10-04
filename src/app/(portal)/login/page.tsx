"use client";

import { useState, useEffect, Suspense, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { isAllowedIdentity } from "@/lib/ops/allowlist";

type FormState =
  | "idle"
  | "sending"
  | "code-entry"
  | "verifying"
  | "error";

function LoginForm() {
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState(() => searchParams.get("email") ?? searchParams.get("phone") ?? "");
  const [resolvedEmail, setResolvedEmail] = useState("");
  const [sentChannel, setSentChannel] = useState("");
  const [code, setCode] = useState("");
  const [formState, setFormState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [stayLoggedIn, setStayLoggedIn] = useState(true);

  const urlError = searchParams.get("error");
  const urlErrorDetail = searchParams.get("detail");
  const nextPath = (() => {
    const n = searchParams.get("next") ?? "";
    return n.startsWith("/") && !n.startsWith("//") ? n : "/internal/ops";
  })();

  // "Face ID" sign-in was removed on 2026-10-03: it never verified anything
  // (see /api/auth/passkey). Forget the flag older builds left on this device.
  useEffect(() => {
    try {
      localStorage.removeItem("saddlewood_passkey_user");
    } catch {
      // localStorage may fail in private mode
    }
  }, []);

  async function handleSendCode() {
    if (formState === "sending") return;
    setFormState("sending");
    setErrorMessage("");

    const check = isAllowedIdentity(identifier);
    if (!check.allowed || !check.email) {
      setFormState("error");
      setErrorMessage("This phone number or email is not authorized to access Saddlewood.");
      return;
    }

    setResolvedEmail(check.email);

    let failed = false;
    let resJson: { ok: boolean; phone?: string; smsSent?: boolean } | null = null;
    try {
      const res = await fetch("/api/auth/send-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), next: nextPath }),
      });
      resJson = await res.json();
      failed = !res.ok || !resJson?.ok;
    } catch {
      failed = true;
    }

    if (failed) {
      setFormState("error");
      setErrorMessage("Could not dispatch verification code. Try again in a minute.");
      return;
    }

    const channelDesc = resJson?.phone
      ? `Sent via text message to ${resJson.phone} and ${check.email}`
      : `Sent to ${check.email}`;
    setSentChannel(channelDesc);

    setCode("");
    setFormState("code-entry");
  }

  async function handleVerifyCode() {
    if (formState === "verifying") return;
    const cleanCode = code.replace(/\s+/g, "");
    if (cleanCode.length < 6 || cleanCode.length > 8) {
      setErrorMessage("Enter the verification code sent to your phone or email.");
      return;
    }
    setFormState("verifying");
    setErrorMessage("");

    const supabase = createClient();
    const targetEmail = resolvedEmail || identifier.trim();

    const { error } = await supabase.auth.verifyOtp({
      email: targetEmail,
      token: cleanCode,
      type: "magiclink",
    });

    if (error) {
      setFormState("code-entry");
      setErrorMessage(error.message || "Invalid or expired code.");
      return;
    }

    window.location.href = nextPath;
  }

  function handleBack() {
    setFormState("idle");
    setCode("");
    setErrorMessage("");
  }

  const isCodeStep = formState === "code-entry" || formState === "verifying";

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "var(--color-background)" }}
    >
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <Image
            src="/images/logo.png"
            alt="Saddlewood Contracting"
            width={160}
            height={48}
            priority
          />
        </div>

        {isCodeStep ? (
          <>
            <h1
              className="text-2xl text-center mb-2 font-serif"
              style={{ color: "var(--color-primary)" }}
            >
              Enter Verification Code
            </h1>
            <p
              className="text-xs text-center mb-6"
              style={{ color: "var(--color-muted)" }}
            >
              {sentChannel || `Sent code to ${identifier}`}
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleVerifyCode();
              }}
              className="space-y-4"
            >
              <div>
                <label
                  htmlFor="code"
                  className="block text-xs font-mono mb-1.5"
                  style={{ color: "var(--color-foreground)" }}
                >
                  Code
                </label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  maxLength={8}
                  disabled={formState === "verifying"}
                  className="w-full px-3 py-2.5 rounded-lg border text-center text-xl font-mono tracking-widest focus:outline-none transition-colors"
                  style={{
                    backgroundColor: "white",
                    borderColor: "var(--color-border)",
                    color: "var(--color-foreground)",
                  }}
                  autoFocus
                />
              </div>

              {errorMessage && (
                <div
                  role="alert"
                  className="p-3 rounded-lg text-xs"
                  style={{
                    backgroundColor: "var(--color-error-bg)",
                    color: "var(--color-error-text)",
                  }}
                >
                  {errorMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={formState === "verifying"}
                className="w-full py-2.5 px-4 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
                style={{
                  backgroundColor: "var(--color-primary)",
                  color: "white",
                }}
              >
                {formState === "verifying" ? "Verifying..." : "Sign in"}
              </button>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleBack}
                  className="text-xs hover:underline cursor-pointer"
                  style={{ color: "var(--color-muted)" }}
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={handleSendCode}
                  className="text-xs hover:underline cursor-pointer"
                  style={{ color: "var(--color-muted)" }}
                >
                  Resend code
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <h1
              className="text-2xl text-center mb-2 font-serif"
              style={{ color: "var(--color-primary)" }}
            >
              Internal Portal & Approvals
            </h1>
            <p
              className="text-xs text-center mb-6"
              style={{ color: "var(--color-muted)" }}
            >
              Sign in with your authorized phone number or company email.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendCode();
              }}
              className="space-y-4"
            >
              <div>
                <label
                  htmlFor="identifier"
                  className="block text-xs font-mono mb-1.5"
                  style={{ color: "var(--color-foreground)" }}
                >
                  Phone number or Email
                </label>
                <input
                  id="identifier"
                  type="text"
                  autoComplete="username tel email"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="(602) 218-1191 or name@saddlewoodcontracting.com"
                  disabled={formState === "sending"}
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none transition-colors"
                  style={{
                    backgroundColor: "white",
                    borderColor: "var(--color-border)",
                    color: "var(--color-foreground)",
                  }}
                  autoFocus
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="stayLoggedIn"
                  type="checkbox"
                  checked={stayLoggedIn}
                  onChange={(e) => setStayLoggedIn(e.target.checked)}
                  className="rounded text-[#b45309] focus:ring-[#b45309]"
                />
                <label htmlFor="stayLoggedIn" className="text-xs text-[#64748b]">
                  Stay signed in on this device (30 days)
                </label>
              </div>

              {(errorMessage || urlError) && (
                <div
                  role="alert"
                  className="p-3 rounded-lg text-xs"
                  style={{
                    backgroundColor: "var(--color-error-bg)",
                    color: "var(--color-error-text)",
                  }}
                >
                  {errorMessage ||
                    (urlError === "unauthorized"
                      ? "You are not on the authorized staff allowlist."
                      : "Sign-in link was invalid or expired. Enter your phone or email again.")}
                </div>
              )}

              <button
                type="submit"
                disabled={formState === "sending"}
                className="w-full py-2.5 px-4 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
                style={{
                  backgroundColor: "var(--color-primary)",
                  color: "white",
                }}
              >
                {formState === "sending" ? "Sending code..." : "Send code via iMessage / Email"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ backgroundColor: "var(--color-background)" }}
        >
          <div className="text-sm font-mono" style={{ color: "var(--color-muted)" }}>
            Loading...
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
