"use client";

import { useState, useEffect, useRef, Suspense, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import {
  declinePasskeyOffer,
  deviceLabel,
  enrollPasskey,
  passkeyOnThisDevice,
  passkeySupported,
  shouldOfferPasskey,
  signInWithPasskey,
} from "@/lib/auth/passkeyClient";
import { hasCompletedOnboarding } from "@/components/auth/OnboardingFlow";
import { keepDeviceLang, readDeviceLang, type DeviceLang } from "@/lib/auth/deviceLang";
import { hasInbox, loginEmail } from "@/lib/auth/username";

type FormState =
  | "idle"
  | "sending"
  | "code-entry"
  | "verifying"
  | "error"
  // Signed in; offering Face ID for next time before going on.
  | "enroll"
  | "enrolling";

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

// What the code screen says under its title. Kept as a kind, not as words, so
// switching language on that screen changes it too.
type Channel = "app:sent" | "app:given" | "app:office" | string;
const PORTAL_GIVEN = "Type your email and the code you were given.";

function LoginForm() {
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState(() => searchParams.get("email") ?? searchParams.get("phone") ?? "");
  const [resolvedEmail, setResolvedEmail] = useState("");
  const [sentChannel, setSentChannel] = useState("");
  const [code, setCode] = useState("");
  const [formState, setFormState] = useState<FormState>("idle");
  const [lang, setLangState] = useState<DeviceLang>("en");
  useEffect(() => {
    setLangState(readDeviceLang(searchParams.get("lang")));
  }, [searchParams]);
  // One language at a time on the crew sign-in (Lando, 2026-10-15), chosen
  // by the switch under the logo and kept on the device.
  function setLang(next: DeviceLang) {
    setLangState(next);
    keepDeviceLang(next);
  }

  // Back from a reload mid sign-in: straight to the code screen. The server
  // renders the email step (it cannot see the device), so this has to be an
  // effect; same pattern as NumericBottomSheet.
  useEffect(() => {
    const saved = readStep();
    // A failed link lands here with ?error: show the email step and its message, not an old code screen.
    if (!saved || new URLSearchParams(window.location.search).has("error")) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIdentifier((v) => v || saved.identifier);
    setResolvedEmail(saved.email);
    setSentChannel(saved.channel);
    setFormState("code-entry");
  }, []);
  const [errorMessage, setErrorMessage] = useState("");
  const [stayLoggedIn, setStayLoggedIn] = useState(true);
  // "none" until the device has been asked; "lead" when a passkey was enrolled
  // on this device, so the Face ID button comes first.
  const [passkey, setPasskey] = useState<"none" | "offer" | "lead" | "busy">("none");
  useEffect(() => {
    if (!passkeySupported()) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPasskey(passkeyOnThisDevice() ? "lead" : "offer");
  }, []);

  const urlError = searchParams.get("error");
  const urlErrorDetail = searchParams.get("detail");
  const nextPath = (() => {
    const n = searchParams.get("next") ?? "";
    // A path on this site only. Browsers read "\" as "/", so "/\evil.com" is out too.
    return n.startsWith("/") && !n.startsWith("//") && !n.includes("\\") ? n : "/internal/ops";
  })();

  // Arriving from the app (the link crew are sent): plain words, in English
  // or Spanish, because this is the first screen a field worker sees.
  const appFlow = nextPath === "/app" || nextPath.startsWith("/app/");
  const es = appFlow && lang === "es";
  /** App sign-in words in the chosen language; `portal` is the owners' portal wording. */
  const say = (en: string, esText: string, portal: string = en) => (!appFlow ? portal : es ? esText : en);
  const copy = appFlow
    ? es
      ? {
          title: "Saddlewood",
          lead: "Entra con tu usuario o correo.",
          label: "Usuario o correo",
          placeholder: "angel.l o tu@ejemplo.com",
          send: "Mándame el código",
          sending: "Enviando…",
          haveCode: "Ya tengo un código",
          codeTitle: "Escribe tu código",
          codeLead: "Te mandamos un código por correo.",
          code: "Código",
          signIn: "Entrar",
          verifying: "Revisando…",
          back: "← Atrás",
          resend: "Mandar otra vez",
        }
      : {
          title: "Saddlewood",
          lead: "Sign in with your username or email.",
          label: "Username or email",
          placeholder: "angel.l or you@example.com",
          send: "Send my code",
          sending: "Sending…",
          haveCode: "I already have a code",
          codeTitle: "Enter your code",
          codeLead: "We emailed you a code.",
          code: "Code",
          signIn: "Sign in",
          verifying: "Checking…",
          back: "← Back",
          resend: "Send again",
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
        code: "Code",
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
    // The app takes a username too. A username seat has no mailbox: its code
    // comes from the office, so ask for it instead of sending anything.
    const asEmail = appFlow ? loginEmail(typed) : "";
    if (appFlow && !asEmail) {
      setFormState("error");
      setErrorMessage(say("Type your username or email.", "Escribe tu usuario o correo."));
      return;
    }
    if (appFlow && !hasInbox(asEmail)) {
      setResolvedEmail(asEmail);
      setSentChannel("app:office");
      saveStep({ identifier: typed, email: asEmail, channel: "app:office" });
      setCode("");
      setErrorMessage("");
      setFormState("code-entry");
      return;
    }

    let failed = false;
    let resJson: { ok: boolean; email?: string; phone?: string; smsSent?: boolean } | null = null;
    try {
      const res = await fetch("/api/auth/send-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: asEmail || typed, next: nextPath }),
      });
      resJson = await res.json();
      failed = !res.ok || !resJson?.ok;
    } catch {
      failed = true;
    }

    if (failed) {
      setFormState("error");
      setErrorMessage(say("Could not send the code. Try again in a minute.", "No se pudo mandar el código. Intenta en un minuto.", "Could not dispatch verification code. Try again in a minute."));
      return;
    }

    // The server says the same thing for every address (it does not reveal
    // who has access), so this is worded as "if".
    const email = resJson?.email ?? (typed.includes("@") ? typed.toLowerCase() : "");
    const channel: Channel = resJson?.phone
      ? `Sent by text to ${resJson.phone} and to the email on file.`
      : appFlow
        ? "app:sent"
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
    const typedId = givenCode ? identifier.trim() : resolvedEmail || identifier.trim();
    const targetEmail = appFlow ? loginEmail(typedId) : typedId.toLowerCase();
    if (!targetEmail.includes("@")) {
      setErrorMessage(say("Type your username or email.", "Escribe tu usuario o correo.", "Type your email."));
      return;
    }
    if (cleanCode.length < 6 || cleanCode.length > 8) {
      setErrorMessage(say("Type the code from the email.", "Escribe el código del correo.", "Enter the verification code sent to your phone or email."));
      return;
    }
    setFormState("verifying");
    setErrorMessage("");

    const supabase = createClient();

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
          ? say(
              "That code is not the newest one, or it expired. Check the latest email, or tap Send again.",
              "Ese código no es el más reciente o venció. Revisa el correo más nuevo o toca Mandar otra vez.",
              "That code is not the newest one, or it expired. Check the latest email, or tap Resend code.",
            )
          : error.message || "Invalid or expired code.",
      );
      return;
    }

    saveStep(null);
    // Signed in. For the phone app (/app), first-run onboarding inside /app
    // walks through Add to Home Screen, Face ID, and the role screen in order.
    // On the desktop portal (or once /app onboarding was already completed),
    // offer Face ID here before redirecting.
    if ((!appFlow || hasCompletedOnboarding(targetEmail)) && shouldOfferPasskey()) {
      setFormState("enroll");
      return;
    }
    window.location.href = nextPath;
  }

  async function handleEnroll() {
    if (formState === "enrolling") return;
    setFormState("enrolling");
    setErrorMessage("");
    try {
      await enrollPasskey(deviceLabel());
      window.location.href = nextPath;
    } catch (e) {
      const err = e as Error;
      setFormState("enroll");
      if (!/NotAllowedError|cancel|abort/i.test(`${err.name} ${err.message}`)) {
        setErrorMessage(
          say(
            `Face ID did not turn on (${err.message}). You can try again from More.`,
            `No se activó Face ID (${err.message}). Puedes intentarlo desde Más.`,
            `Face ID did not turn on (${err.message}). You can try again from the app's More screen.`,
          ),
        );
      }
    }
  }

  function handleNotNow() {
    declinePasskeyOffer();
    window.location.href = nextPath;
  }

  // An owner can read a crew member their code in person ("Get a code" in
  // the app's Crew tab). No email is sent on this path.
  // Straight to the code screen, which asks for the email next to the code.
  // Asking for the email first sent people back to "Send my code", and a new
  // code replaces the one they already had (Lando, 2026-10-15).
  function handleHaveCode() {
    const typed = identifier.trim();
    const channel: Channel = appFlow ? "app:given" : PORTAL_GIVEN;
    setResolvedEmail(appFlow ? loginEmail(typed) : typed.includes("@") ? typed.toLowerCase() : "");
    setSentChannel(channel);
    saveStep({ identifier: typed, email: typed.toLowerCase(), channel });
    setCode("");
    setErrorMessage("");
    setFormState("code-entry");
  }

  async function handlePasskey() {
    if (passkey === "busy") return;
    const was = passkey;
    setPasskey("busy");
    setErrorMessage("");
    try {
      const dest = await signInWithPasskey(nextPath);
      saveStep(null);
      window.location.href = dest;
    } catch (e) {
      const msg = (e as Error).message || "";
      // Closing the Face ID sheet is not an error worth a red box.
      const cancelled = /NotAllowedError|cancel|abort|timed out/i.test(`${(e as Error).name} ${msg}`);
      setPasskey(was);
      if (!cancelled) {
        setErrorMessage(
          say(
            `Face ID sign-in did not work (${msg}). Use your email instead.`,
            `No funcionó Face ID (${msg}). Usa tu correo.`,
            `Passkey sign-in did not work (${msg}). Use your email or phone instead.`,
          ),
        );
      }
    }
  }

  // A phone with Face ID set up starts it as the sign-in screen opens, like a
  // bank app. Once per page load, app sign-in only, and not straight after
  // Sign out (out=1) or an error, or it would sign the person back in or loop.
  // If iOS wants a tap first, the attempt fails quietly and the button stays.
  // The email field takes focus (and opens the keyboard) only when Face ID is
  // not the way in on this phone. Decided after the device check, not on mount.
  const emailRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (passkey === "offer" || (passkey === "none" && !passkeySupported())) emailRef.current?.focus();
  }, [passkey]);
  const autoTried = useRef(false);
  const signedOut = searchParams.get("out") === "1";
  useEffect(() => {
    if (autoTried.current || passkey !== "lead" || formState !== "idle") return;
    if (!appFlow || signedOut || urlError) return;
    autoTried.current = true;
    void handlePasskey();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passkey, formState, appFlow, signedOut, urlError]);

  function handleBack() {
    saveStep(null);
    setFormState("idle");
    setCode("");
    setErrorMessage("");
  }

  const isCodeStep = formState === "code-entry" || formState === "verifying";
  /** A code the person already has: the code screen asks for the email too. */
  const givenCode = sentChannel === "app:given" || sentChannel === "app:office" || sentChannel === PORTAL_GIVEN;
  const isEnrollStep = formState === "enroll" || formState === "enrolling";
  const channelText =
    sentChannel === "app:sent"
      ? say(
          `If ${resolvedEmail || identifier} has a seat, the code is in that inbox now. Use the newest email.`,
          `Si ${resolvedEmail || identifier} tiene acceso, el código ya está en ese correo. Usa el correo más reciente.`,
        )
      : sentChannel === "app:given"
        ? say("Type your username or email, and your code.", "Escribe tu usuario o correo, y tu código.")
        : sentChannel === "app:office"
          ? say("Ask the office for your code, then type it here.", "Pide tu código a la oficina y escríbelo aquí.")
          : sentChannel;

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

        {appFlow ? (
          <div className="flex justify-center mb-6" role="group" aria-label="Language / Idioma">
            {(["en", "es"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                lang={l}
                className="min-h-11 px-4 text-sm cursor-pointer first:rounded-l-lg last:rounded-r-lg border"
                style={
                  lang === l
                    ? { backgroundColor: "var(--color-primary)", borderColor: "var(--color-primary)", color: "white" }
                    : { backgroundColor: "white", borderColor: "var(--color-border)", color: "var(--color-muted)" }
                }
              >
                {l === "en" ? "English" : "Español"}
              </button>
            ))}
          </div>
        ) : null}

        {isEnrollStep ? (
          <>
            <h1
              className="text-2xl text-center mb-2 font-serif"
              style={{ color: "var(--color-primary)" }}
            >
              {appFlow ? say("You're in", "Ya entraste") : "Signed in"}
            </h1>
            <p
              className="text-sm text-center mb-6 leading-relaxed"
              style={{ color: "var(--color-muted)" }}
            >
              {say(
                "Next time, sign in with Face ID instead of waiting for a code.",
                "La próxima vez, entra con Face ID en vez de esperar un código.",
                "Next time, sign in with Face ID or your fingerprint instead of waiting for a code.",
              )}
            </p>

            {errorMessage && (
              <div
                role="alert"
                className="p-3 rounded-lg text-xs mb-4"
                style={{
                  backgroundColor: "var(--color-error-bg)",
                  color: "var(--color-error-text)",
                }}
              >
                {errorMessage}
              </div>
            )}

            <button
              type="button"
              onClick={handleEnroll}
              disabled={formState === "enrolling"}
              className="w-full py-3.5 px-4 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: "var(--color-primary)", color: "white" }}
            >
              {formState === "enrolling"
                ? say("Setting up…", "Configurando…")
                : say("Turn on Face ID", "Activar Face ID", "Turn on Face ID / fingerprint")}
            </button>
            <button
              type="button"
              onClick={handleNotNow}
              disabled={formState === "enrolling"}
              className="block w-full text-center mt-3 min-h-11 text-sm hover:underline cursor-pointer disabled:opacity-50"
              style={{ color: "var(--color-muted)" }}
            >
              {say("Not now", "Ahora no")}
            </button>
          </>
        ) : isCodeStep ? (
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
              {channelText || copy.codeLead || `Sent code to ${identifier}`}
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleVerifyCode();
              }}
              className="space-y-4"
            >
              {givenCode ? (
                <div>
                  <label
                    htmlFor="code-email"
                    className="block text-xs font-mono mb-1.5"
                    style={{ color: "var(--color-foreground)" }}
                  >
                    {appFlow ? copy.label : "Email"}
                  </label>
                  <input
                    id="code-email"
                    type="text"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="email"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={appFlow ? copy.placeholder : "name@saddlewoodcontracting.com"}
                    disabled={formState === "verifying"}
                    className="w-full px-3 py-3 rounded-lg border text-base focus:outline-none transition-colors"
                    style={{
                      backgroundColor: "white",
                      borderColor: "var(--color-border)",
                      color: "var(--color-foreground)",
                    }}
                    autoFocus={!(appFlow ? loginEmail(identifier) : identifier.includes("@"))}
                  />
                </div>
              ) : null}
              <div>
                <label
                  htmlFor="code"
                  className="block text-xs font-mono mb-1.5"
                  style={{ color: "var(--color-foreground)" }}
                >
                  {copy.code}
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
                  autoFocus={!givenCode || !!(appFlow ? loginEmail(identifier) : identifier.includes("@"))}
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
{sentChannel === "app:office" ? null : (
                <button
                  type="button"
                  onClick={handleSendCode}
                  className="text-xs hover:underline cursor-pointer"
                  style={{ color: "var(--color-muted)" }}
                >
                  {copy.resend}
                </button>
                )}
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
              {passkey === "lead" || (passkey === "busy" && passkeyOnThisDevice())
                ? say("Welcome back.", "Bienvenido de nuevo.")
                : copy.lead}
            </p>

            {passkey === "lead" || (passkey === "busy" && passkeyOnThisDevice()) ? (
              <div className="mb-6">
                <button
                  type="button"
                  onClick={handlePasskey}
                  disabled={passkey === "busy"}
                  className="w-full py-3.5 px-4 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
                  style={{ backgroundColor: "var(--color-primary)", color: "white" }}
                >
                  {passkey === "busy"
                    ? copy.verifying
                    : say("Sign in with Face ID", "Entrar con Face ID", "Sign in with Face ID / passkey")}
                </button>
                <p className="text-xs text-center mt-3" style={{ color: "var(--color-muted)" }}>
                  {say("or with your username or email", "o con tu usuario o correo", "or with your email or phone")}
                </p>
              </div>
            ) : null}

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
                  ref={emailRef}
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
                      ? say(
                          "That address does not have a seat. Ask the office.",
                          "Ese correo no tiene acceso. Pregunta en la oficina.",
                          "You are not on the authorized staff allowlist.",
                        )
                      : say(
                          "That link was used, expired, or replaced by a newer email. Use the newest email, or enter your email for a new code.",
                          "Ese enlace ya se usó, venció o lo reemplazó un correo más nuevo. Usa el correo más reciente o escribe tu correo para un código nuevo.",
                          "Sign-in link was invalid or expired. Enter your phone or email again.",
                        ))}
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

              {passkey === "offer" || (passkey === "busy" && !passkeyOnThisDevice()) ? (
                <button
                  type="button"
                  onClick={handlePasskey}
                  disabled={passkey === "busy"}
                  className={`block w-full text-center rounded-lg border px-4 font-medium transition-colors cursor-pointer disabled:opacity-50 ${appFlow ? "py-3 text-sm" : "py-2 text-xs"}`}
                  style={{
                    backgroundColor: "white",
                    borderColor: "var(--color-border)",
                    color: "var(--color-primary)",
                  }}
                >
                  {passkey === "busy"
                    ? copy.verifying
                    : say("Sign in with Face ID", "Entrar con Face ID", "Sign in with Face ID / passkey")}
                </button>
              ) : null}

              {/* Last, set apart: the way in for a code already in hand (an
                  email, or one the office read out), so it does not sit
                  between the two ways to sign in. */}
              <div className="pt-2 mt-2 border-t" style={{ borderColor: "var(--color-border)" }}>
                <button
                  type="button"
                  onClick={handleHaveCode}
                  className={`block w-full text-center hover:underline cursor-pointer ${appFlow ? "min-h-11 text-sm" : "pt-1 text-xs"}`}
                  style={{ color: "var(--color-muted)" }}
                >
                  {copy.haveCode}
                </button>
              </div>
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
