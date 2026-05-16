"use client";

import { Lock, Loader2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clearStoredAuthKey,
  fetchAuthRequired,
  getCachedAuthRequired,
  getStoredAuthKey,
  onAuthInvalid,
  setStoredAuthKey,
  verifyAuthKey,
} from "@/lib/auth";

type Status = "checking" | "locked" | "unlocked";

function initialStatus(): Status {
  if (typeof window === "undefined") return "checking";
  const cached = getCachedAuthRequired();
  if (cached === false) return "unlocked";
  if (cached === true && getStoredAuthKey()) return "unlocked";
  if (cached === true) return "locked";
  return "checking";
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    setStatus(initialStatus());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const required = await fetchAuthRequired();
      if (cancelled) return;
      if (!required) {
        setStatus("unlocked");
        return;
      }
      const stored = getStoredAuthKey() ?? "";
      if (!stored) {
        setStatus("locked");
        return;
      }
      const ok = await verifyAuthKey(stored);
      if (cancelled) return;
      if (ok) {
        setStatus("unlocked");
      } else {
        clearStoredAuthKey();
        setStatus("locked");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return onAuthInvalid(() => {
      setError("Session rejected. Re-enter your auth key.");
      setStatus("locked");
    });
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (submitting) return;
      const key = input.trim();
      if (!key) {
        setError("Auth key is required.");
        return;
      }
      setSubmitting(true);
      setError(null);
      const ok = await verifyAuthKey(key);
      setSubmitting(false);
      if (ok) {
        setStoredAuthKey(key);
        setInput("");
        setStatus("unlocked");
      } else {
        setError("Invalid auth key.");
      }
    },
    [input, submitting],
  );

  if (status === "unlocked") return <>{children}</>;
  if (status === "checking") return null;

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-gate-title"
        className="fixed inset-0 z-[999] flex items-center justify-center bg-background/80 backdrop-blur-md"
      >
        <div className="w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-border/70 bg-background p-6 shadow-2xl">
          <div className="mb-4 flex items-center gap-2">
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <Lock className="h-4 w-4" strokeWidth={2} />
            </div>
            <div>
              <h2
                id="auth-gate-title"
                className="text-base font-semibold tracking-tight"
              >
                Restricted access
              </h2>
              <p className="text-xs text-muted-foreground">
                Enter the auth key to continue.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Input
              type="password"
              autoFocus
              autoComplete="off"
              placeholder="Auth key"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={submitting}
              aria-invalid={error ? true : undefined}
              className="h-10 text-sm"
            />
            {error && (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={submitting || !input.trim()}
              className="h-10"
            >
              {submitting ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : null}
              Unlock
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Saved locally to this browser. Clear browser storage to sign out.
            </p>
          </form>
        </div>
      </div>
    </>
  );
}

