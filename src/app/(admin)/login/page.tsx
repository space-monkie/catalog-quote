"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/admin/auth-provider";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PageSpinner } from "@/components/ui/spinner";
import { authErrorMessage, signInWithEmail, signInWithGoogle, signUpWithEmail } from "@/lib/firebase/auth";
import { t } from "@/lib/i18n/en";

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  if (loading || user) return <PageSpinner />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signin") await signInWithEmail(email.trim(), password);
      else await signUpWithEmail(name, email.trim(), password);
      router.replace("/dashboard");
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
      router.replace("/dashboard");
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-6 text-center text-sm font-semibold text-[var(--brand)]">
        {t.app.name}
      </Link>
      <h1 className="text-2xl font-semibold text-gray-900">{mode === "signin" ? t.auth.signIn : t.auth.signUp}</h1>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        {mode === "signup" && (
          <Field label={t.auth.name}>
            {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />}
          </Field>
        )}
        <Field label={t.auth.email}>
          {(id) => (
            <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required />
          )}
        </Field>
        <Field label={t.auth.password} hint={mode === "signup" ? t.auth.passwordHint : undefined}>
          {(id, describedBy) => (
            <Input
              id={id}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              aria-describedby={describedBy}
              minLength={mode === "signup" ? 8 : undefined}
              required
            />
          )}
        </Field>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" full loading={busy}>
          {mode === "signin" ? t.auth.signIn : t.auth.signUp}
        </Button>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs text-gray-400">
        <span className="h-px flex-1 bg-gray-200" />
        {t.auth.or}
        <span className="h-px flex-1 bg-gray-200" />
      </div>
      <Button variant="secondary" size="lg" full onClick={google} disabled={busy}>
        {t.auth.continueWithGoogle}
      </Button>
      <p className="mt-6 text-center text-sm text-gray-600">
        {mode === "signin" ? t.auth.noAccount : t.auth.haveAccount}{" "}
        <button
          type="button"
          className="min-h-11 font-medium text-[var(--brand)] underline"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
          }}
        >
          {mode === "signin" ? t.auth.switchToSignUp : t.auth.switchToSignIn}
        </button>
      </p>
    </main>
  );
}
