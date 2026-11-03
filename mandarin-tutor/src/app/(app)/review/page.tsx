import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/server/user";
import { getQueue } from "@/lib/server/review";
import { ReviewSession } from "./ReviewSession";

export const metadata: Metadata = { title: "Review" };

export default async function ReviewPage() {
  const user = await getCurrentUser();
  const q = await getQueue(user);
  return <ReviewSession initial={q.cards} newPerDay={q.newPerDay} introducedToday={q.introducedToday} />;
}
