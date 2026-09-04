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
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [formState, setFormState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const searchParams = useSearchParams();

  const urlError = searchParams.get("error");
  const urlErrorDetail = searchParams.get("detail");

  async function handleSendCode() {
    if (formState === "sending") return;
    setFormState("sending");
    setErrorMessage("");

    if (!isAllowedEmail(email, "")) {
      setFormState("error");
      setErrorMessage("You are not authorized to access this portal.");
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: false,
      },
    });

    if (error) {
      setFormState("error");
      setErrorMessage(error.message);
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
      type: "email",
    });

    if (error) {
      setFormState("code-entry");
      setErrorMessage(error.message);
      return;
    }

    // Full navigation so proxy.ts sees the fresh session cookie.
    window.location.href = "/internal";
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
              We sent a {OTP_LENGTH}-digit code to <strong>{email}</strong>. Enter it
              below, or click the link in the email.
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
                {formState === "sending" ? "Sending…" : "Send Sign-In Code"}
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
