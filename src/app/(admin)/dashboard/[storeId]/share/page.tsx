"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, Download, ExternalLink } from "lucide-react";
import { useStore } from "@/components/admin/store-context";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, PageTitle } from "@/components/ui/misc";
import { absoluteUrl } from "@/lib/format";
import { t } from "@/lib/i18n/en";

export default function SharePage() {
  const store = useStore();
  const url = absoluteUrl(`/${store.slug}`);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(url, { width: 512, margin: 2, color: { dark: "#111111", light: "#ffffff" } })
      .then(setQr)
      .catch(console.error);
  }, [url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t.share.copyLink, url);
    }
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-5">
      <PageTitle title={t.share.title} subtitle={store.name} />

      <Card className="p-4">
        <p className="text-sm font-medium text-gray-800">{t.share.storeLink}</p>
        <p className="mt-1 break-all rounded-lg bg-gray-50 px-3 py-2 font-mono text-sm text-gray-800">{url}</p>
        <p className="mt-2 text-xs text-gray-500">{t.share.instagramHint}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={copy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? t.common.copied : t.share.copyLink}
          </Button>
          <a href={url} target="_blank" rel="noopener" className={buttonClass("secondary")}>
            <ExternalLink className="h-4 w-4" /> {t.share.openLink}
          </a>
        </div>
      </Card>

      <Card className="mt-4 p-4">
        <p className="text-sm font-medium text-gray-800">{t.share.qr}</p>
        <p className="mt-1 text-xs text-gray-500">{t.share.qrHint}</p>
        {qr && (
          <div className="mt-3 flex flex-col items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt={`${t.share.qr}: ${url}`} className="h-48 w-48 rounded-xl border border-gray-200" />
            <a href={qr} download={`${store.slug}-qr.png`} className={buttonClass("secondary")}>
              <Download className="h-4 w-4" /> {t.share.downloadQr}
            </a>
          </div>
        )}
      </Card>
    </main>
  );
}
