import { useState } from "react";
import { useTranslation as useUiTranslation } from "react-i18next";

/** The host supplies only an identifying UA suffix, not a privileged JS bridge. */
export function IOSNotice() {
  const { t } = useUiTranslation();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !navigator.userAgent.includes("MarinaraIOS/1")) return null;
  return (
    <aside className="fixed top-2 right-2 left-2 z-[100] rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-sm text-[var(--foreground)] shadow-lg">
      <details>
        <summary className="cursor-pointer font-medium">{t("ios.notice.title")}</summary>
        <p className="mt-2">{t("ios.notice.body")}</p>
        <p className="mt-2">{t("ios.notice.extensions")}</p>
        <p className="mt-2">{t("ios.notice.backup")}</p>
      </details>
      <button
        type="button"
        className="mt-2 min-h-11 rounded px-3 text-[var(--primary)]"
        onClick={() => setDismissed(true)}
      >
        {t("ios.notice.dismiss")}
      </button>
    </aside>
  );
}
