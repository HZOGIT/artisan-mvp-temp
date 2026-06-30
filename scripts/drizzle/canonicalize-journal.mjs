import fs from "node:fs";
import path from "node:path";

const VERSION = "7";

function parseWhen(tag) {
  const m = tag.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!m) throw new Error(`tag sans préfixe timestamp: ${tag}`);
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return Date.UTC(y, mo - 1, d, h, mi, s);
}

/** Recalcule un journal canonique depuis un ensemble d'entrées (dédupé par tag, trié, idx = rang). */
function canonicalize(entries) {
  const byTag = new Map();
  for (const e of entries) byTag.set(e.tag, e);
  const sorted = [...byTag.values()].sort((a, b) => a.tag.localeCompare(b.tag));
  return {
    version: VERSION,
    dialect: "postgresql",
    entries: sorted.map((e, idx) => ({
      idx,
      version: e.version ?? VERSION,
      when: e.when ?? parseWhen(e.tag),
      tag: e.tag,
      breakpoints: e.breakpoints ?? true,
    })),
  };
}

function readJournal(file) {
  const raw = fs.readFileSync(file, "utf8");
  if (/^<{7}|^={7}|^>{7}/m.test(raw)) {
    throw new Error(`${file} contient des marqueurs de conflit git non résolus`);
  }
  return JSON.parse(raw).entries ?? [];
}

function entriesFromSqlDir(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => ({ tag: f.replace(/\.sql$/, ""), when: parseWhen(f.replace(/\.sql$/, "")) }));
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
const [mode, a, b, c] = isMain ? process.argv.slice(2) : [];

if (!isMain) {
  /* module importé — pas d'exécution CLI */
} else if (mode === "merge") {
  /* git driver: %O=ancestor (ignoré) %A=ours/résultat %B=theirs */
  const merged = canonicalize([...readJournal(b), ...readJournal(c)]);
  fs.writeFileSync(b, `${JSON.stringify(merged, null, 2)}\n`);
} else if (mode === "rebuild") {
  const dir = a;
  const journal = canonicalize(entriesFromSqlDir(dir));
  fs.writeFileSync(path.join(dir, "meta", "_journal.json"), `${JSON.stringify(journal, null, 2)}\n`);
  console.log(`OK — journal reconstruit: ${journal.entries.length} entrées`);
} else if (mode === "verify") {
  const dir = a;
  const sqlTags = new Set(entriesFromSqlDir(dir).map((e) => e.tag));
  const jrn = readJournal(path.join(dir, "meta", "_journal.json"));
  const jrnTags = new Set(jrn.map((e) => e.tag));
  const idxs = jrn.map((e) => e.idx);
  const errs = [];
  for (const t of sqlTags) if (!jrnTags.has(t)) errs.push(`.sql sans entrée journal: ${t}`);
  for (const t of jrnTags) if (!sqlTags.has(t)) errs.push(`entrée journal sans .sql: ${t}`);
  if (new Set(idxs).size !== idxs.length) errs.push(`idx dupliqué: ${idxs.join(",")}`);
  if (errs.length) {
    console.error(errs.join("\n"));
    process.exit(1);
  }
  console.log(`OK — ${jrnTags.size} migrations, journal 1:1 avec .sql, idx uniques`);
} else if (mode === "selfcheck") {
  const A = [
    { idx: 0, version: VERSION, when: parseWhen("20260101000000_a"), tag: "20260101000000_a", breakpoints: true },
    { idx: 1, version: VERSION, when: parseWhen("20260102000000_b"), tag: "20260102000000_b", breakpoints: true },
  ];
  const B = [
    { idx: 0, version: VERSION, when: parseWhen("20260101000000_a"), tag: "20260101000000_a", breakpoints: true },
    { idx: 1, version: VERSION, when: parseWhen("20260103000000_c"), tag: "20260103000000_c", breakpoints: true },
  ];
  const merged = canonicalize([...A, ...B]);
  const idxs = merged.entries.map((e) => e.idx);
  console.assert(merged.entries.length === 3, "union doit avoir 3 entrées");
  console.assert(new Set(idxs).size === idxs.length, "idx uniques");
  console.assert(merged.entries[0].tag === "20260101000000_a", "ordre alphabétique");
  console.assert(merged.entries[1].tag === "20260102000000_b", "entrée droppée restaurée");
  console.assert(merged.entries[2].tag === "20260103000000_c", "entrée distante présente");
  const again = canonicalize(merged.entries);
  console.assert(JSON.stringify(again) === JSON.stringify(merged), "idempotent");
  console.log("selfcheck OK — collisions idx impossibles, entrées droppées restaurées, idempotent");
} else {
  console.error(
    "usage: canonicalize-journal.mjs merge <O> <A> <B> | rebuild <dir> | verify <dir> | selfcheck"
  );
  process.exit(2);
}

export { canonicalize, parseWhen };
