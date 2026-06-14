# Audit — Upload de fichiers & gestion des médias (logo, photos) — OK

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : route d'upload `/api/upload-logo` (`index.ts:225-285`), stockage des
> photos d'intervention (`interventions.addPhoto` `routers.ts:4616`,
> `analysePhoto.addPhoto` `:6733`), rendu des médias côté client (Vitrine publique,
> PortailClient, DashboardLayout). Vecteurs recherchés : path traversal, upload non
> restreint, exposition publique de fichiers, XSS via SVG/data-URI.

---

## Conclusion : surface d'upload saine. Pas de BLOCKER/HIGH nouveau.

### 1. Une seule route d'upload, en mémoire, bornée et authentifiée

`/api/upload-logo` (`index.ts:226`) est **le seul** point multipart (`grep upload.single|multer(` → 1 résultat) :
- `multer({ storage: memoryStorage(), limits: { fileSize: 2MB } })` → **aucune
  écriture disque** (pas de `diskStorage`, pas de chemin contrôlable → **pas de path
  traversal**).
- Authentifié : `getUserFromRequest(req)` → 401 sinon (`:230`).
- **Allowlist MIME** : `['image/png','image/jpeg','image/webp','image/svg+xml']` (`:235`).
- Stockage : **base64 data-URI dans la colonne `artisans.logo`** (`:240-247`) —
  pas de fichier servi, donc pas d'URL d'upload exposée.

### 2. Aucun service statique de contenu uploadé

`grep express.static|sendFile|res.sendFile` sur `index.ts`/`routers.ts` → **0**.
Le seul `sendFile`-like est la route **polices Roboto** (assets bundlés pour jsPDF),
pas du contenu utilisateur. → **pas d'exposition publique de fichiers uploadés**.

### 3. Photos d'intervention = string en DB, scopée artisan

`interventions.addPhoto` (`:4616`) et `analysePhoto.addPhoto` (`:6733`) sont des
`protectedProcedure` qui vérifient l'ownership (`intervention.artisanId === artisan.id`,
`:4629`) et stockent un champ `url` (data-URI/string) en base. Pas d'écriture disque,
pas de cross-tenant.

### 4. Rendu des médias = `<img src>` → SVG-XSS non exploitable

Tous les rendus du logo passent par `<img src={...}>` : Vitrine **publique**
(`Vitrine.tsx:209/269`), PortailClient (`:312`), DashboardLayout (`:989`). Un SVG
chargé via `<img>` **n'exécute pas** de script dans les navigateurs modernes (SVG
img-sourced = script désactivé). → le SVG de la allowlist **ne donne pas** de XSS
stocké par ces chemins. `X-Content-Type-Options: nosniff` est par ailleurs posé
globalement (`index.ts:180`).

---

## Déjà couvert (anti-doublon → SKIP)

En balayant les sinks HTML côté client, le seul `dangerouslySetInnerHTML` rendant du
contenu dynamique non échappé est **`Assistant.tsx:450`** (`renderContent` `:404`,
markdown par regex **sans échappement HTML**) — **déjà tracé dans OPE-48** (« XSS DOM
dans l'assistant + CSP désactivée », HIGH). Les autres `dangerouslySetInnerHTML`
(`chart.tsx`, `Home.tsx`) ne rendent que du CSS/animations statiques. → **pas de
nouvelle issue**.

> Note : l'absence de **Content-Security-Policy** (commentée `index.ts:139`) — qui
> servirait de filet pour tout XSS — fait déjà partie du périmètre d'**OPE-48**.

---

## Réserves mineures (défense en profondeur, non bloquantes)

1. **MIME non sniffé** : la allowlist (`:236`) teste `file.mimetype`, c.-à-d. le
   Content-Type **déclaré par le client**, pas les octets réels. Un attaquant peut
   uploader des octets arbitraires sous `image/png`. Sans conséquence aujourd'hui
   (rendu en `<img>` + nosniff + stockage data-URI au mime déclaré), mais à durcir
   (magic-bytes / `file-type`) si un jour le logo est servi à son propre URL.
2. **SVG dans la allowlist** : inutile (les logos PNG/JPG/WebP suffisent) et seul
   format à risque si un futur chemin rend le logo hors `<img>` (ex. `<object>`,
   inline `innerHTML`, ou service avec `Content-Type: image/svg+xml`). Reco :
   **retirer `image/svg+xml`** de la allowlist, ou sanitiser (DOMPurify SVG profile)
   à l'upload. Coût ~5 min.

---

## Verdict

Upload/médias : **un seul point** (`/api/upload-logo`), en mémoire, borné 2MB,
authentifié, allowlist MIME, **stockage data-URI en DB** (pas de disque, pas de
static serving → ni path traversal ni exposition de fichiers). Rendu en `<img>` →
SVG-XSS non exploitable. Le seul vrai sink XSS (assistant `renderContent`) est
**déjà OPE-48**. Réserves défense-en-profondeur : retirer le SVG de la allowlist +
sniffer les magic-bytes. **Pas d'issue Linear.**
