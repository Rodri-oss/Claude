"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SURVEY } from "@/data/survey";

type Answers = { level?: string; reason?: string; reasonOther?: string; mostUseful?: string; wtp?: string; comment?: string };

/** Checks on each page change whether the post-5th-session survey is due. */
export function SurveyGate() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [a, setA] = useState<Answers>({});
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (path.startsWith("/review") || path.startsWith("/tones/")) return; // don't interrupt an exercise
    let alive = true;
    void fetch("/api/survey")
      .then((r) => (r.ok ? r.json() : { show: false }))
      .then((d) => alive && d.show && setOpen(true));
    return () => {
      alive = false;
    };
  }, [path]);

  if (!open) return null;

  const dismiss = () => {
    setOpen(false);
    if (state !== "done") void fetch("/api/survey/dismiss", { method: "POST", keepalive: true });
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    setError(null);
    const res = await fetch("/api/survey", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(a) });
    if (res.ok) setState("done");
    else {
      setError((await res.json()).error ?? "Something went wrong");
      setState("idle");
    }
  }

  const q = (key: "level" | "reason" | "mostUseful" | "wtp") => {
    const def = SURVEY[key];
    return (
      <fieldset className="space-y-1.5">
        <legend className="mb-1.5 font-semibold">{def.question}</legend>
        <div className="flex flex-wrap gap-1.5">
          {def.options.map((o) => (
            <label key={o.id} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${a[key] === o.id ? "border-accent bg-accent text-accent-ink" : "border-line bg-card"}`}>
              <input type="radio" name={key} value={o.id} className="sr-only" checked={a[key] === o.id} onChange={() => setA({ ...a, [key]: o.id })} />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="survey-title">
      <div className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-paper p-5 shadow-xl sm:rounded-3xl">
        {state === "done" ? (
          <div className="space-y-3 py-6 text-center" data-testid="survey-thanks">
            <p className="text-4xl">🙏</p>
            <h2 className="text-xl font-bold"><span lang="zh-TW" className="han">謝謝！</span> Thank you!</h2>
            <p className="text-ink-2">Your answers help decide what gets built next.</p>
            <button className="rounded-xl bg-accent px-5 py-2.5 font-medium text-accent-ink" onClick={() => setOpen(false)}>Back to studying</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <div>
              <h2 id="survey-title" className="text-xl font-bold">Quick question: 4 answers, 30 seconds</h2>
              <p className="text-sm text-ink-2">You&apos;ve been studying for a few sessions now. Help shape what this app becomes.</p>
            </div>
            {q("level")}
            {q("reason")}
            {a.reason === "other" && (
              <input className="w-full rounded-xl border border-line bg-card px-3 py-2" placeholder="Tell us more (optional)" maxLength={200} value={a.reasonOther ?? ""} onChange={(e) => setA({ ...a, reasonOther: e.target.value })} />
            )}
            {q("mostUseful")}
            {q("wtp")}
            <label className="block space-y-1.5">
              <span className="font-semibold">Anything else? <span className="font-normal text-muted">(optional)</span></span>
              <textarea className="w-full rounded-xl border border-line bg-card px-3 py-2" rows={2} maxLength={1000} value={a.comment ?? ""} onChange={(e) => setA({ ...a, comment: e.target.value })} />
            </label>
            {error && <p className="text-sm text-[var(--t1)]">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={state === "saving" || !a.level || !a.reason || !a.mostUseful || !a.wtp} className="flex-1 rounded-xl bg-accent py-3 font-semibold text-accent-ink disabled:opacity-50">
                Submit
              </button>
              <button type="button" onClick={dismiss} className="rounded-xl border border-line px-4 py-3 text-ink-2">Not now</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
