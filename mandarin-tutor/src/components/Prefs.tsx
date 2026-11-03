"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface Prefs {
  showPinyin: boolean;
  showZhuyin: boolean;
}

const PrefsContext = createContext<{ prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void }>({
  prefs: { showPinyin: true, showZhuyin: true },
  setPrefs: () => {},
});

export function PrefsProvider({ initial, timezone, children }: { initial: Prefs; timezone: string; children: React.ReactNode }) {
  const [prefs, set] = useState(initial);

  const setPrefs = useCallback((p: Partial<Prefs>) => {
    set((cur) => ({ ...cur, ...p }));
    void fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) });
  }, []);

  // Keep the stored time zone in sync with the browser so "today" and streaks are local.
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz !== timezone) {
      void fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ timezone: tz }) });
    }
  }, [timezone]);

  return <PrefsContext.Provider value={{ prefs, setPrefs }}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  return useContext(PrefsContext);
}
