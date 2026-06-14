# Audit (re-vérification) — Assistant IA : bypass des permissions de rôle — TOUJOURS OUVERT (OPE-54)

**Date** : 2026-06-12 · **Projet** : Lancement 30 juin · **Domaine** : Assistant IA / exécution d'outils (rôles & permissions)

> Re-audit du chemin d'exécution des outils de l'assistant (`executeTool`,
> `/api/assistant/stream`, `/api/voice/tool`) vs le système de permissions de rôle.
> **Anti-doublon : déjà filé en OPE-54 (HIGH).** Pas de nouvelle issue — cette note
> **confirme que la faille est intacte** dans le code au 2026-06-12 (priorisation lancement).

---

## 🟠 HIGH — confirmé NON corrigé : escalade de privilège intra-tenant via l'assistant

### Preuve (code actuel)
- `ToolContext` (`server/_core/assistantTools.ts:410-412`) = **`{ artisanId: number }`** uniquement. Pas de `userId`, `role`, ni `permissions` → le chemin ne **peut pas** vérifier un droit.
- `executeTool(name, input, ctx)` (`:1731`) dispatche vers des outils **mutants** sans contrôle de permission : `creer_devis`, `envoyer_devis`, `creer_et_envoyer_devis`, `creer_facture`, `envoyer_facture`, `envoyer_relance`, `creer_intervention`, `creer_commande_fournisseur`, `envoyer_commande_fournisseur`, `creer_client`…
- `grep -niE "permission|requirePerm|autorise|role"` sur `assistantTools.ts` → **0** occurrence métier (uniquement du HTML d'email).
- Appel : `server/_core/index.ts` (stream + `/api/voice/tool`) → `getArtisanByUserId(user.id)` (résout les **collaborateurs** vers l'entreprise) → `executeTool(fc.name, fc.args, { artisanId })` sans permissions.

### Impact
Un **technicien / secrétaire** à rôle restreint exécute, via l'assistant texte **ou** vocal, des actions **commerciales/financières** que l'UI et tRPC lui refusent (créer/envoyer factures, devis, bons de commande ; créer clients/interventions). **Escalade de privilège intra-tenant** dès qu'un tenant a > 1 utilisateur → **blocant 30 juin** pour les comptes multi-utilisateurs.

### Ce qui est sain (à ne pas confondre)
- **Isolation tenant** des outils : OK — `assertClientBelongs`/`assertChantierBelongs` (cf. `2026-06-09-assistant-tools-isolation-fk-injection-ok.md`). Le trou est **seulement** la permission de **rôle**.
- Autres angles du même endpoint, déjà filés séparément : **OPE-170** (rate-limit `/api/voice/tool`), **OPE-81** (paywall hors tRPC), **OPE-48** (XSS rendu assistant).

### Fix (rappel, inchangé depuis OPE-54)
1. Enrichir `ToolContext` avec `userId` + `permissions` (déjà fournis par `getUserFromRequest`).
2. Table outil mutant → permission requise ; refus dans `executeTool` si absente.
3. (Idéal) n'exposer dynamiquement au modèle que les outils autorisés au rôle courant (réduit aussi la surface de prompt-injection).

## Verdict

La faille d'**OPE-54** (HIGH) est **toujours présente et exploitable** au 2026-06-12. **Aucune nouvelle issue** (anti-doublon) ; commentaire de re-vérification ajouté sur **OPE-54**. Reste un **blocant lancement** pour les tenants multi-utilisateurs — à corriger avant le 30 juin (ou restreindre l'assistant aux owners/permissions complètes en attendant).
