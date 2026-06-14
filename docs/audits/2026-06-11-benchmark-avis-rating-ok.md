# Benchmark — Avis clients (`avis_clients`) vs Odoo `rating.rating` : parité MVP

**Date** : 2026-06-11 · **Projet** : Operioz × Odoo 19 — Benchmark

> Périmètre : `avis_clients` (`drizzle/schema.ts:753`) + `avisRouter`
> (`server/routers.ts:5191`) ↔ Odoo `rating` (`rating.rating` / `rating.mixin`).

---

## Conclusion : modèle d'avis **au niveau MVP** (et au-delà sur la réponse artisan). Les écarts à valeur sont **déjà filés**. Aucun nouveau ticket.

### ✅ Modèle riche, bien aligné sur `rating.rating`

| Concept Odoo `rating.rating` | Operioz `avis_clients` | État |
| -- | -- | -- |
| Note (`rating`, 0-5) | `note` (1-5 étoiles) | ✅ |
| Commentaire client (`feedback`) | `commentaire` | ✅ |
| **Réponse de l'entreprise** (`publisher_comment`) | **`reponseArtisan` + `reponseAt`** | ✅ (présent — souvent absent des MVP) |
| Enregistrement noté (`res_model`/`res_id`) | `interventionId` + `clientId` | ✅ (avis rattaché à une intervention/un client réels) |
| Visibilité / modération | `statut` (en_attente / publie / masque) | ✅ |

→ La **réponse publique de l'artisan** (`reponseArtisan`) et le **rattachement à une
intervention** (anti-faux-avis : l'avis vient d'un client réel via un token de demande)
sont déjà en place — c'est un modèle d'avis **complet** pour un MVP.

### Écarts à valeur — **déjà tracés** (anti-doublon)

| Sujet | Gap Operioz | Issue |
| -- | -- | -- |
| Masquage d'un avis négatif **sans transparence** (note gonflée) | `statut = masque` non encadré | **OPE-41** |
| **Transparence légale** « avis en ligne » (L111-7-2 : vérifié/daté/modération affichée) | non affiché | **OPE-112** |
| **Données structurées** `AggregateRating` (étoiles Google/SEO) sur la vitrine | absentes | **OPE-113** |
| **Collecte automatique** de l'avis en fin d'intervention | demande 100 % manuelle | **OPE-134** |

### Écarts restants = hors périmètre

- **Rating multi-critères** (qualité/délai/prix séparés) ou **rating.mixin** générique sur
  plusieurs modèles : sur-ingénierie pour un MVP artisan (une note globale 1-5 suffit).
- **Modération automatique** (détection de contenu abusif par IA) : amélioration future,
  non bloquante.

---

## Verdict

Le module **Avis clients** est **au niveau MVP** de `rating.rating` et le **dépasse** sur
deux points souvent absents : la **réponse publique de l'artisan** (`reponseArtisan`) et le
**rattachement à une intervention réelle** (anti-faux-avis). Les 4 améliorations à valeur
(masquage transparent, mentions légales L111-7-2, données SEO `AggregateRating`, collecte
auto) sont **déjà tracées** (OPE-41/112/113/134). Le multi-critères et la modération IA sont
hors MVP. **Aucun nouveau ticket benchmark.**
