# Audit — Vitrine publique : données exposées (`getBySlug`) — OK

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : `vitrine.getBySlug` (`routers.ts:7473-7516`), `getVitrinePublicStats`
> (`db.ts`), `getPublishedAvisByArtisanId`. Surface **publique** (par slug, sans auth).

---

## Conclusion : exposition limitée aux données business publiques. Pas de BLOCKER/HIGH.

### Sous-ensemble **curé** (pas de fuite de données privées)

`getBySlug` ne retourne **pas** la ligne artisan brute mais un objet curé (`:7501-7515`) :

- **Artisan** : `nomEntreprise, specialite, telephone, email, ville, codePostal, adresse,
  siret, logo` → **infos business publiques** (équivalent carte de visite / fiche Google
  Business). `siret` est **public par nature** (registre INSEE).
- **Vitrine** : description, zone, services, expérience (champs de paramétrage public).
- **Avis** : note, commentaire, réponse, `clientNom` (prénom + nom de l'auteur d'un avis
  **publié**) — standard pour un système d'avis (consentement implicite via le token
  d'avis reçu).
- **Stats publiques** : `getVitrinePublicStats` = **uniquement** `{ totalClients,
  totalInterventions(terminées) }` → **compteurs** de preuve sociale.

**Absents** (donc non fuités) : `iban`, `tauxTVA`/`numeroTVA`, données d'abonnement/
facturation, **liste/identité des clients** (hors auteurs d'avis), CA/revenu, notes
internes.

### Opt-in

Gardé par `parametres.vitrineActive` (`:7480`) → l'artisan **choisit** de publier sa
vitrine. Tant qu'elle est inactive → `NOT_FOUND`.

---

## Réserves LOW

1. **`totalClients`** révèle la **taille du portefeuille** (légèrement concurrentiel) —
   mais c'est un compteur **opt-in** affiché comme preuve sociale. LOW.
2. **Nom complet** des auteurs d'avis (prénom + nom) → standard (cf. Google Reviews) ;
   consentement implicite via le lien d'avis. LOW.
3. `getVitrinePublicStats` fait `SELECT *` + `.length` (au lieu de `COUNT(*)`) — **même
   classe perf** que les notifications (déjà documentée). Page publique non pollée → impact
   faible.

### Écart connu = déjà filé

- `submitContact` (formulaire public) : injection HTML email + absence de rate-limit →
  **déjà filé**. Pas de doublon.

---

## Verdict

La vitrine expose **exactement** les données d'un showcase business (nom, contact, SIRET,
ville, services, avis publiés, compteurs de preuve sociale), **opt-in** via `vitrineActive`,
**sans** `iban`/financier/liste clients. Pas de sur-exposition. Réserves = LOW (compteur
taille portefeuille, perf `COUNT`). **Pas de nouvelle issue Linear.**
