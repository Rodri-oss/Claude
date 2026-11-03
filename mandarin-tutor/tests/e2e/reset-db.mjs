// Fresh, seeded database for every e2e run (runs before the test web server starts).
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

for (const f of ["prisma/e2e.db", "prisma/e2e.db-journal"]) rmSync(f, { force: true });
const env = { ...process.env, DATABASE_URL: "file:./e2e.db" };
execSync("npx prisma migrate deploy", { env, stdio: "inherit" });
execSync("npx prisma db seed", { env, stdio: "inherit" });
