# Audit — Géolocalisation : permission `geolocalisation.voir` définie mais non enforced (→ OPE-17)

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `geolocalisationRouter` (`server/routers.ts:5262-5341`), `assertTechnicienOwner`
> (`:5253`), `shared/permissions.ts` (ALL_PERMISSIONS + ROLE_TEMPLATES), schéma
> `positions_techniciens` (`schema.ts:792-810`). Donnée auditée : **GPS temps-réel +
> historique de déplacement des techniciens** (catégorie RGPD/CNIL sensible).

---

## Ce qui est correct

- **Pas d'IDOR cross-tenant** : chaque endpoint prenant un `technicienId` appelle
  `assertTechnicienOwner` (`:5253`), qui vérifie `tech.artisanId === artisan.id`.
  `getPositions`/`getStatistiquesDeplacements` scopent par `artisan.id`. → impossible
  de lire le GPS des techniciens d'un **autre** artisan.

## 🟠 HIGH trouvé → rattaché à **OPE-17** (pas de doublon)

**La permission `geolocalisation.voir` est définie et assignée dans les templates,
mais le routeur ne l'applique jamais.** Tous les endpoints sont des `protectedProcedure`
nus (authentifié = autorisé) :

| Endpoint | Ligne | Donnée exposée |
| -- | -- | -- |
| `getPositions` | 5280 | position **temps-réel** de tous les techniciens |
| `getLastPosition` | 5286 | dernière position d'un technicien |
| `getHistorique` | 5293 | **historique** de localisation (plage de dates) |
| `getHistoriqueDeplacements` | 5335 | historique des trajets |
| `updatePosition` / `createHistoriqueDeplacement` | 5263 / 5315 | écriture |

**Preuve du défaut d'enforcement (intended ≠ actual)** :
- `geolocalisation.voir` existe (`shared/permissions.ts:15`, `:69`).
- Template `secretaire` **ne l'a PAS** (`permissions.ts:97-104`) ; `technicien` l'a (`:111`).
- Mais aucun endpoint n'appelle `requirePermission("geolocalisation.voir")` →
  **une secrétaire (ou tout user à qui on a révoqué la permission) accède quand même**
  au GPS de tous les techniciens. La personnalisation de permission est sans effet.

### Pourquoi rattaché à OPE-17 et pas une nouvelle issue

OPE-17 (« 4 routers entiers + 6 routes devis bypassent le système de rôles », 🔴) est
**exactement ce sujet** : des routers en `protectedProcedure` au lieu de procédures
gardées. `geolocalisationRouter` est un **5ᵉ routeur** souffrant du même bug mais
**absent de la liste énumérée** d'OPE-17 → le fix d'OPE-17 tel qu'écrit ne le
toucherait pas. Conformément à l'anti-doublon, **OPE-17 a été étendu par un commentaire**
(au lieu de créer un doublon), ajoutant `geolocalisationRouter` à la liste + le fix
(`geolocalisationVoirProcedure`) + l'angle RGPD.

## Réserves RGPD (à tracer côté conformité, hors permissions)

1. **`updatePosition`** accepte n'importe quel `technicienId` de l'entreprise → un
   technicien peut **falsifier la position d'un collègue**. Lier la position au `userId`
   appelant.
2. **Aucune rétention/purge** des positions GPS (`grep purge|retention|deletePosition`
   sur `db.ts` → 0) → conservation illimitée d'une donnée sensible (contraire à la
   minimisation RGPD). Prévoir rétention bornée + information/consentement des salariés
   (obligations CNIL géolocalisation).

---

## Verdict

Géoloc : **pas d'IDOR cross-tenant** (assertTechnicienOwner OK), mais la permission
`geolocalisation.voir` est **définie + templatée et jamais vérifiée** → accès au GPS
temps-réel/historique de tous les techniciens par des rôles censés ne pas l'avoir (ex.
secrétaire). Même classe qu'**OPE-17**, routeur non listé → **OPE-17 étendu par
commentaire** (pas de nouvelle issue). Réserves RGPD : spoofing `updatePosition` +
rétention illimitée.
