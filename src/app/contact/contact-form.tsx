"use client";

import { FormEvent, useState } from "react";

type FormState = "idle" | "sending" | "sent" | "error";

export function ContactForm() {
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("sending");
    setError("");

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        email: form.get("email"),
        message: form.get("message"),
        website: form.get("website"),
      }),
    }).catch(() => null);

    if (!response?.ok) {
      const body = await response?.json().catch(() => null);
      setError(body?.error ?? "We could not send your message. Please try again.");
      setState("error");
      return;
    }

    event.currentTarget.reset();
    setState("sent");
  }

  if (state === "sent") {
    return <div className="rounded-2xl border border-[var(--social-blue)]/55 bg-[#241b32] p-6 text-[var(--social-text)]"><p className="text-sm font-black uppercase tracking-[0.15em] text-[var(--social-blue)]">Message received</p><p className="mt-2 leading-7">Thanks — your message is in the SocialOlla support inbox. We will reply to the email you provided.</p></div>;
  }

  return (
    <form className="grid gap-5" onSubmit={submit}>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-bold">Name<input className="rounded-xl border border-[var(--social-line-dark)] bg-[var(--social-surface)] px-4 py-3 font-medium text-[var(--social-text)] outline-none transition focus:border-[var(--social-blue)]" name="name" autoComplete="name" maxLength={80} required /></label>
        <label className="grid gap-2 text-sm font-bold">Email<input className="rounded-xl border border-[var(--social-line-dark)] bg-[var(--social-surface)] px-4 py-3 font-medium text-[var(--social-text)] outline-none transition focus:border-[var(--social-blue)]" name="email" type="email" autoComplete="email" maxLength={254} required /></label>
      </div>
      <label className="grid gap-2 text-sm font-bold">How can we help?<textarea className="min-h-36 rounded-xl border border-[var(--social-line-dark)] bg-[var(--social-surface)] px-4 py-3 font-medium leading-6 text-[var(--social-text)] outline-none transition focus:border-[var(--social-blue)]" name="message" maxLength={2000} minLength={10} required /></label>
      <input aria-hidden="true" className="hidden" name="website" tabIndex={-1} autoComplete="off" />
      {error ? <p className="text-sm font-semibold text-[#b42318]" role="alert">{error}</p> : null}
      <button className="w-fit rounded-full bg-[var(--social-blue)] px-5 py-3 text-sm font-black text-[var(--social-ink)] transition hover:bg-[#cdbbff] disabled:cursor-not-allowed disabled:opacity-60" disabled={state === "sending"} type="submit">{state === "sending" ? "Sending…" : "Send message"}</button>
    </form>
  );
}
