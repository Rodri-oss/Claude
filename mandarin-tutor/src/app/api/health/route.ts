import { prisma } from "@/lib/server/db";

export async function GET() {
  const words = await prisma.word.count();
  return Response.json({ ok: true, words });
}
