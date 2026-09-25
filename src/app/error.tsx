"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n/en";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-gray-900">{t.errors.errorTitle}</h1>
      <p className="mt-2 text-gray-600">{t.errors.errorBody}</p>
      <Button variant="secondary" className="mt-6" onClick={reset}>
        {t.common.retry}
      </Button>
    </main>
  );
}
