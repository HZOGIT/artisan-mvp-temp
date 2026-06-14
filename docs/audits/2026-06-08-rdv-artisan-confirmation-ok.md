# Audit — RDV en ligne côté artisan (confirm / refuse / proposeAutreCreneau) — OK

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : `rdvRouter` artisan-side (`routers.ts:7312`) — `list`, `confirm`,
> `refuse`, `proposeAutreCreneau`, `getStats`, `getPendingCount`. (Le bypass de
> permission `rdv.gerer` est déjà dans OPE-17 ; la soumission publique
> `demanderRdv` a été couverte dans l'audit portail.)

---

## Conclusion : pas de BLOCKER/HIGH. Logique de confirmation saine.

### Sécurité

- **Pas d'IDOR** : `confirm`/`refuse`/`proposeAutreCreneau` chargent le RDV puis
  vérifient `rdv.artisanId !== artisan.id` ⇒ 404 (`:7337,7379,7406`). `list`/
  `getStats`/`getPendingCount` scopés `artisan.id`.
- **Idempotence de `confirm`** : `if (rdv.statut !== "en_attente") → BAD_REQUEST`
  (`:7340`) → un RDV ne peut être confirmé qu'**une fois** → **pas de double
  création d'intervention**. La conversion RDV→intervention (`createIntervention`,
  `planifiee`) puis `updateRdvStatut("confirme", { interventionId })` est cohérente.

---

## Réserves (mineures)

1. **`refuse` / `proposeAutreCreneau` ne gardent pas le statut courant.** Contrairement
   à `confirm`, ils n'imposent pas `statut === 'en_attente'`. Refuser un RDV déjà
   **`confirme`** le passe à `refuse` **sans annuler l'intervention** créée à la
   confirmation → **intervention orpheline** (`planifiee`) + email « refusé »
   envoyé au client pour un RDV pourtant confirmé. Impact **faible** (action
   anormale de l'artisan sur ses propres données, réparable). Fix : exiger
   `statut === 'en_attente'` (ou gérer l'annulation de l'intervention liée).

2. **Pas de re-vérification du créneau à la confirmation** : `confirm` ne revérifie
   pas que le créneau est toujours libre (`getCreneauxOccupes`) → l'artisan peut
   double-booker deux RDV sur le même horaire. Faible (décision de l'artisan, qui
   voit ses RDV).

3. **Injection HTML emails (confirm/refuse/proposeAutreCreneau)** : les corps
   d'email interpolent `rdv.titre` (input **client** via `demanderRdv`) et
   `input.motif` (artisan) **bruts** (`:7365, :7392, :7432`). Direction
   **artisan/client → client** (réservée, plus faible qu'OPE-59 qui vise
   tiers→artisan), mais **même classe / même fix** (helper d'échappement). →
   **Ajouté à OPE-59** (sweep d'échappement email) par commentaire, pas d'issue
   séparée.

---

## Verdict

RDV côté artisan **sain** : ownership vérifié partout, `confirm` idempotent (pas de
double intervention), conversion RDV→intervention cohérente. Réserves mineures :
absence de garde de statut sur `refuse`/`proposeAutreCreneau` (intervention
orpheline, faible) et 3 templates email à inclure dans le sweep **OPE-59**. **Pas
d'issue Linear créée.**
