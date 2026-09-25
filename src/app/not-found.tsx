import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { t } from "@/lib/i18n/en";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-gray-900">{t.errors.notFoundTitle}</h1>
      <p className="mt-2 text-gray-600">{t.errors.notFoundBody}</p>
      <Link href="/" className={buttonClass("secondary", "md", "mt-6")}>
        {t.errors.goHome}
      </Link>
    </main>
  );
}
