"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, BadgeCheck, Check } from "lucide-react";
import { useAuth } from "@/components/admin/auth-provider";
import { Button, buttonClass } from "@/components/ui/button";
import { Switch } from "@/components/ui/field";
import { PageSpinner } from "@/components/ui/spinner";
import { signOut } from "@/lib/firebase/auth";
import { listenStores } from "@/lib/firebase/stores";
import { SCOPES, WRITE_SCOPES } from "@/lib/oauth/config";
import { useHydrated } from "@/lib/local-storage";
import type { Store } from "@/lib/schemas/types";
import { t } from "@/lib/i18n/en";

// OAuth consent screen for AI assistant connectors (authorization endpoint).

type ConsentView = {
  clientName: string;
  clientKind: "cimd" | "dcr";
  trusted: boolean;
  webRedirect: boolean;
  verifiedHost: string | null;
  redirectHost: string;
  loopbackOnly: boolean;
  scopes: string[];
};

type CheckResult =
  | { ok: true; view: ConsentView }
  | { ok: false; kind: "show"; error: string; description: string }
  | { ok: false; kind: "redirect"; error: string; redirectTo: string; redirectHost: string; description: string };

export default function AuthorizePage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Consent />
    </Suspense>
  );
}

function Consent() {
  const search = useSearchParams();
  const query = search.toString();
  const params = useMemo(() => Object.fromEntries(new URLSearchParams(query).entries()), [query]);
  const { user, loading } = useAuth();
  const hydrated = useHydrated();
  const framed = hydrated && window.top !== window.self;
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [stores, setStores] = useState<Store[] | null>(null);
  const [storesError, setStoresError] = useState(false);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [allowChanges, setAllowChanges] = useState(true);
  const [busy, setBusy] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/oauth/authorize?${query}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<CheckResult>)
      .then((result) => {
        // Errors are never followed automatically; see the "Return to" button below.
        if (!cancelled) setCheck(result);
      })
      .catch(() => !cancelled && setCheck({ ok: false, kind: "show", error: "server_error", description: t.common.somethingWrong }));
    return () => {
      cancelled = true;
    };
  }, [query]);

  useEffect(() => {
    if (!user) return;
    return listenStores(
      user.uid,
      (list) => {
        setStoresError(false);
        setStores(list);
      },
      () => setStoresError(true),
    );
  }, [user]);

  // Only ids of stores that still exist (a store deleted meanwhile drops out of the selection).
  const chosen = (picked ?? stores?.map((s) => s.id) ?? []).filter((id) => stores?.some((s) => s.id === id));

  async function decide(decision: "allow" | "deny") {
    setError(null);
    if (decision === "allow" && !chosen.length) {
      setError(t.consent.chooseStore);
      return;
    }
    setBusy(true);
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (decision === "allow" && user) headers.authorization = `Bearer ${await user.getIdToken()}`;
      const res = await fetch("/api/oauth/authorize", {
        method: "POST",
        headers,
        body: JSON.stringify({ decision, params, storeIds: chosen, allowChanges }),
      });
      const body = (await res.json().catch(() => ({}))) as { redirectTo?: string; kind?: string; description?: string; error?: string };
      if (body.kind === "redirect" || body.kind === "show") {
        setCheck(body as CheckResult);
      } else if (body.redirectTo) {
        setRedirecting(true);
        window.location.assign(body.redirectTo);
        return;
      }
      else setError((body.error && t.consent.approveErrors[body.error]) || t.common.somethingWrong);
    } catch {
      setError(t.common.somethingWrong);
    }
    setBusy(false);
  }

  if (framed) return <Centered><p className="text-sm text-gray-700" role="alert">{t.consent.framed}</p></Centered>;
  if (redirecting) return <Centered><p className="text-sm text-gray-600" role="status">{t.consent.redirecting}</p></Centered>;
  if (!check || loading) return <PageSpinner label={t.consent.checking} />;

  if (!check.ok) {
    const friendly = t.consent.errors[check.error];
    return (
      <Centered>
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-600" aria-hidden="true" />
        <h1 className="mt-3 text-lg font-semibold text-gray-900">{t.consent.errorTitle}</h1>
        <p className="mt-2 text-sm text-gray-700">{friendly ?? check.description}</p>
        <p className="mt-2 text-xs text-gray-500">{t.consent.tryAgainHint}</p>
        {friendly && (
          <details className="mt-2 text-xs text-gray-500">
            <summary className="min-h-11 cursor-pointer">{t.consent.details}</summary>
            <p className="break-words">{check.description}</p>
          </details>
        )}
        {check.kind === "redirect" && (
          <Button variant="secondary" className="mt-4" onClick={() => window.location.assign(check.redirectTo)}>
            {t.consent.returnTo(check.redirectHost)}
          </Button>
        )}
      </Centered>
    );
  }

  const view = check.view;
  const appHost = view.verifiedHost ?? view.redirectHost;
  const wants = (scope: string) => view.scopes.includes(scope);
  const wantsWrite = view.scopes.some((s) => (WRITE_SCOPES as string[]).includes(s));
  const next = `/oauth/authorize?${query}`;

  return (
    <Centered>
      {view.trusted && view.verifiedHost ? (
        <>
          <h1 className="text-xl font-semibold text-gray-900 [overflow-wrap:anywhere]">{t.consent.title(view.clientName)}</h1>
          <p className="mt-1 inline-flex items-center gap-1 text-sm text-green-700">
            <BadgeCheck className="h-4 w-4" aria-hidden="true" /> {t.consent.verifiedFrom(view.verifiedHost)}
          </p>
        </>
      ) : (
        <>
          <h1 className="text-xl font-semibold text-gray-900 [overflow-wrap:anywhere]">
            {view.loopbackOnly ? t.consent.unverifiedLocalTitle : t.consent.unverifiedTitle(appHost)}
          </h1>
          <p className="mt-2 flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-left text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 [overflow-wrap:anywhere]">{t.consent.unverifiedName(view.clientName)}</span>
          </p>
        </>
      )}

      {!user ? (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-gray-700">{t.consent.signInPrompt}</p>
          <Link href={`/login?next=${encodeURIComponent(next)}`} className={buttonClass("primary", "lg", "w-full")}>
            {t.consent.signIn}
          </Link>
          <Button variant="ghost" full onClick={() => decide("deny")} disabled={busy}>
            {t.consent.deny}
          </Button>
        </div>
      ) : (
        <div className="mt-5 space-y-5 text-left">
          <p className="text-xs text-gray-500">
            {t.consent.signedInAs(user.email ?? "")} ·{" "}
            <button type="button" className="min-h-11 underline" onClick={() => signOut()}>
              {t.consent.notYou}
            </button>
          </p>

          <section>
            <h2 className="text-sm font-medium text-gray-800">{t.consent.willBeAbleTo}</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
              {(
                [
                  [wants(SCOPES.catalogRead), t.consent.canReadCatalog],
                  [wants(SCOPES.quotesRead), t.consent.canReadQuotes],
                  [allowChanges && wants(SCOPES.catalogWrite), t.consent.canWriteCatalog],
                  [allowChanges && wants(SCOPES.quotesWrite), t.consent.canWriteQuotes],
                ] as [boolean, string][]
              )
                .filter(([granted]) => granted)
                .map(([, line]) => line)
                .map((line) => (
                  <li key={line} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
                    {line}
                  </li>
                ))}
            </ul>
            <p className="mt-2 text-xs text-gray-500">{t.consent.cannot}</p>
          </section>

          {wantsWrite && <Switch checked={allowChanges} onChange={setAllowChanges} label={t.consent.allowChanges} hint={t.consent.allowChangesHint} />}

          <fieldset>
            <legend className="text-sm font-medium text-gray-800">{t.consent.storesTitle}</legend>
            {storesError ? (
              <p role="alert" className="mt-2 text-sm text-red-600">{t.consent.storesError}</p>
            ) : stores === null ? (
              <p className="mt-2 text-sm text-gray-500">{t.common.loading}</p>
            ) : stores.length === 0 ? (
              <p className="mt-2 text-sm text-gray-600">
                {t.consent.noStores}{" "}
                {/* New tab: this page keeps the pending connection and fills in the store once it exists. */}
                <a href="/dashboard/new" target="_blank" rel="noopener" className="inline-flex min-h-11 items-center underline">
                  {t.consent.createStoreNewTab}
                </a>
              </p>
            ) : (
              <div className="mt-2 space-y-1">
                {stores.map((s) => (
                  <label key={s.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-gray-200 px-3">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-[var(--brand)]"
                      checked={chosen.includes(s.id)}
                      onChange={(e) => setPicked(e.target.checked ? [...chosen, s.id] : chosen.filter((id) => id !== s.id))}
                    />
                    <span className="min-w-0 break-words text-sm text-gray-900">{s.name}</span>
                    <span className="ml-auto text-xs text-gray-500">/{s.slug}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <p className="text-xs text-gray-500">{t.consent.redirectsTo(view.redirectHost)}</p>
          {view.loopbackOnly && (
            <p className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> {t.consent.loopbackWarning}
            </p>
          )}

          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

          <div className="flex flex-col gap-2">
            <Button size="lg" full onClick={() => decide("allow")} loading={busy} disabled={!stores?.length}>
              {t.consent.approve}
            </Button>
            <Button variant="ghost" full onClick={() => decide("deny")} disabled={busy}>
              {t.consent.deny}
            </Button>
          </div>
        </div>
      )}
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 text-center shadow-sm">{children}</div>
    </main>
  );
}
