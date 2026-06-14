# Audit — Analyse photo IA : upload (types de médias, vidéo, HEIC) — OK

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : flux d'upload de l'analyse photo IA — `AnalysesPhotos.tsx` /
> `DevisIA.tsx` (client), `devisIA.addPhoto` / `analyserPhotos` (`routers.ts:6733`/
> `6744`). Fait suite à la question « quelle API pour la vidéo ». Complète OPE-30
> (IDOR du module) et `2026-06-06-uploads-analyse-photos.md`.

---

## Conclusion : cohérent (images uniquement). Pas de bug vidéo. Pas de BLOCKER/HIGH nouveau.

### Modèle / API

`analyserPhotos` appelle **Google Gemini** (`@google/genai`, `GEMINI_API_KEY`),
modèle `GEMINI_TEXT_MODEL || 'gemini-2.5-flash'` (multimodal), parties image en
`inlineData` (base64) ou `fileData` (URL). Voir `routers.ts:6824-6833`.

### Upload restreint aux images — **pas de vidéo** (répond au fil)

- `AnalysesPhotos.tsx` : `accept="image/*"` (`:247`) + allow-list explicite
  `["image/jpeg","image/png","image/webp","image/heic","image/heif"]` (`:35`) avec
  validation **mime *et* extension** (`:108`) et **cap 5 Mo/fichier** (`:214`).
- `DevisIA.tsx` : `accept="image/*"` (`:396`).

→ **Aucune vidéo ne peut être envoyée** par l'UI → le backend image-only n'est
**pas** un mismatch atteignable. (La vidéo n'est ni acceptée ni câblée ; un envoi
direct hors-UI d'une `data:video/...` retomberait sur le parts-builder qui ne
matche que `image/*` → erreur Gemini **gérée** (`try/catch` → statut `erreur`),
pas de crash.)

### HEIC/HEIF — cohérent

HEIC/HEIF (format iPhone par défaut) sont acceptés côté client **et supportés par
Gemini** ; le mime réel est transmis pour les data-URL (`inlineData.mimeType =
m[1]`). Seul bémol : la **prévisualisation `<img>` du HEIC** ne s'affiche pas dans
Chrome/Firefox (vignette cassée) — **UX mineure**, l'analyse fonctionne.

---

## Réserves (déjà tracées)

- **`addPhoto` / `analyserPhotos` sans contrôle d'appartenance de `analyseId`**
  (`async ({ input })`) + pas de limite sur le **nombre de photos** → IDOR + burn
  Gemini → **OPE-30**.
- **Pas de validation mime/taille serveur** sur `addPhoto` (`url: z.string()` brut,
  pas de check) : l'UI restreint, mais un appel direct stockerait un payload
  arbitraire. Conséquences bornées (erreur Gemini gérée ; taille → cap body 50 Mo
  = **OPE-24**). À durcir avec OPE-30/24, pas une issue propre.

---

## Verdict

Upload analyse photo **cohérent** : images uniquement (`image/*` + allow-list +
5 Mo), HEIC supporté, **aucune vidéo** (donc pas de mismatch backend). Le modèle
est Gemini 2.5 Flash multimodal. Les défauts résiduels (IDOR, limites) sont
**OPE-30/OPE-24**. **Pas de nouvelle issue Linear.**
