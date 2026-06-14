# Audit — MonAssistant IA / Gemini (clé API, tools, multi-tenant) — RAS bloquant

**Date** : 2026-06-06 · **Projet** : Lancement 30 juin

> Périmètre : assistant texte (`/api/assistant/stream`), assistant vocal Live
> (`/api/voice/token`, `/api/voice/tool`, `/api/voice/persist`), et l'exécution
> des outils (`server/_core/assistantTools.ts`, `executeTool`). Contrainte de
> sécurité explicite : **la clé `GEMINI_API_KEY` ne doit JAMAIS atteindre le
> navigateur.** **Aucun BLOCKER ni HIGH** → pas d'issue Linear.

---

## Ce qui a été vérifié et est correct

### 1. La clé Gemini ne fuit pas vers le client ✓ (contrainte respectée)
- `grep GEMINI_API_KEY|VITE_GEMINI` dans `client/src/` → **0 résultat**.
- `/api/voice/token` (`index.ts:1099`) **frappe un token éphémère** côté serveur
  via `https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=…`
  (`index.ts:1178`) avec `uses: 1`, `expire_time` 30 min, `new_session_expire_time`
  60 s. La réponse au navigateur ne renvoie que `token` (le **nom du token
  éphémère**), `wsUrl`, `model`, `expiresAt` (`index.ts:1197`) — **jamais la clé
  brute**. La clé n'est utilisée que dans l'appel serveur→Google.

### 2. L'`artisanId` est dérivé côté serveur, jamais du LLM ✓
- Texte (`/api/assistant/stream:921`) et vocal (`/api/voice/tool:1244`) :
  `getUserFromRequest` → `getArtisanByUserId(user.id)` → `executeTool(name, args,
  { artisanId: artisan.id })`. Le modèle ne contrôle que **le nom de l'outil et
  les paramètres métier** ; le tenant est imposé par la session authentifiée.
  Impossible d'injecter un `artisanId` via les arguments d'outil.

### 3. Les exécuteurs d'outils vérifient l'ownership ✓
- Helper `assertClientBelongs` (`assistantTools.ts:723`) :
  `client.artisanId !== ctx.artisanId → throw`.
- `sendFactureEmailHelper` : `factureData.artisanId !== ctx.artisanId → throw`.
- `execModifierIntervention` : `existing.artisanId !== ctx.artisanId → fail`.
- `assertEmailRecipient` (`:620`) refuse tout destinataire d'un autre tenant
  (`recipient.artisanId !== ctx.artisanId`) et est appelé par **les 4 outils
  d'envoi** : devis (`:810`), facture (`:997`), relance (`:1087`), commande
  fournisseur (`:1358`). → **pas d'envoi d'email cross-tenant**.
- `/api/voice/persist` vérifie l'appartenance du thread
  (`getAiThread(threadId, artisan.id)`, `index.ts:1229`).

### 4. Pas de contournement de permissions exploitable
`ToolContext = { artisanId }` ne porte pas de rôle/permission, mais les 3
endpoints assistant résolvent l'artisan via `getArtisanByUserId(user.id)` —
qui ne retourne un artisan **que pour le propriétaire** (un collaborateur
secrétaire/technicien obtient 404 « Artisan non trouvé »). L'assistant est donc
de fait **réservé au propriétaire**, lequel détient déjà toutes les permissions
(`ALL_PERMISSIONS`). Aucune escalade de privilège atteignable via l'assistant.

---

## Observations secondaires (sévérité < HIGH — pas d'issue)

1. **Actions sortantes autonomes sans confirmation.** Les outils
   `envoyer_devis`, `envoyer_facture`, `envoyer_relance`,
   `creer_et_envoyer_devis`, `envoyer_commande_fournisseur` **envoient de vrais
   emails** à des clients/fournisseurs et créent des documents engageants, sur
   décision du modèle, **sans étape de confirmation humaine** explicite. Le
   périmètre est borné au compte de l'artisan (ownership vérifié), mais combiné
   au risque d'**injection de prompt** (du texte fourni par un client peut entrer
   dans le contexte), une étape de prévisualisation/confirmation avant tout envoi
   serait prudente. Le system prompt décourage déjà fortement l'hallucination.

2. **Coût / rate limiting** des endpoints IA : déjà suivi sous **OPE-24**
   (`/api/voice/token` notamment). À étendre éventuellement au stream texte.

---

## Conclusion

La gestion de la clé Gemini (token éphémère), le scoping multi-tenant
(`artisanId` serveur + ownership par outil + `assertEmailRecipient`) et l'accès
(propriétaire uniquement) sont **corrects**. Aucun BLOCKER/HIGH. Seule une étape
de confirmation pour les actions sortantes de l'IA est recommandée (durcissement
produit, non bloquant).
