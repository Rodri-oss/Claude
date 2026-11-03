import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/server/user";
import { getToneStats } from "@/lib/server/stats";
import { parseFocus } from "@/lib/server/focus";
import { MinimalPairs } from "./MinimalPairs";

export const metadata: Metadata = { title: "Minimal pairs" };

export default async function PairsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const { stats, weakest } = await getToneStats(user);
  return <MinimalPairs initialStats={stats} weakest={weakest} focus={parseFocus(sp.focus, weakest)} />;
}
