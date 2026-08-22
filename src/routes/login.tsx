import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { GROK_PROVIDERS, authClient, authEnabled, getBearerToken, signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { emailFromDeskId, TEST_DESK_ID } from "@/lib/desk-login";
import { seedTestDeskUser } from "@/lib/server/seed-test-user";

export const Route = createFileRoute("/login")({
  loader: async () => {
    await seedTestDeskUser();
    return null;
  },
  component: Login,
});

const BEARER_KEY = "grok-auth.bearer-token";

function Login() {
  const navigate = useNavigate();
  const [id, setId] = useState(TEST_DESK_ID);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void seedTestDeskUser();
  }, []);

  async function onDeskLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await seedTestDeskUser();
      const email = emailFromDeskId(id);
      const { data, error: err } = await authClient.signIn.email({
        email,
        password,
      });
      if (err) {
        setError(err.message ?? "Sign-in failed");
        return;
      }
      const token =
        (data as { token?: string } | null)?.token ??
        (data as { session?: { token?: string } } | null)?.session?.token;
      if (token && typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem(BEARER_KEY, token);
        } catch {
          /* ignore */
        }
      }
      try {
        await authClient.getSession();
      } catch {
        /* store recovers */
      }
      void getBearerToken();
      await navigate({ to: "/" });
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 text-fg">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted">Meridian Final</p>
          <h1 className="mt-2 font-display text-4xl leading-none">The desk that holds.</h1>
          <p className="mt-3 text-sm text-muted">
            Test desk ID {TEST_DESK_ID}. Guest mode still runs the engines without signing in.
          </p>
        </div>
        {authEnabled ? (
          <div className="space-y-4">
            <form onSubmit={(e) => void onDeskLogin(e)} className="space-y-3 rounded-[24px] border border-border bg-surface p-5">
              <label className="block text-xs uppercase tracking-wider text-subtle">
                Login ID
                <Input
                  className="mt-1.5"
                  autoComplete="username"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                />
              </label>
              <label className="block text-xs uppercase tracking-wider text-subtle">
                Password
                <Input
                  className="mt-1.5"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {error && <p className="text-sm text-down">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy || !id || !password}>
                {busy ? "Signing in…" : "Sign in to the desk"}
              </Button>
            </form>
            <div className="space-y-2">
              {GROK_PROVIDERS.map((p) => (
                <Button
                  key={p.providerId}
                  variant="outline"
                  className="w-full"
                  onClick={() => signIn(p.providerId, { callbackURL: "/" })}
                >
                  Continue with {p.label}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">Sign-in is disabled.</p>
        )}
        <Link to="/" className="block text-center text-sm text-muted underline-offset-4 hover:text-fg hover:underline">
          Back to the desk
        </Link>
      </div>
    </main>
  );
}
