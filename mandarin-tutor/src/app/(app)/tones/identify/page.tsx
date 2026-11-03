import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/server/user";
import { getToneStats } from "@/lib/server/stats";
import { parseFocus } from "@/lib/server/focus";
import { ToneId } from "./ToneId";

export const metadata: Metadata = { title: "Tone ID" };

export default async function ToneIdPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const { stats, weakest } = await getToneStats(user);
  return <ToneId initialStats={stats} weakest={weakest} focus={parseFocus(sp.focus, weakest)} />;
}
