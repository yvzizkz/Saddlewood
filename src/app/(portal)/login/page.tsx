"use client";

import { useState, Suspense, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { isAllowedEmail } from "@/lib/ops/allowlist";

type FormState =
  | "idle"
  | "sending"
  | "code-entry"
  | "verifying"
  | "error";

const OTP_LENGTH = 8;

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [code, setCode] = useState("");
  const [formState, setFormState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const urlError = searchParams.get("error");
  const urlErrorDetail = searchParams.get("detail");
  const nextPath = (() => {
    const n = searchParams.get("next") ?? "";
    return n.startsWith("/") && !n.startsWith("//") ? n : "/internal/ops";
  })();

  async function handleSendCode() {
    if (formState === "sending") return;
    setFormState("sending");
    setErrorMessage("");

    if (!isAllowedEmail(email, "")) {
      setFormState("error");
      setErrorMessage("You are not authorized to access this portal.");
      return;
    }

    let failed = false;
    try {
      const res = await fetch("/api/auth/send-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), next: nextPath }),
      });
      const json = await res.json();
      failed = !res.ok || !json.ok;
    } catch {
      failed = true;
    }
    if (failed) {
      setFormState("error");
      setErrorMessage("The sign-in email could not be sent. Try again in a minute.");
      return;
    }

    setCode("");
    setFormState("code-entry");
  }

  async function handleVerifyCode() {
    if (formState === "verifying") return;
    const cleanCode = code.replace(/\s+/g, "");
    if (cleanCode.length !== OTP_LENGTH) {
      setErrorMessage(`Enter the ${OTP_LENGTH}-digit code from your email.`);
      return;
    }
    setFormState("verifying");
    setErrorMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: cleanCode,
      type: "magiclink",
    });

    if (error) {
      setFormState("code-entry");
      setErrorMessage(error.message);
      return;
    }

    // Full navigation so proxy.ts sees the fresh session cookie.
    window.location.href = nextPath;
  }

  function handleBackToEmail() {
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
              className="text-2xl text-center mb-2"
              style={{
                fontFamily: "var(--font-fraunces)",
                color: "var(--color-charcoal)",
              }}
            >
              Check your email
            </h1>
            <p
              className="text-sm text-center mb-6"
              style={{ color: "var(--color-charcoal)", opacity: 0.7 }}
            >
              We sent an email to <strong>{email}</strong>. Tap the button in it to
              sign in, or enter the {OTP_LENGTH}-digit code below.
            </p>

            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                handleVerifyCode();
              }}
            >
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={OTP_LENGTH}
                value={code}
                onChange={(e) =>
                  setCode(
                    e.target.value.replace(/[^0-9]/g, "").slice(0, OTP_LENGTH)
                  )
                }
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleVerifyCode();
                  }
                }}
                placeholder={"0".repeat(OTP_LENGTH)}
                required
                disabled={formState === "verifying"}
                autoFocus
                className="w-full px-4 py-3 rounded-lg border text-2xl text-center tracking-[0.35em] outline-none transition-colors"
                style={{
                  borderColor: "var(--color-stone)",
                  backgroundColor: "white",
                  color: "var(--color-charcoal)",
                  fontVariantNumeric: "tabular-nums",
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = "var(--color-teal)")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "var(--color-stone)")
                }
              />

              <button
                type="button"
                onClick={() => handleVerifyCode()}
                disabled={formState === "verifying" || code.length !== OTP_LENGTH}
                className="w-full py-3 rounded-lg text-white font-medium text-base transition-opacity disabled:opacity-60"
                style={{ backgroundColor: "var(--color-teal)" }}
              >
                {formState === "verifying" ? "Verifying…" : "Sign In"}
              </button>

              <button
                type="button"
                onClick={handleBackToEmail}
                disabled={formState === "verifying"}
                className="text-sm underline"
                style={{ color: "var(--color-charcoal)", opacity: 0.7 }}
              >
                Use a different email
              </button>
            </form>

            {errorMessage && (
              <p className="mt-4 text-sm text-center text-red-600">
                {errorMessage}
              </p>
            )}
          </>
        ) : (
          <>
            <h1
              className="text-2xl text-center mb-8"
              style={{
                fontFamily: "var(--font-fraunces)",
                color: "var(--color-charcoal)",
              }}
            >
              Sign in to Saddlewood Portal
            </h1>

            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                handleSendCode();
              }}
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSendCode();
                  }
                }}
                placeholder="your@email.com"
                required
                disabled={formState === "sending"}
                autoFocus
                className="w-full px-4 py-3 rounded-lg border text-base outline-none transition-colors"
                style={{
                  borderColor: "var(--color-stone)",
                  backgroundColor: "white",
                  color: "var(--color-charcoal)",
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = "var(--color-teal)")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "var(--color-stone)")
                }
              />

              <button
                type="button"
                onClick={() => handleSendCode()}
                disabled={formState === "sending"}
                className="w-full py-3 rounded-lg text-white font-medium text-base transition-opacity disabled:opacity-60"
                style={{ backgroundColor: "var(--color-teal)" }}
              >
                {formState === "sending" ? "Sending…" : "Email me a sign-in link"}
              </button>
            </form>

            {(formState === "error" || urlError) && (
              <p className="mt-4 text-sm text-center text-red-600">
                {formState === "error"
                  ? errorMessage
                  : urlError === "unauthorized"
                  ? "You are not authorized to access this portal."
                  : urlError === "exchange_failed"
                  ? `Sign-in failed: ${urlErrorDetail ?? "please try again"}`
                  : urlError === "link_expired"
                  ? "That sign-in link was already used or has expired. Enter your email and a fresh one will arrive."
                  : urlError === "link_invalid"
                  ? "That link is missing its sign-in token. Enter your email and a fresh one will arrive."
                  : "Sign-in failed. Please try again."}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
