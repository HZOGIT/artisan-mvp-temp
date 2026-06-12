# Audit — `avis.envoyerDemandeParClient` : `clientId` non scopé (oracle d'énumération cross-tenant) — relève d'OPE-25

**Date** : 2026-06-12 · **Projet** : Lancement 30 juin · **Sévérité : 🟢 LOW** (énumération, pas d'exfiltration ni d'email cross-tenant) · **✅ CORRIGÉ (MODE A)**
**Domaine audité** : avis clients — envoi de demande d'avis. Sweep de la classe `clientId` non scopé.

> **Fix déployé (commit 168ecdb, OPE-25)** : ajout du contrôle `client.artisanId === artisan.id`
> dans `avis.envoyerDemandeParClient` → `NOT_FOUND` uniforme (supprime l'oracle), puis check
> email séparé. Corrigé en même temps que `contrats.create` (HIGH) de la même classe.

---

## Constat

`avisRouter.envoyerDemandeParClient` (`server/routers.ts:5426`) lit le client avec la version
**non scopée** :
```ts
const client = await db.getClientById(input.clientId);   // :5434 — PAS de check artisanId
if (!client || !client.email) throw BAD_REQUEST("Le client n'a pas d'email");
const interventions = await db.getInterventionsByClientId(input.clientId);
const artisanInterventions = interventions.filter(i => i.artisanId === artisan.id);  // :5441
if (!artisanInterventions[0]) throw BAD_REQUEST("Aucune intervention trouvée pour ce client");
```

Contrairement à ses **deux endpoints frères** qui font le bon contrôle :
- `avis.envoyerDemande` (`:4030`) : `if (!client || client.artisanId !== artisan.id) throw FORBIDDEN`.
- `chat`/conversation (`:5102`) : idem.

→ `envoyerDemandeParClient` **omet** le `client.artisanId === artisan.id`.

## Impact (borné → LOW)

- **Pas d'email ni de PII cross-tenant** : le filtre intervention (`:5441`) exige une intervention
  de **l'artisan appelant** pour ce client. Un `clientId` d'un autre tenant → `artisanInterventions`
  vide → `throw` avant tout `createDemandeAvis`/`sendEmail`. La demande créée (`:5453`) et l'email
  (`:5468`) ne concernent donc **que** des clients légitimes de l'appelant.
- **Oracle d'énumération** : les messages d'erreur **diffèrent** selon l'état du `clientId` fourni —
  « Le client n'a pas d'email » (client inexistant **ou** sans email) vs « Aucune intervention
  trouvée pour ce client » (client **existant avec email**, tout tenant confondu). Un artisan
  authentifié peut donc **énumérer** l'existence + la présence d'email de clients d'**autres**
  tenants. Vie privée, mais ni exfiltration de PII ni action cross-tenant.

## Fix proposé (aligner sur les frères)

Ajouter le contrôle d'ownership comme `:4030`/`:5102` :
```ts
const client = await db.getClientById(input.clientId);
if (!client || client.artisanId !== artisan.id) throw new TRPCError({ code: "NOT_FOUND", message: "Client non trouvé" });
```
(ou `getClientByIdSecure(input.clientId, artisan.id)`). Comportement inchangé pour un client
légitime ; supprime l'oracle. Idéalement message d'erreur **uniforme** (NOT_FOUND) pour les deux
branches.

## Linear / anti-doublon

Même classe que **OPE-25** (HIGH — `clientId` fourni non vérifié vs artisan, généralisée par
`docs/audits/2026-06-08-clientid-non-valide-fuite-pii-systemique.md`). Les **deux autres**
usages de `getClientById(input.clientId)` (`:4029`, `:5101`) sont **corrects** (check présent) ;
seul `:5434` est l'**outlier**. **Pas de nouvelle issue** — **enrichi sur OPE-25** (instance
supplémentaire). Sévérité ici LOW (l'exfil PII directe reste le vecteur HIGH décrit sur OPE-25).

---

## Verdict

`envoyerDemandeParClient` omet le contrôle d'ownership du `clientId` que ses endpoints frères
appliquent → **oracle d'énumération cross-tenant** (LOW, pas d'exfil/email). Relève de la classe
**OPE-25** (enrichie). Un correctif d'1 ligne (alignement sur `:4030`) le clôt.
