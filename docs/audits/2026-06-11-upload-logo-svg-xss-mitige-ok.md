# Audit — Upload de logo : SVG/XSS mitigé par le rendu `<img>`, fuite d'erreur LOW

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : `POST/DELETE /api/upload-logo` (`index.ts:242-301`) ; rendu du logo
> (front `<img>`, PDF, vitrine, portail client) ; stockage (`artisan.logo` data-URI).

---

## Conclusion : pas de XSS exploitable (rendu `<img>` only + PDF rejette SVG). Aucun BLOCKER/HIGH.

### ✅ Ce qui protège

- **Auth requise** : `getUserFromRequest` → 401 (`index.ts:246`). `updateArtisan(artisan.id, …)`
  scopé au tenant appelant. CSRF mitigé (cookie `sameSite:lax` + POST).
- **Taille bornée** : multer `limits.fileSize = 2 Mo` (`index.ts:241`) → `LIMIT_FILE_SIZE` → 400.
- **SVG/XSS neutralisé par les sinks** : le logo (stocké en `data:<mime>;base64,…`) n'est
  rendu **que** via `<img src={logo}>` :
  - `DashboardLayout.tsx:989`, `Vitrine.tsx:209/269`, `PortailClient.tsx:312`.
  - Un SVG chargé via `<img src>` **n'exécute pas** de script (les navigateurs désactivent
    le scripting des SVG sourcés en image). **Pas d'exécution.**
  - Aucun sink dangereux : `grep` logo × `dangerouslySetInnerHTML|<object|<embed|<iframe|
    background-image|window.open` → **0**.
  - **PDF** : `client/src/lib/pdfGenerator.ts:108` et `server/_core/pdfGenerator.ts:148`
    n'acceptent que `data:image/(png|jpe?g|webp)` → **SVG rejeté** (pas rendu).

→ Même un SVG piégé (`<script>`/`onload`) uploadé ne s'exécute **dans aucun** chemin de
rendu actuel.

### 🟢 Observations LOW (sous le seuil, pas d'issue)

1. **MIME non vérifié sur le contenu** : `allowedTypes.includes(file.mimetype)`
   (`index.ts:251-254`) se fie au `Content-Type` **fourni par le client** (multer), **sans
   contrôle des magic bytes**. Un attaquant peut stocker des octets arbitraires en
   `data:image/png;base64,…`. Impact **nul** aujourd'hui (rendu `<img>` only → un non-image
   casse l'affichage, pas d'exécution). Reco : valider la signature réelle (magic bytes) +
   envisager de **retirer `image/svg+xml`** de l'allowlist (latent : protège si un futur
   rendu inline du logo est introduit).
2. **Fuite de détails d'erreur au client** : le `catch` renvoie
   `detail: error?.sqlMessage || error?.message` **et** `code` dans la réponse 500
   (`index.ts:277-281`). Sur un endpoint **authentifié** agissant sur **sa propre** ressource,
   mais expose des messages SQL internes (ex. noms de colonnes, `ER_DATA_TOO_LONG`). Ajouté
   volontairement pour le debug (commentaire `:266-267`). **LOW** (info disclosure). Reco
   (candidat auto-fix safe) : logger le détail côté serveur, renvoyer un message générique
   au client.

### Note connexe (déjà documentée)

Stockage du logo en **base64 dans la DB** (vs S3) → cf. `2026-06-10-stockage-fichiers-base64-db-s3-mort.md`.

---

## Verdict

L'upload de logo est **authentifié, scopé tenant, borné en taille**, et le vecteur
**SVG/XSS est neutralisé** par un rendu exclusivement en `<img src>` (pas d'exécution de
script) + rejet du SVG côté PDF. **Pas de BLOCKER/HIGH.** Deux points **LOW** (MIME non
content-validé / SVG dans l'allowlist ; fuite de `sqlMessage` au client) sous le seuil —
le second est un **candidat auto-fix safe**. **Pas de nouvelle issue Linear.**
