import { getQueue } from "@/lib/server/review";
import { json, withUser } from "@/lib/server/api";

export const GET = withUser(async (_req, user) => json(await getQueue(user)));
