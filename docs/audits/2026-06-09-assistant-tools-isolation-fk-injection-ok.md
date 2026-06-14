# Audit — Assistant IA : exécution des outils LLM (isolation tenant + FK-injection) — OK

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `assistantTools.ts` (`executeTool` + 21 handlers d'outils, 1703 l.).
> Surface à **haut risque** : un LLM (potentiellement victime de prompt-injection via le
> contenu d'un devis/email/client) appelle ces fonctions. Le vecteur critique est
> l'**IDOR cross-tenant** : « ouvre le devis 5 », « facture le client 12 » où l'`id` n'est
> pas celui du tenant. Couvre le **chemin texte** (`/api/assistant/stream`) ET le chemin
> **voix** (`/api/voice/tool`), qui partagent `executeTool`.

---

## Conclusion : isolation tenant **systématique**, pas d'IDOR ni de FK-injection. Pas de BLOCKER/HIGH nouveau.

### 1) `artisanId` vient TOUJOURS du contexte serveur, jamais du LLM

`executeTool(name, args, { artisanId })` reçoit l'`artisanId` depuis la session
authentifiée (`/api/voice/tool:1279`, stream idem) — **aucun outil n'accepte un
`artisanId` en argument**. Toutes les lectures sont scopées :
`getClientsByArtisanId(ctx.artisanId)`, `getFacturesByArtisanId`, `getDevisByArtisanId`,
`getFournisseursByArtisanId`, `getInterventionsByArtisanId`, `getDashboardStats`, etc.

### 2) Tout outil basé sur un `id` vérifie l'appartenance AVANT d'agir

| Outil | Garde | Ligne |
| -- | -- | -- |
| `envoyer_devis` / helper | `devisData.artisanId !== ctx.artisanId` → throw | 802 |
| `creer_facture` (depuis devisId) | `devisData.artisanId !== ctx.artisanId` | 925 |
| `envoyer_facture` / helper | `factureData.artisanId !== ctx.artisanId` | 989 |
| `envoyer_relance` | `factureData.artisanId !== ctx.artisanId` | 1081 |
| `envoyer_commande_fournisseur` | `commande.artisanId !== ctx.artisanId` | 1353 |
| `modifier_intervention` | `existing.artisanId !== ctx.artisanId` | 1582 |
| (destinataire email) | `recipient.artisanId !== ctx.artisanId` | 635 |

### 3) Pas de FK-injection sur les `clientId`/`fournisseurId` **d'entrée**

Les outils de **création** valident la clé étrangère fournie par le LLM via des helpers
dédiés **avant** d'écrire :

- `assertClientBelongs(clientId, ctx)` (`:723`) → `client.artisanId !== ctx.artisanId` →
  throw. Appelé par `creer_devis` (`:740`), `creer_facture` sans devis (`:936`),
  `creer_intervention` (`:1155`).
- `assertFournisseurBelongs(fournisseurId, ctx)` (`:1279`) → idem, appelé par
  `creer_commande_fournisseur`.

→ Impossible de rattacher un devis/facture/intervention au **client d'un autre tenant**
(pas de confused-deputy), ni de créer une référence croisée.

### 4) Pas de relais de spam

`envoyer_devis/facture/relance/commande` envoient au **client/fournisseur du devis/facture
concerné** (entité tenant validée) — **aucun destinataire arbitraire** en argument.

---

## Écart connu = rôle, **déjà filé** (anti-doublon)

L'isolation **tenant** est parfaite, mais ces outils ne vérifient pas le **rôle** de
l'utilisateur : un collaborateur `technicien` peut, via l'assistant, déclencher des
actions financières (créer/envoyer facture) interdites à son rôle dans l'UI. C'est
exactement **« Assistant IA : bypass du système de permissions »** (déjà filé). Pas de
doublon. *(Le `customMessage` HTML non échappé des emails relève aussi des issues
injection-HTML déjà filées.)*

---

## Verdict

Surface outils LLM (texte + voix) : `artisanId` **non falsifiable** (jamais en argument),
**ownership vérifié** sur chaque `id` d'action, **FK d'entrée validées**
(`assertClientBelongs`/`assertFournisseurBelongs`), **pas de destinataire arbitraire**.
Robuste même sous prompt-injection. Seul écart = **rôle** (déjà filé). **Pas de nouvelle
issue Linear.**
