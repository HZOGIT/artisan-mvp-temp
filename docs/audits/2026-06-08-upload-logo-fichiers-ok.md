# Audit — Upload de fichiers (logo) — OK

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : seul point d'upload **multipart** de l'app — `POST/DELETE
> /api/upload-logo` (`server/_core/index.ts:225-285`), stockage du logo (data-URI
> en base) et son rendu (vitrine publique, portail client, PDF).

---

## Conclusion : pas de BLOCKER/HIGH. Surface d'upload maîtrisée.

### Contrôles en place

- **Authentification** : `getUserFromRequest` requis (401 sinon) ; scope
  `getArtisanByUserId(user.id)` → l'artisan ne modifie que **son** logo. Pas d'IDOR.
- **Taille bornée** : multer `limits.fileSize = 2 Mo` (`:225`) → `LIMIT_FILE_SIZE`
  renvoie 400.
- **Allow-list de type** : `image/png|jpeg|webp|svg+xml` (`:235`).
- **`X-Content-Type-Options: nosniff`** posé globalement (`:180`) → pas de MIME
  sniffing.
- **CSRF** : auth par cookie JWT `sameSite=lax` → les POST/DELETE cross-site avec
  cookie sont bloqués.
- Stockage **inline** (data-URI base64 en colonne `artisans.logo`), **pas**
  d'écriture sur disque → **aucun** vecteur de path traversal / fichier servi
  arbitrairement.

### Pourquoi le SVG autorisé n'est **pas** exploitable (XSS) dans les chemins actuels

Un SVG peut contenir du script, mais le logo est **toujours rendu via `<img src=
{logo}>`** — contexte dans lequel les navigateurs **n'exécutent pas** le script
SVG :
- Vitrine publique : `Vitrine.tsx:209,269` (`<img>`).
- Portail client : `PortailClient.tsx:312` (`<img>`).
- En-tête app : `DashboardLayout.tsx:987` (`<img>`).
- **PDF** : `pdfGenerator.ts:148` (serveur) et `client/src/lib/pdfGenerator.ts:106`
  n'acceptent que `data:image/(png|jpe?g|webp)` → **le SVG est explicitement
  exclu** du rendu PDF.

Aucun rendu `dangerouslySetInnerHTML` / `<object>` / `<embed>` / `<iframe>` du
logo trouvé. → stored-XSS via SVG **non atteignable** en l'état.

---

## Réserves (mineures, pas d'issue)

1. **Défense en profondeur — retirer `image/svg+xml` de l'allow-list.** Le SVG
   n'apporte rien pour un logo (rejeté du PDF de toute façon) et reste un risque
   **latent** si un futur composant venait à rendre le logo inline. Recommandation :
   ne garder que `png/jpeg/webp`.
2. **Validation de type par `file.mimetype` déclaré** (Content-Type de la part
   multipart), pas par magic bytes. Acceptable ici car rendu **uniquement** en
   `<img>` + `nosniff` (un faux `image/png` non-image s'affiche cassé, sans
   exécution). Idéal : vérifier la signature binaire.
3. **Fuite de détail d'erreur** : le handler 500 renvoie `error.sqlMessage` au
   client (`:263`). **Déjà documenté** dans
   `2026-06-07-fuite-info-erreurs-logs-ok.md` (item 1) — impact mineur
   (authentifié, self-upload). Pas de nouvelle entrée.

---

## Verdict

Upload de logo **sain** : authentifié + scopé, 2 Mo max, `nosniff`, stockage
inline (pas de FS), SVG rendu en `<img>` et exclu du PDF → pas de stored-XSS
exploitable. Réserves purement défense-en-profondeur (retirer SVG, valider les
magic bytes) + un leak d'erreur déjà tracé. **Pas d'issue Linear créée.**
