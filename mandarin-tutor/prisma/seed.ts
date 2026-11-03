import { PrismaClient } from "@prisma/client";
import { buildVocab } from "../src/data/vocab";

const prisma = new PrismaClient();

async function main() {
  const vocab = buildVocab();
  for (const v of vocab) {
    await prisma.word.upsert({ where: { hanzi: v.hanzi }, update: v, create: v });
  }
  console.log(`Seeded ${vocab.length} words.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
