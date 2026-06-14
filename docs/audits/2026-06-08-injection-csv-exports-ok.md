# Audit — Injection CSV/formule dans les exports — OK (latent)

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : tous les exports `text/csv`. Risque recherché : injection de formule
> (cellule commençant par `= + - @ \t \r` exécutée à l'ouverture dans Excel/
> LibreOffice → DDE/`=WEBSERVICE` exfiltration).

---

## Conclusion : pas exploitable aujourd'hui. Pas de BLOCKER/HIGH.

### Aucune protection d'échappement CSV

`grep csvEscape|sanitizeCsv|formula` → **0**. Aucune neutralisation des cellules
à risque. Mais l'exploitabilité dépend de la présence de **free-text contrôlable**
dans un CSV servi.

### Le seul export CSV vivant = le FEC, sans free-text client

- Unique réponse `text/csv` : **FEC** (`index.ts:631`, `factures_*.csv`).
- `genererExportFEC` (`db.ts:5275`) calcule `clientLib` (`:5318`) **mais ne
  l'utilise PAS** dans les lignes : `EcritureLib = "Facture ${f.numero}"`,
  `CompAuxLib = ""` (vide). → **aucun nom de client** n'apparaît dans la sortie.
- Cellules variables du FEC : `f.numero`, montants, dates, libellés **codés en
  dur** (« Ventes », « Clients », « TVA collectee »).
- La seule cellule potentiellement « dangereuse » est **`f.numero`**, contrôlée par
  l'artisan via `prefixeFacture` (ou l'import) → un artisan qui mettrait
  `prefixeFacture = "=…"` n'injecterait que **dans son propre FEC** (self-inflicted,
  négligeable).
- **Aucun autre export CSV** avec free-text : pas d'`exportClients` CSV ; l'export
  CSV des intégrations comptables est **cassé/vide** (OPE-57).

→ Le vecteur classique (nom de **client** malveillant → CSV → Excel de l'artisan/
comptable/DGFiP) **n'est pas réalisé** : le nom de client ne transite par aucun CSV.

---

## Réserve (défense en profondeur, à activer avec OPE-57)

Dès qu'un export CSV inclura du **free-text** (correction d'**OPE-57** pour exporter
les libellés/clients, ou un futur « export clients CSV »), il faudra **neutraliser
l'injection de formule** : préfixer d'un apostrophe `'` toute cellule commençant par
`= + - @ \t \r` (et idéalement la même chose pour le FEC `EcritureLib` si on y
réinjecte le nom client / le `numero`). Coût ~15 min, à faire **avant** d'enrichir
les exports.

> Note FEC (relève d'OPE-33) : `clientLib` calculé mais inutilisé → le **CompAuxLib**
> (libellé du compte auxiliaire client) est vide alors que le FEC le prévoit ;
> complétude à revoir avec OPE-33.

---

## Verdict

Injection CSV **non exploitable** en l'état (le seul CSV vivant — le FEC — ne
contient aucun free-text client ; seule la cellule `numero` est artisan-contrôlée).
Reco défense-en-profondeur : ajouter l'échappement formule **avant** d'enrichir les
exports CSV (OPE-57). **Pas d'issue Linear.**
