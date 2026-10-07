"use client";

import { useState, useEffect, Suspense, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

type FormState =
  | "idle"
  | "sending"
  | "code-entry"
  | "verifying"
  | "error";

// A home-screen app on iOS reloads when the person switches to Mail for the
// code and comes back, which threw away the code step and showed "enter your
// email" again. The step is kept on the device for a while so the reload
// lands back on the code screen.
const STEP_KEY = "saddlewood_login_step";
const STEP_MINUTES = 30;

type SavedStep = { identifier: string; email: string; channel: string; at: number };

function readStep(): SavedStep | null {
  try {
    const raw = localStorage.getItem(STEP_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedStep;
    if (!s?.email || Date.now() - s.at > STEP_MINUTES * 60_000) return null;
    return s;
  } catch {
    return null;
  }
}

function saveStep(s: Omit<SavedStep, "at"> | null) {
  try {
    if (s) localStorage.setItem(STEP_KEY, JSON.stringify({ ...s, at: Date.now() }));
    else localStorage.removeItem(STEP_KEY);
  } catch {
    // localStorage may fail in private mode
  }
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState(() => searchParams.get("email") ?? searchParams.get("phone") ?? "");
  const [resolvedEmail, setResolvedEmail] = useState("");
  const [sentChannel, setSentChannel] = useState("");
  const [code, setCode] = useState("");
  const [formState, setFormState] = useState<FormState>("idle");

  // Back from a reload mid sign-in: straight to the code screen. The server
  // renders the email step (it cannot see the device), so this has to be an
  // effect; same pattern as NumericBottomSheet.
  useEffect(() => {
    const saved = readStep();
    if (!saved) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIdentifier((v) => v || saved.identifier);
    setResolvedEmail(saved.email);
    setSentChannel(saved.channel);
    setFormState("code-entry");
  }, []);
  const [errorMessage, setErrorMessage] = useState("");
  const [stayLoggedIn, setStayLoggedIn] = useState(true);

  const urlError = searchParams.get("error");
  const urlErrorDetail = searchParams.get("detail");
  const nextPath = (() => {
    const n = searchParams.get("next") ?? "";
    // A path on this site only. Browsers read "\" as "/", so "/\evil.com" is out too.
    return n.startsWith("/") && !n.startsWith("//") && !n.includes("\\") ? n : "/internal/ops";
  })();

  // Arriving from the app (the link crew are sent): plain words, in English
  // and Spanish, because this is the first screen a field worker sees.
  const appFlow = nextPath === "/app" || nextPath.startsWith("/app/");
  const copy = appFlow
    ? {
        title: "Saddlewood",
        lead: "Sign in with your email. · Entra con tu correo.",
        label: "Email · Correo",
        placeholder: "you@example.com",
        send: "Send my code · Mándame el código",
        sending: "Sending… · Enviando…",
        haveCode: "I already have a code · Ya tengo un código",
        codeTitle: "Enter your code",
        codeLead: "We emailed you a code. · Te mandamos un código por correo.",
        signIn: "Sign in · Entrar",
        verifying: "Checking… · Revisando…",
        back: "← Back · Atrás",
        resend: "Send again · Mandar otra vez",
      }
    : {
        title: "Internal Portal & Approvals",
        lead: "Sign in with your authorized phone number or company email.",
        label: "Phone number or Email",
        placeholder: "(602) 218-1191 or name@saddlewoodcontracting.com",
        send: "Send code via iMessage / Email",
        sending: "Sending code...",
        haveCode: "I already have a code",
        codeTitle: "Enter Verification Code",
        codeLead: "",
        signIn: "Sign in",
        verifying: "Verifying...",
        back: "← Back",
        resend: "Resend code",
      };

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

    const typed = identifier.trim();
    if (!typed) {
      setFormState("idle");
      return;
    }

    let failed = false;
    let resJson: { ok: boolean; email?: string; phone?: string; smsSent?: boolean } | null = null;
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

    // The server says the same thing for every address (it does not reveal
    // who has access), so this is worded as "if".
    const email = resJson?.email ?? (typed.includes("@") ? typed.toLowerCase() : "");
    const channel = resJson?.phone
      ? `Sent by text to ${resJson.phone} and to the email on file.`
      : appFlow
        ? `If ${typed} has a seat, the code is in that inbox now. Use the newest email. · Si ${typed} tiene acceso, el código ya está en ese correo. Usa el correo más reciente.`
        : `If ${typed} has access, the code is in that inbox now. Use the newest email.`;
    setResolvedEmail(email);
    setSentChannel(channel);
    saveStep({ identifier: typed, email, channel });

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
      // Supabase says "Token has expired or is invalid" for every miss. The
      // usual cause is an older email: each new code replaces the last one.
      const replaced = /expired|invalid/i.test(error.message || "");
      setErrorMessage(
        replaced
          ? appFlow
            ? "That code is not the newest one, or it expired. Check the latest email, or tap Send again. · Ese código no es el más reciente o venció. Revisa el correo más nuevo o toca Mandar otra vez."
            : "That code is not the newest one, or it expired. Check the latest email, or tap Resend code."
          : error.message || "Invalid or expired code.",
      );
      return;
    }

    saveStep(null);
    window.location.href = nextPath;
  }

  // An owner can read a crew member their code in person ("Get a code" in
  // the app's Crew tab). No email is sent on this path.
  function handleHaveCode() {
    const typed = identifier.trim();
    if (!typed.includes("@")) {
      setFormState("error");
      setErrorMessage(appFlow ? "Type your email first. · Escribe tu correo primero." : "Type your email first.");
      return;
    }
    const channel = appFlow ? "Type the code you were given. · Escribe el código que te dieron." : "Type the code you were given.";
    setResolvedEmail(typed.toLowerCase());
    setSentChannel(channel);
    saveStep({ identifier: typed, email: typed.toLowerCase(), channel });
    setCode("");
    setErrorMessage("");
    setFormState("code-entry");
  }

  function handleBack() {
    saveStep(null);
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
              {copy.codeTitle}
            </h1>
            <p
              className="text-xs text-center mb-6"
              style={{ color: "var(--color-muted)" }}
            >
              {sentChannel || copy.codeLead || `Sent code to ${identifier}`}
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
                {formState === "verifying" ? copy.verifying : copy.signIn}
              </button>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleBack}
                  className="text-xs hover:underline cursor-pointer"
                  style={{ color: "var(--color-muted)" }}
                >
                  {copy.back}
                </button>
                <button
                  type="button"
                  onClick={handleSendCode}
                  className="text-xs hover:underline cursor-pointer"
                  style={{ color: "var(--color-muted)" }}
                >
                  {copy.resend}
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
              {copy.title}
            </h1>
            <p
              className="text-xs text-center mb-6"
              style={{ color: "var(--color-muted)" }}
            >
              {copy.lead}
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
                  {copy.label}
                </label>
                <input
                  id="identifier"
                  // Plain text, with the email keyboard: an owner can still type the
                  // phone number they sign in with, which type="email" would refuse.
                  type="text"
                  inputMode={appFlow ? "email" : undefined}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete={appFlow ? "email" : "username tel email"}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={copy.placeholder}
                  disabled={formState === "sending"}
                  className={`w-full px-3 rounded-lg border focus:outline-none transition-colors ${appFlow ? "py-3 text-base" : "py-2 text-sm"}`}
                  style={{
                    backgroundColor: "white",
                    borderColor: "var(--color-border)",
                    color: "var(--color-foreground)",
                  }}
                  autoFocus
                />
              </div>

              <div className={appFlow ? "hidden" : "flex items-center gap-2"}>
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
                      ? appFlow
                        ? "That address does not have a seat. Ask the office. · Ese correo no tiene acceso. Pregunta en la oficina."
                        : "You are not on the authorized staff allowlist."
                      : appFlow
                        ? "That link was used or has expired. Enter your email for a new code. · Ese enlace ya se usó o venció. Escribe tu correo para un código nuevo."
                        : "Sign-in link was invalid or expired. Enter your phone or email again.")}
                </div>
              )}

              <button
                type="submit"
                disabled={formState === "sending"}
                className={`w-full px-4 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 ${appFlow ? "py-3.5" : "py-2.5"}`}
                style={{
                  backgroundColor: "var(--color-primary)",
                  color: "white",
                }}
              >
                {formState === "sending" ? copy.sending : copy.send}
              </button>

              <button
                type="button"
                onClick={handleHaveCode}
                className={`block w-full text-center hover:underline cursor-pointer ${appFlow ? "min-h-11 text-sm" : "pt-1 text-xs"}`}
                style={{ color: "var(--color-muted)" }}
              >
                {copy.haveCode}
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
