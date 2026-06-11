# Audit — Exécution des outils de l'assistant IA : cloisonnement tenant solide

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : `AGENT_TOOLS` + `executeTool` (`server/_core/assistantTools.ts`), dispatch
> dans `/api/assistant/stream` (`index.ts:1109`). 21 outils, dont ~11 **mutations**
> (creer/envoyer devis & factures, creer_client, creer/modifier intervention, commandes
> fournisseur, relances).

---

## Conclusion : pas d'IDOR — tous les outils sont scopés à `ctx.artisanId`. Aucun NOUVEAU BLOCKER/HIGH. Le bypass de permissions (collaborateurs) = OPE-54 (existant).

### ✅ Cloisonnement multi-tenant : chaque outil vérifie l'appartenance

Le dispatch passe **uniquement** `{ artisanId: artisan.id }` (le tenant de l'utilisateur
authentifié) à `executeTool` (`index.ts:1112`). Tous les handlers de mutation **vérifient
l'appartenance** des ids référencés à `ctx.artisanId` :

| Outil | Garde |
| -- | -- |
| `creer_devis` / `creer_et_envoyer_devis` | `createDevisWithLignes` → `assertClientBelongs(clientId, ctx)` |
| `creer_facture` | devisId → `devisData.artisanId !== ctx.artisanId` ; clientId → `assertClientBelongs` |
| `envoyer_devis` | `sendDevisEmailHelper` → `devisData.artisanId !== ctx.artisanId` |
| `creer_intervention` | `assertClientBelongs(clientId, ctx)` |
| `modifier_intervention` | `existing.artisanId !== ctx.artisanId` |
| `creer_commande_fournisseur` | `assertFournisseurBelongs(fournisseurId, ctx)` |
| `creer_client` | `db.createClient(ctx.artisanId, …)` (artisanId **forcé**) |

```ts
async function assertClientBelongs(clientId, ctx) {
  const client = await db.getClientById(clientId);
  if (!client) throw new Error("Client introuvable");
  if (client.artisanId !== ctx.artisanId) throw new Error("Ce client n'appartient pas à votre compte");
}
```

→ Même via **injection de prompt** (un artisan demandant à l'assistant d'agir sur un
`clientId`/`devisId` d'un **autre** tenant), les `assertXBelongs` / checks `artisanId`
**rejettent**. **Pas d'IDOR cross-tenant.** (Contraste avec OPE-89/90 où des routes tRPC
découplaient l'enfant du parent : ici le pattern est appliqué partout.)

### ✅ Surface d'envoi bornée

- Les emails (`envoyer_devis`/`facture`/`relance`) partent vers l'email **du client en DB**
  (pas une adresse fournie par le LLM) → pas d'exfiltration vers une adresse arbitraire.
- `/api/assistant/stream` est **rate-limité** (`checkRateLimit(artisan.id)`, 30/h —
  ajouté en `bfdeaa5`) → borne le nombre d'actions/emails déclenchables par tour.

### 🟡 Gap connu — déjà filé

**Permissions collaborateurs** : `ToolContext` ne porte **que** `artisanId`, **pas** le rôle
ni les permissions de l'utilisateur appelant. Un collaborateur (`secretaire`/`technicien`)
sans `devis:creer` / `factures:creer` peut donc **créer/envoyer** devis & factures via
l'assistant → contournement du système de permissions. = **OPE-54** (existant). Pas de
doublon.

### 🟢 Note (prompt injection)

Le pire qu'une injection de prompt obtient = faire agir l'assistant sur les **propres
données** de l'artisan (créer/envoyer ses devis à ses clients), **dans le périmètre de son
propre compte**. Pas de franchissement tenant, pas d'envoi hors-client. Risque résiduel
faible (cohérent avec l'autorité de l'artisan authentifié). La validation des montants/
quantités vient du LLM mais reste sous le compte de l'artisan (brouillon révisable).

---

## Verdict

L'exécution des outils de l'assistant IA est **correctement cloisonnée par tenant** : tous
les ids référencés sont vérifiés contre `ctx.artisanId` (`assertClientBelongs` /
`assertFournisseurBelongs` / checks `artisanId`), les créations forcent `ctx.artisanId`, et
l'envoi cible l'email DB du client. **Pas d'IDOR, pas de nouveau BLOCKER.** Le seul écart —
absence de contrôle des **permissions collaborateurs** dans `ToolContext` — est **déjà filé
(OPE-54)**. **Pas de nouvelle issue Linear.**
