// Build: TypeScript → pagina per l'artifact claude.ai + file HTML completo da aprire nel browser.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const out = await build({
  entryPoints: ["src/app.ts"],
  bundle: true,
  format: "iife",
  target: "es2020",
  minify: true,
  write: false,
  legalComments: "none",
});
// Programma per l'aggiornamento automatico (gira in Node nella sessione pianificata)
await build({
  entryPoints: ["src/cli/feed-cli.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "tools/feed.mjs",
  banner: { js: "// Generato da src/cli/feed-cli.ts con build.mjs: non modificare a mano." },
  legalComments: "none",
});
// Programma «Hotel oggi» per l'AlpStay App Hub (gira in Node nella sessione pianificata)
await build({
  entryPoints: ["src/hotel-oggi/cli.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "tools/hotel-oggi.mjs",
  banner: { js: "// Generato da src/hotel-oggi/cli.ts con build.mjs: non modificare a mano." },
  legalComments: "none",
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const page = readFileSync("src/page.html", "utf8");
if (!page.includes("/*APP_SCRIPT*/")) throw new Error("segnaposto mancante");
const body = page.replace("/*APP_SCRIPT*/", () => js);
mkdirSync("dist", { recursive: true });
// 1) contenuto per l'artifact (lo scheletro <html><head> lo aggiunge la piattaforma)
writeFileSync("dist/benvenuto-hartmann.html", body);
// 2) documento HTML completo, apribile con doppio clic
const full = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>:root{color-scheme:light}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
${body}
</body>
</html>
`;
writeFileSync("dist/Benvenuto Hartmann.html", full);
console.log("ok", Math.round(full.length / 1024), "KB");
