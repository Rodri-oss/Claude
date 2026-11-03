// Bundle the standalone tutor into one HTML file for hosting as a Claude artifact.
//   node artifact/build.mjs [out.html]
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? path.join(here, "dist", "tutor.html");
const res = await build({
  entryPoints: [path.join(here, "app.ts")],
  bundle: true,
  format: "iife",
  target: "es2020",
  minify: true,
  write: false,
  tsconfig: path.join(here, "..", "tsconfig.json"),
  logLevel: "warning",
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const html = readFileSync(path.join(here, "shell.html"), "utf8").replace("/*APP*/", () => js);
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
