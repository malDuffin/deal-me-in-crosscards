import { createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="felt-bg grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-sm rounded-[28px] border border-border bg-surface p-6">
        <p className="text-[11px] uppercase tracking-[0.2em] text-fg-subtle">CrossCards</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Optional — play as a guest, or save high scores to your account.
        </p>
        <div className="mt-5 space-y-2">
          {authEnabled ? (
            GROK_PROVIDERS.map((p) => (
              <Button
                key={p.providerId}
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => void signIn(p.providerId, { callbackURL: "/" })}
              >
                Continue with {p.label}
              </Button>
            ))
          ) : (
            <p className="text-sm text-fg-subtle">Sign-in is disabled.</p>
          )}
        </div>
        <Link
          to="/"
          className="mt-5 block text-center text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline"
        >
          Back to lobby
        </Link>
      </div>
    </main>
  );
}
