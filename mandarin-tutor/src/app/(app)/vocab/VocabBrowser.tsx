"use client";
import { useMemo, useState } from "react";
import type { Word } from "@prisma/client";
import { CATEGORIES, LEVELS } from "@/data/vocab";
import { Reading } from "@/components/Reading";
import { SpeakButton } from "@/components/SpeakButton";
import { CategoryBadge, WordDetails } from "@/components/WordCard";

type Status = "learning" | "learned";

export function VocabBrowser({ words, status, userLevel }: { words: Word[]; status: Record<number, Status>; userLevel: string }) {
  const [level, setLevel] = useState<string>(userLevel);
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  const levelCounts = useMemo(() => {
    const m: Record<string, { total: number; learned: number }> = {};
    for (const w of words) {
      m[w.level] ??= { total: 0, learned: 0 };
      m[w.level].total++;
      if (status[w.id] === "learned") m[w.level].learned++;
    }
    return m;
  }, [words, status]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return words.filter((w) => {
      if (needle) {
        const plain = w.pinyin.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
        return (
          w.hanzi.includes(needle) ||
          w.english.toLowerCase().includes(needle) ||
          plain.replace(/['\s]/g, "").includes(needle.replace(/\s/g, "")) ||
          w.zhuyin.includes(needle)
        );
      }
      return (level === "all" || w.level === level) && (cat === "all" || w.category === cat);
    });
  }, [words, level, cat, q]);

  const chip = (on: boolean) =>
    `shrink-0 rounded-full border px-3 py-1 text-sm ${on ? "border-ink bg-ink text-paper" : "border-line bg-card text-ink-2"}`;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-bold">Words</h1>
        <p className="text-sm text-muted">{Object.values(status).filter((s) => s === "learned").length} / {words.length} learned</p>
      </div>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search 字, pinyin (xuesheng), ㄅㄆㄇ or English"
        className="w-full rounded-xl border border-line bg-card px-3 py-2.5"
        aria-label="Search words"
      />
      {!q && (
        <>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="TOCFL level">
            {LEVELS.map((l) => (
              <button key={l.id} role="tab" aria-selected={level === l.id} className={chip(level === l.id)} onClick={() => setLevel(l.id)}>
                {l.name}
                <span className="ml-1 text-xs opacity-70">
                  {levelCounts[l.id]?.learned ?? 0}/{levelCounts[l.id]?.total ?? 0}
                </span>
              </button>
            ))}
            <button role="tab" aria-selected={level === "all"} className={chip(level === "all")} onClick={() => setLevel("all")}>All levels</button>
          </div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Topic">
            <button className={chip(cat === "all")} onClick={() => setCat("all")}>All topics</button>
            {CATEGORIES.map((c) => (
              <button key={c.id} className={chip(cat === c.id)} onClick={() => setCat(c.id)}>
                {c.emoji} {c.name}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">
            {LEVELS.find((l) => l.id === level)?.band} {LEVELS.find((l) => l.id === level)?.zh}
          </p>
        </>
      )}
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card" data-testid="vocab-list">
        {filtered.map((w) => (
          <li key={w.id}>
            <div className="flex items-center gap-3 px-3 py-2.5">
              <SpeakButton text={w.hanzi} pinyinNum={w.pinyinNum} size="sm" label={`Play ${w.hanzi}`} />
              <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setOpen(open === w.id ? null : w.id)} aria-expanded={open === w.id}>
                <span lang="zh-TW" className="han w-20 shrink-0 text-2xl">{w.hanzi}</span>
                <span className="min-w-0 flex-1">
                  <Reading pinyin={w.pinyin} zhuyin={w.zhuyin} size="sm" />
                  <span className="block truncate text-sm">{w.english}</span>
                </span>
                <StatusDot s={status[w.id]} />
              </button>
            </div>
            {open === w.id && (
              <div className="border-t border-line bg-paper/50 px-3 py-4">
                <div className="mb-3 flex justify-center"><CategoryBadge category={w.category} /></div>
                <WordDetails word={w} />
              </div>
            )}
          </li>
        ))}
        {!filtered.length && <li className="p-6 text-center text-muted">No words match.</li>}
      </ul>
    </div>
  );
}

function StatusDot({ s }: { s?: Status }) {
  const label = s === "learned" ? "Learned" : s === "learning" ? "Learning" : "New";
  const cls = s === "learned" ? "bg-jade" : s === "learning" ? "bg-[var(--t2)]" : "bg-line";
  return <span title={label} aria-label={label} className={`h-2.5 w-2.5 shrink-0 rounded-full ${cls}`} />;
}
