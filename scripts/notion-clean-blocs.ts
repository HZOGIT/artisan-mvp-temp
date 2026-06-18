import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

for (const envFile of [".env.notion", ".env.local"]) {
  try {
    for (const line of readFileSync(join(ROOT, envFile), "utf8").split("\n")) {
      const m = line.match(/^\s*(NOTION_\w+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* absent */ }
}

const TOKEN = process.env.NOTION_TOKEN!;
const DB_ID = process.env.NOTION_DATABASE_ID!;

async function notion(path: string, method: string, body?: unknown) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

const usedBlocs = new Set<string>();
let cursor: string | undefined;
do {
  const page: any = await notion(`/databases/${DB_ID}/query`, "POST", cursor ? { start_cursor: cursor } : {});
  for (const row of page.results) {
    const b = row.properties?.["Bloc Fonctionnel"]?.select?.name;
    if (b) usedBlocs.add(b);
  }
  cursor = page.has_more ? page.next_cursor : undefined;
} while (cursor);

const db: any = await notion(`/databases/${DB_ID}`, "GET");
const allOptions: { name: string; color: string }[] = db.properties["Bloc Fonctionnel"].select.options;
const toKeep = allOptions.filter((o) => usedBlocs.has(o.name));
const toRemove = allOptions.filter((o) => !usedBlocs.has(o.name));

console.log(`Blocs utilisés (${usedBlocs.size}) :`, [...usedBlocs].sort().join(", "));
console.log(`À supprimer (${toRemove.length}) :`, toRemove.map((o) => o.name).join(", "));

if (toRemove.length === 0) { console.log("✅ Déjà propre."); process.exit(0); }

await notion(`/databases/${DB_ID}`, "PATCH", {
  properties: { "Bloc Fonctionnel": { select: { options: toKeep.map((o) => ({ name: o.name, color: o.color })) } } },
});
console.log(`✅ ${toRemove.length} options supprimées, ${toKeep.length} conservées.`);
