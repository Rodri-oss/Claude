import Link from "next/link";

export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-6 flex items-baseline justify-center gap-2">
        <span lang="zh-TW" className="han text-2xl font-bold text-accent">華語</span>
        <span className="font-semibold">Taiwan Tutor</span>
      </Link>
      <div className="rounded-3xl border border-line bg-card p-6 shadow-sm">{children}</div>
    </div>
  );
}
