# Audit — RDV en ligne (prise de RDV client + confirmation artisan) : flow cloisonné (réf.)

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : côté **public/client** `getCreneauxDisponibles` / `demanderRdv` / `getMesRdv`
> (`routers.ts:4211-4299`, token portail) + côté **artisan** `rdvRouter`
> (`routers.ts:7595-7738` : `list`/`confirm`/`refuse`/`proposeAutreCreneau`/stats).

---

## Conclusion : aucun BLOCKER, aucun HIGH. Module **cloisonné**. 2 observations MEDIUM (idempotence/TOCTOU de `confirm`) déjà couvertes par la classe OPE-68/OPE-40.

### ✅ Côté public : tout est token-gated + borné

Chaque route publique résout d'abord `getClientPortalAccessByToken(input.token)` (sinon
`UNAUTHORIZED`) et force `access.artisanId`/`access.clientId` — pas d'`artisanId`/`clientId`
côté input, donc **pas d'IDOR** :
- `demanderRdv` (`:4252`) : `titre` `min(1).max(200)`, `description` `max(5000)`,
  `urgence` enum, `dateProposee` `max(40)` + **garde « ≥ 24h à l'avance »** (`:4265-4268`).
  Crée un RDV `en_attente` + notification scopée `access.artisanId`.
- `getCreneauxDisponibles` (`:4211`) : calcule les créneaux libres (lun–ven 8h–18h, fenêtre
  J+1 → J+14) en excluant les occupés (`getCreneauxOccupes`, test de chevauchement correct
  `slotStart < occEnd && slotEnd > occ.dateDebut`).
- `getMesRdv` (`:4293`) : `getRdvByClientId(access.clientId, access.artisanId)` — double scope.

### ✅ Côté artisan : ownership systématique + emails échappés

`confirm`/`refuse`/`proposeAutreCreneau` vérifient toutes `rdv.artisanId !== artisan.id →
NOT_FOUND` (`:7620,7662,7689`). `confirm` garde aussi `statut !== "en_attente" →
BAD_REQUEST`. **Tous** les bodies d'email passent par `safeHtml(...)` sur les champs
client/titre/motif (`:7648,7675,7715`) — pas d'injection HTML (classe OPE-12/36/59, déjà
traitée). `list`/`getStats`/`getPendingCount` scopés par `artisan.id`.

---

## Observations MEDIUM (pas un nouveau blocker — classe déjà filée)

1. **`confirm` non atomique (idempotence)** (`:7619-7638`) : lecture `statut` → check
   `en_attente` → `createIntervention` → `updateRdvStatut`. Deux `confirm` concurrents du
   même `rdvId` passent tous deux le check (read-then-write) → **2 interventions + 2 emails**
   de confirmation. **Même classe que OPE-68** (`convertToFacture`) **/ OPE-40**
   (`generateFacture`) — idempotence/garde de statut non atomique. *Pas de doublon : à
   regrouper dans le traitement de cette classe.*

2. **TOCTOU double-booking sur `confirm`** : `getCreneauxDisponibles` filtre les créneaux
   occupés à l'affichage, mais `confirm` **ne revérifie pas** que le créneau est encore libre
   avant de créer l'intervention. Deux demandes sur le même créneau peuvent être confirmées
   → double-booking. **Atténué par l'humain dans la boucle** (l'artisan confirme manuellement
   et voit les deux demandes) → MEDIUM, pas BLOCKER.

3. **`demanderRdv` sans rate-limit** (public, token-gated) : un porteur de token légitime
   pourrait spammer des demandes → flood de notifications d'un seul artisan. Blast radius
   limité (token = client identifié). LOW/MEDIUM. (≠ OPE-36 vitrine `submitContact` qui était
   public non authentifié — déjà corrigé.)

### Correctif suggéré (le jour où la classe idempotence est traitée)

`UPDATE rdv SET statut='confirme', intervention_id=? WHERE id=? AND statut='en_attente'` et
ne créer l'intervention que si `affectedRows === 1` ; optionnellement re-tester
`getCreneauxOccupes` sur le créneau juste avant création.

---

## Verdict

Flow RDV en ligne **cloisonné** : public **token-gated** + entrées bornées + garde 24h ;
artisan **ownership** systématique + emails `safeHtml`. **Aucun IDOR, aucun BLOCKER/HIGH.**
Deux gaps **MEDIUM** (idempotence + TOCTOU de `confirm`) relèvent de la classe déjà filée
(**OPE-68/OPE-40**) → **pas de nouvelle issue Linear** (anti-doublon).
