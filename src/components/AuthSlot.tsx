import { Link } from "@tanstack/react-router";
import { authEnabled, signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export function AuthSlot() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return <div className="h-8 w-20 animate-pulse rounded-full bg-fg/10" />;
  }
  if (!user) {
    return (
      <Link
        to="/login"
        className="text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline"
      >
        Sign in
      </Link>
    );
  }
  const label = user.displayName ?? user.primaryEmail ?? "Player";
  return (
    <div className="flex items-center gap-2">
      <span className="max-w-28 truncate text-sm text-fg-muted">{label}</span>
      {authEnabled ? (
        <button
          type="button"
          onClick={() => void signOut()}
          className="text-sm text-fg-subtle underline-offset-4 hover:text-fg hover:underline"
        >
          Sign out
        </button>
      ) : null}
    </div>
  );
}
