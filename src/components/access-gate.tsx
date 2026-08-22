"use client";

import { useState } from "react";

interface AccessGateProps {
  onUnlocked: () => void;
}

/**
 * Section 14.4. This protects the Azure subscription from unknown internet
 * users. It is not a parental lock and never affects access to a solution.
 */
export function AccessGate({ onUnlocked }: AccessGateProps) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode: code }),
      });

      if (response.ok) {
        onUnlocked();
        return;
      }
      setError("That code did not work. Check it and try again.");
    } catch {
      setError("Could not reach the app just now. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-[680px] px-4 pt-16 sm:px-6">
      <h1 className="font-serif text-2xl text-ink">Next Thought</h1>
      <p className="mt-2 text-sm text-ink-soft">
        This app is set up for one household. Enter the access code to continue.
      </p>

      <form onSubmit={submit} className="mt-6">
        <label htmlFor="access-code" className="text-sm font-medium text-ink">
          Access code
        </label>
        <input
          id="access-code"
          type="password"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          className="mt-2 min-h-11 w-full rounded-md border border-rule bg-surface px-3 py-2.5 text-ink"
        />

        {error ? (
          <p role="alert" className="mt-3 rounded-sm bg-error-soft px-3 py-2 text-sm text-error">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy || code.length === 0}
          className="mt-4 min-h-11 w-full rounded-md bg-action px-4 py-3 font-medium text-white disabled:opacity-50"
        >
          {busy ? "Checking" : "Continue"}
        </button>
      </form>
    </main>
  );
}
