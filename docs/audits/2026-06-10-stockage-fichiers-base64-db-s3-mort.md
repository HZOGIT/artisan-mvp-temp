# Audit — Stockage des fichiers en base64 dans MySQL (S3 installé mais non câblé) — MEDIUM

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin · **Sévérité : 🟡 MEDIUM (scalabilité/coût)**

> Périmètre : usage S3 (`@aws-sdk/client-s3`, `env.ts`), colonnes de stockage fichier
> (`schema.ts`), élargissements runtime (`fix-duplicates.ts`).

---

## Constat : S3 mort → fichiers stockés en **base64 dans la DB**

### S3 est une dépendance morte

`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` sont installés, et `env.ts` expose
`S3_BUCKET/Region/AccessKey/SecretKey`. Mais `grep S3Client|PutObjectCommand|getSignedUrl`
sur `server/`+`client/` = **0** (hors `env.ts`). → **Aucun code n'utilise S3.** L'archi
de stockage objet **prévue** (deps + env) n'a **jamais été câblée**.

### Fallback = base64 dans des colonnes MySQL (élargies à MEDIUMTEXT sous la contrainte)

| Donnée | Colonne | Stockage |
| -- | -- | -- |
| Logo artisan | `artisans.logo` **MEDIUMTEXT** (`schema:61`) | base64 |
| Photos analyse IA | `photos_analyse.url` → **MEDIUMTEXT** (`fix-duplicates:1080`) | base64 (data URL) |
| Signature devis / mobile | `signatureData` / `signatureClient` → **MEDIUMTEXT** (`fix-duplicates:1088`) | base64 |

Le commentaire `fix-duplicates.ts:807-809` est explicite : *« Widen artisans.logo from TEXT
(65 KB) to MEDIUMTEXT (16 MB)… TEXT was hard-failing every realistic logo with
ER_DATA_TOO_LONG »*. → l'équipe a **heurté** la limite TEXT et **élargi** les colonnes
plusieurs fois (logo, photos_analyse, signatures) pour faire tenir le base64.

### Impact (MEDIUM, scalabilité/coût)

- **Bloat DB** : chaque logo/photo/signature = blob base64 (KB→MB) **dans MySQL** → la base
  grossit vite (analyse IA = N photos/analyse), **backups/réplication** gonflent, coût
  stockage DB ↑.
- **Mémoire** : lire une ligne charge le base64 complet en mémoire Node (ex. envoi des
  photos à Gemini, `getPhotosByAnalyse`).
- **Plafond** : MEDIUMTEXT = 16 MB/ligne ; une photo iPhone proche de la limite échouerait.
- **Fonctionne au lancement** (faible volume, colonnes élargies) mais **dégrade** avec
  l'usage photo. → **MEDIUM**, sous le seuil BLOCKER/HIGH.

---

## Reco

1. **Câbler un object store** (S3 — **déjà installé** — ou R2/Backblaze) : uploader le
   binaire, stocker **l'URL** (pas le base64) en DB. Migrer logo/photos/signatures.
2. À défaut, **borner** strictement (taille, nombre de photos/analyse) et surveiller la
   taille DB.
3. **Désinstaller** `@aws-sdk/*` si on ne câble pas S3 (cf. autres deps mortes :
   Clerk/Lucia/bcrypt natif) — sinon les utiliser.

---

## Verdict

L'archi de stockage objet (**S3 installé**) n'est **pas câblée** ; les fichiers sont en
**base64 dans MySQL** (colonnes élargies sous la contrainte ER_DATA_TOO_LONG) → **bloat DB
+ mémoire**, **MEDIUM** scalabilité/coût (fonctionne au lancement, dégrade avec le volume
photo). **Pas de nouvelle issue Linear** ; reco = câbler S3 (déjà présent) avant que le
volume de photos ne croisse.
