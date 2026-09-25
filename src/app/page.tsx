import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { t } from "@/lib/i18n/en";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-3xl font-semibold text-gray-900">{t.app.name}</h1>
      <p className="mt-3 text-gray-600">{t.app.tagline}</p>
      <div className="mt-8 flex w-full flex-col gap-3">
        <Link href="/login" className={buttonClass("primary", "lg")}>
          {t.auth.signIn}
        </Link>
        <Link href="/jr-demo" className={buttonClass("secondary", "lg")}>
          View demo catalog
        </Link>
      </div>
    </main>
  );
}
