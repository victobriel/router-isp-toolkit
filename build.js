import esbuild from "esbuild";
import { cpSync, mkdirSync } from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outdir = "dist";

mkdirSync(outdir, { recursive: true });

// Bundle JS entry points
await esbuild.build({
  entryPoints: {
    background: "src/infra/background/background.ts",
    content: "src/presentation/content/main.ts",
    popup: "src/presentation/popup/popup.ts",
    settings: "src/presentation/settings/settings.ts",
  },
  bundle: true,
  outdir,
  format: "iife",
  target: "chrome108",
  sourcemap: true,
  logLevel: "info",
});

// Copy static files
const staticFiles = [
  ["manifest.json", `${outdir}/manifest.json`],
  ["src/presentation/tokens.css", `${outdir}/tokens.css`],
  ["src/presentation/popup/popup.html", `${outdir}/popup.html`],
  ["src/presentation/popup/popup.css", `${outdir}/popup.css`],
  ["src/presentation/settings/settings.html", `${outdir}/settings.html`],
  ["src/presentation/settings/settings.css", `${outdir}/settings.css`],
  ["_locales/en/messages.json", `${outdir}/_locales/en/messages.json`],
  ["_locales/pt_BR/messages.json", `${outdir}/_locales/pt_BR/messages.json`],
];

for (const [src, dest] of staticFiles) {
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
  console.log(`Copied ${src} ? ${dest}`);
}

// Copy asset images if they exist
try {
  cpSync("assets", `${outdir}/assets`, { recursive: true });
  console.log("Copied assets/");
} catch {
  // assets folder may not exist
}
