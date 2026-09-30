"use client";

import { useEffect, useState } from "react";
import { Bot, Check, Copy } from "lucide-react";
import { useAuth } from "./auth-provider";
import { useStores } from "./stores-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Card } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { disconnectApp, listenConnectedApps, type ConnectedApp } from "@/lib/firebase/grants";
import { formatDate } from "@/lib/format";
import { MCP_RESOURCE_URL, WRITE_SCOPES } from "@/lib/oauth/config";
import { t } from "@/lib/i18n/en";

/** Settings section: connector URL, how to connect, and the list of connected assistants. */
export function ConnectorsPanel() {
  const { user } = useAuth();
  const { stores } = useStores();
  const { toast } = useToast();
  const [apps, setApps] = useState<ConnectedApp[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [removing, setRemoving] = useState<ConnectedApp | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    return listenConnectedApps(
      user.uid,
      (list) => {
        setLoadError(false);
        setApps(list);
      },
      () => setLoadError(true),
    );
  }, [user]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(MCP_RESOURCE_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t.connectors.urlLabel, MCP_RESOURCE_URL);
    }
  }

  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? t.connectors.unknownStore;

  return (
    <Card className="mt-8 p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
        <Bot className="h-5 w-5 text-[var(--brand)]" aria-hidden="true" /> {t.connectors.title}
      </h2>
      <p className="mt-1 text-sm text-gray-600">{t.connectors.intro}</p>

      <p className="mt-4 text-sm font-medium text-gray-800">{t.connectors.urlLabel}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-800">{MCP_RESOURCE_URL}</code>
        <Button variant="secondary" size="sm" className="min-w-11" onClick={copy} aria-label={copied ? t.connectors.urlCopied : t.connectors.copyUrl}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
      <p className="sr-only" aria-live="polite">{copied ? t.connectors.urlCopied : ""}</p>

      <p className="mt-4 text-sm font-medium text-gray-800">{t.connectors.howTo}</p>
      {[
        { title: t.connectors.claudeTitle, steps: t.connectors.claudeSteps },
        { title: t.connectors.chatgptTitle, steps: t.connectors.chatgptSteps },
      ].map((block) => (
        <div key={block.title} className="mt-2">
          <p className="text-sm text-gray-800">{block.title}</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-gray-700">
            {block.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ))}
      <p className="mt-2 text-xs text-gray-600">{t.connectors.safety}</p>
      <p className="mt-1 text-xs text-gray-600">{t.connectors.changeAccess}</p>

      <p className="mt-5 text-sm font-medium text-gray-800">{t.connectors.connected}</p>
      {loadError ? (
        <p role="alert" className="mt-1 text-sm text-red-600">{t.connectors.loadError}</p>
      ) : apps === null ? (
        <p className="mt-1 text-sm text-gray-500">{t.common.loading}</p>
      ) : apps.length === 0 ? (
        <p className="mt-1 text-sm text-gray-500">{t.connectors.none}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {apps.map((app) => (
            <li key={app.id} className="flex items-start gap-3 rounded-xl border border-gray-200 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium text-gray-900 [overflow-wrap:anywhere]">
                  {app.clientName} <span className="font-normal text-gray-500">({app.clientHost})</span>
                </p>
                <p className="text-xs text-gray-600">{t.connectors.access(app.scopes.some((s) => (WRITE_SCOPES as string[]).includes(s)))}</p>
                <p className="text-xs text-gray-600">{t.connectors.storesLine(app.storeIds.map(storeName).join(", "))}</p>
                <p className="text-xs text-gray-600">
                  {t.connectors.connectedOn(formatDate(app.createdAt))}
                  {app.lastUsedAt ? `, ${t.connectors.lastUsed(formatDate(app.lastUsedAt))}` : ""}
                </p>
              </div>
              <Button variant="ghost" size="sm" className="shrink-0 text-red-600" onClick={() => setRemoving(app)} aria-label={t.connectors.disconnectNamed(app.clientName)}>
                {t.connectors.disconnect}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        message={removing ? t.connectors.disconnectConfirm(removing.clientName) : ""}
        confirmLabel={t.connectors.disconnect}
        loading={busy}
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          setBusy(true);
          try {
            await disconnectApp(removing.id);
            toast(t.connectors.disconnected);
            setRemoving(null);
          } catch {
            toast(t.common.somethingWrong, "error");
          } finally {
            setBusy(false);
          }
        }}
      />
    </Card>
  );
}
