# Audit — Assistant IA : contournement du système de permissions par les collaborateurs

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : exécution des outils de l'assistant (`executeTool`,
> `/api/assistant/stream`, `/api/voice/tool`) vs le système de rôles/permissions.
> **Corrige l'audit `2026-06-07-monassistant-gemini-ok.md`** (qui concluait à tort
> que l'assistant était « réservé au propriétaire »).

> Domaine de ce run : `interventionsMobileRouter` (`routers.ts:4515`) — vérifié
> **sain** (ownership `intervention.artisanId === artisan.id` sur toutes les
> routes). C'est en revérifiant la résolution des collaborateurs que la faille
> ci-dessous est apparue.

---

## Correction d'une hypothèse erronée

`getArtisanByUserId` (`db.ts:217`) **résout bien les collaborateurs** :
```typescript
// vérifie d'abord users.artisanId (collaborateur → entreprise du propriétaire)
if (userResult[0]?.artisanId) { ... return artisan de l'entreprise; }
// fallback propriétaire
```
Donc un **technicien / secrétaire peut atteindre l'assistant** (contrairement à ce
qu'affirmait l'audit monassistant). L'assistant n'est **pas** owner-only.

---

## 🟠 HIGH — Un collaborateur exécute des actions interdites à son rôle via l'assistant IA

### Problème

Les endpoints assistant résolvent l'entreprise via `getArtisanByUserId(user.id)`
(collaborateur-aware) puis exécutent les outils **sans aucun contrôle de
permission** :

```typescript
// index.ts:928 (stream) / :1251 (voice/tool)
const artisan = await getArtisanByUserId(user.id);     // résout le collaborateur
// ...
const result = await executeTool(fc.name, fc.args, { artisanId: artisan.id }); // :1027 / :1258
```
```typescript
// assistantTools.ts — le contexte ne porte ni rôle ni permissions
export interface ToolContext { artisanId: number; }
```

Or les outils incluent des **actions à fort privilège** : `creer_facture`,
`envoyer_facture`, `creer_devis`, `creer_et_envoyer_devis`, `envoyer_relance`,
`creer_client`, `creer_commande_fournisseur`, `envoyer_commande_fournisseur`.

Le rôle **`technicien`** (`shared/permissions.ts`) n'a **aucune** de ces
permissions (uniquement dashboard/interventions/calendrier/chantiers/géoloc) :
```
technicien: ["dashboard.voir","interventions.voir","interventions.gerer",
             "calendrier.voir","chantiers.voir","chantiers.gerer",
             "techniciens.voir","geolocalisation.voir"]
```

### Exploitation

Un utilisateur **technicien** (créé par le propriétaire dans un plan multi-utilisateurs) :
1. s'authentifie, atteint `/api/assistant/stream` ou `/api/voice/tool` (reachable
   par tout user authentifié — `getUserFromRequest`) ;
2. demande à l'assistant « crée une facture de 5 000 € pour le client X et
   envoie-la » ;
3. `executeTool('creer_facture' / 'envoyer_facture', …, { artisanId })` s'exécute
   **sans vérifier que le technicien a `factures.creer`** → facture créée et
   envoyée au nom de l'entreprise.

→ **Escalade de privilège intra-tenant** : un rôle volontairement restreint
(technicien) réalise des actions commerciales/financières (créer/envoyer
factures, devis, bons de commande, créer des clients) que l'UI/tRPC lui
interdisent, en passant par l'assistant.

### Distinction

Distinct d'OPE-17 (routeurs tRPC sans guard de permission) : ici c'est le **chemin
d'exécution des outils de l'assistant** (`executeTool`) qui **ne consulte jamais**
les permissions. Surface et mécanisme différents.

### Fix proposé

1. Faire porter le **rôle/permissions** dans `ToolContext` (les charger via
   `getUserFromRequest` qui fournit déjà `permissions`).
2. **Mapper chaque outil à la permission requise** (`creer_facture` →
   `factures.creer`, `envoyer_devis` → `devis.creer`, `creer_client` →
   `clients.gerer`, etc.) et refuser dans `executeTool` si la permission manque.
3. Idéalement, exposer dynamiquement au modèle uniquement les outils autorisés
   pour le rôle courant (réduit aussi la surface de prompt injection).

### Estimation

~0,5 j — `ToolContext` enrichi (userId+permissions) + table outil→permission +
garde dans `executeTool` + test (technicien ne peut pas créer de facture via l'IA).

---

## Estimation totale

- HIGH (bypass permissions via assistant) : ~0,5 j
