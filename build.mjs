// Build: TypeScript → pagina per l'artifact claude.ai + file HTML completo da aprire nel browser.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

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
// Aggiornamento su GitHub Actions direttamente dal connettore La Scatola (/mcp)
await build({
  entryPoints: ["src/cli/github-feed.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "tools/github-feed.mjs",
  minify: true,
  banner: {
    js: "// Generato da src/cli/github-feed.ts con build.mjs: non modificare a mano.\nimport { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  legalComments: "none",
});
// Lettura della casella Gmail dei Guest Pass (GitHub Actions «Guest Pass dalla casella»): guestpass.json cifrato
await build({
  entryPoints: ["src/cli/guestpass-feed.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "tools/guestpass-feed.mjs",
  minify: true,
  banner: {
    js: "// Generato da src/cli/guestpass-feed.ts con build.mjs: non modificare a mano.\nimport { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
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
// 2) documento HTML completo (index.html su GitHub Pages), con Content-Security-Policy: gira solo lo script
//    dell'app (impronta sha256) e pdfmake con controllo di integrità; la pagina può scaricare dati solo dal
//    proprio sito (connect-src 'self'), quindi nomi e password non possono partire verso altri indirizzi.
const inlineHashes = (html) =>
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`);
const PDFMAKE_URL = "https://cdn.jsdelivr.net/npm/pdfmake@0.2.20/build/pdfmake.min.js";
if (!body.includes(`src="${PDFMAKE_URL}" integrity="sha384-`)) throw new Error("pdfmake senza controllo di integrità in src/page.html");
const appCsp = [
  "default-src 'none'",
  `script-src ${inlineHashes(body).join(" ")} ${PDFMAKE_URL}`,
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
].join("; ");
const full = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${appCsp}">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>:root{color-scheme:light}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
${body}
</body>
</html>
`;
writeFileSync("dist/Benvenuto Hartmann.html", full);
writeFileSync("index.html", full);
console.log("ok", Math.round(full.length / 1024), "KB");

// Pagina avvisi/ (email pre-arrivo agli ospiti): legge ../arrivi.json (blocco «avvisi» cifrato) con la stessa
// password reception delle lettere. Content-Security-Policy come index.html: solo il proprio script, dati solo dal
// proprio sito, così email e link di check-in non possono partire verso altri indirizzi.
{
  const a = await build({ entryPoints: ["src/avvisi/app.ts"], bundle: true, format: "iife", target: "es2020", minify: true, write: false, legalComments: "none" });
  const ajs = a.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const tpl = readFileSync("src/avvisi/page.html", "utf8");
  if (!tpl.includes("/*__APP__*/")) throw new Error("segnaposto mancante in src/avvisi/page.html");
  const cut = tpl.indexOf('<div id="app">');
  if (cut < 0) throw new Error("<div id=\"app\"> mancante in src/avvisi/page.html");
  const head = tpl.slice(0, cut).trim();
  const bodyPart = tpl.slice(cut).replace("/*__APP__*/", () => ajs).trim();
  const avvisiCsp = [
    "default-src 'none'",
    `script-src ${inlineHashes(bodyPart).join(" ")}`,
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "form-action 'none'",
  ].join("; ");
  mkdirSync("avvisi", { recursive: true });
  const pagina = `<!doctype html>\n<html lang="it">\n<head>\n<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${avvisiCsp}">\n<meta name="referrer" content="no-referrer">\n<meta name="robots" content="noindex, nofollow">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n${head}\n</head>\n<body>\n${bodyPart}\n</body>\n</html>\n`;
  writeFileSync("avvisi/index.html", pagina);
  console.log("ok avvisi/index.html", Math.round(pagina.length / 1024), "KB");
}
// Pagina checkin/ (check-in online ed email diretta degli ospiti): legge lo stesso blocco «avvisi» di ../arrivi.json con
// la password reception. Content-Security-Policy come avvisi/: solo il proprio script e dati solo dal proprio sito, così
// email e link di check-in non possono partire verso altri indirizzi. In più dist/checkin-prova.html: la stessa pagina
// con ospiti inventati, per l'anteprima (artifact) senza password e senza dati reali.
{
  const tpl = readFileSync("src/checkin/page.html", "utf8");
  if (!tpl.includes("/*__APP__*/")) throw new Error("segnaposto mancante in src/checkin/page.html");
  const cut = tpl.indexOf('<div id="app">');
  if (cut < 0) throw new Error("<div id=\"app\"> mancante in src/checkin/page.html");
  const head = tpl.slice(0, cut).trim();
  const bundle = async (entry) => {
    const r = await build({ entryPoints: [entry], bundle: true, format: "iife", target: "es2020", minify: true, write: false, legalComments: "none" });
    return r.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  };
  const appJs = await bundle("src/checkin/app.ts");
  const bodyPart = tpl.slice(cut).replace("/*__APP__*/", () => appJs).trim();
  const checkinCsp = [
    "default-src 'none'",
    `script-src ${inlineHashes(bodyPart).join(" ")}`,
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "form-action 'none'",
  ].join("; ");
  mkdirSync("checkin", { recursive: true });
  const pagina = `<!doctype html>\n<html lang="it">\n<head>\n<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${checkinCsp}">\n<meta name="referrer" content="no-referrer">\n<meta name="robots" content="noindex, nofollow">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n${head}\n</head>\n<body>\n${bodyPart}\n</body>\n</html>\n`;
  writeFileSync("checkin/index.html", pagina);
  console.log("ok checkin/index.html", Math.round(pagina.length / 1024), "KB");
  const provaJs = await bundle("src/checkin/prova.ts");
  const prova = `<meta name="claude:viewport-fit-sides" content="cover">\n${head}\n${tpl.slice(cut).replace("/*__APP__*/", () => provaJs).trim()}\n`;
  writeFileSync("dist/checkin-prova.html", prova);
}
// Pagina collega.html (collegamento una tantum di GitHub a La Scatola)
{
  const c = await build({ entryPoints: ["src/collega.ts"], bundle: true, format: "iife", target: "es2020", minify: true, write: false, legalComments: "none" });
  const cjs = c.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const tpl = readFileSync("src/collega.html", "utf8");
  if (!tpl.includes("/*APP_SCRIPT*/")) throw new Error("segnaposto mancante in collega.html");
  const cut = tpl.indexOf("<main>");
  const head = tpl.slice(0, cut).trim();
  const bodyPart = tpl.slice(cut).replace("/*APP_SCRIPT*/", () => cjs).trim();
  // Il token si chiede solo al server di accesso indicato in scatola-client.json.
  const tokenOrigin = new URL(JSON.parse(readFileSync("scatola-client.json", "utf8")).token_url).origin;
  const collegaCsp = [
    "default-src 'none'",
    `script-src ${inlineHashes(bodyPart).join(" ")}`,
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    `connect-src 'self' ${tokenOrigin}`,
    "base-uri 'none'",
    "object-src 'none'",
  ].join("; ");
  writeFileSync(
    "collega.html",
    `<!doctype html>\n<html lang="it">\n<head>\n<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${collegaCsp}">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<meta name="referrer" content="no-referrer">\n${head}\n</head>\n<body>\n${bodyPart}\n</body>\n</html>\n`,
  );
}

// Avviso «Guest Pass arrivato» per Google Apps Script (Gmail dedicata): stesso codice di
// tools/gmail-avviso/avviso-guestpass.ts senza tipi, da incollare nell'editor di Apps Script (vedi LEGGIMI.md).
{
  const { transform } = await import("esbuild");
  const sorgente = readFileSync("tools/gmail-avviso/avviso-guestpass.ts", "utf8");
  const js = await transform(sorgente, { loader: "ts", target: "es2020", charset: "utf8" });
  writeFileSync(
    "tools/gmail-avviso/avviso-guestpass.gs",
    "// Avviso «Guest Pass arrivato» · Gmail guestpass.hartmann@gmail.com → GitHub «Guest Pass dalla casella».\n" +
      "// Generato da avviso-guestpass.ts con build.mjs: si incolla così com'è in Apps Script (Codice.gs).\n" +
      "// Ogni 5 minuti: se c'è un'email nuova di sgp01@feratel.tv avvia subito il workflow. Token in Proprietà script: GITHUB_TOKEN.\n" +
      js.code,
  );
}
