# Audit — Observabilité des erreurs : état des lieux du code (→ OPE-13)

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Complète **OPE-13** (« Mettre en place l'observabilité avant lancement ») avec
> l'**état réel du code** de gestion d'erreurs, motivé par l'incident `/parametres`
> (React #310) — découvert **uniquement** parce qu'un utilisateur l'a signalé.

---

## Ce qui existe aujourd'hui (et ses limites)

### Serveur
- **`logError()`** (`errorHandler.ts`) est appelé (~10+ sites dans `db-secure.ts`)
  mais c'est un **TODO stub** :
  ```typescript
  // errorHandler.ts:126-129
  if (ENV.isProduction && ENV.sentryDsn) {
    // TODO: Implémenter Sentry
    console.error(JSON.stringify(logEntry));
  } else { console.error(logEntry); }
  ```
  → `@sentry` **absent de `package.json`**, `SENTRY_DSN` **absent** de `.env.local`/
  `.env.staging` → la branche Sentry n'est **jamais** prise ; tout finit en
  `console.error` (stdout docker).
- **Aucun middleware d'erreur Express** monté (`grep errorHandler index.ts` → 0).
- **Aucun `process.on('uncaughtException')` / `unhandledRejection`** → pas de filet
  process. Sous Node 22 (`--unhandled-rejections=throw` par défaut), une rejection
  non gérée peut **tuer le process** sans log structuré ni alerte.

### Client
- `ErrorBoundary.componentDidCatch` : `console.error` + `navigator.sendBeacon(
  "/api/voice/debug", …)` → les crashes sont **postés au serveur** (canal de
  **debug vocal** réutilisé) et apparaissent en `[VoiceDebug] ErrorBoundary …` dans
  les logs docker. C'est **exactement** ainsi que `/parametres` a été diagnostiqué
  (`docker logs | grep`).

### Net
Il y a un **logging stdout** (docker logs) côté client et serveur, mais :
- **aucune agrégation / dashboard / recherche** ;
- **aucune alerte** (il faut tailer les logs manuellement) ;
- **aucun service d'error tracking** (Sentry = stub, jamais installé/configuré) ;
- **aucun filet process**.

→ **Au lancement, les incidents sont invisibles** sauf log manuel ou plainte
client. L'incident `/parametres` (page entièrement cassée) en est la preuve.

---

## Minimum recommandé (à intégrer dans OPE-13)

1. **Error tracking** : installer + initialiser un SDK (Sentry — le `SENTRY_DSN`
   est déjà prévu dans `env.ts` — ou l'outil retenu en OPE-13) **client ET
   serveur** ; remplacer le TODO de `errorHandler.ts:127` par un vrai
   `captureException`.
2. **Filet process** : `process.on('unhandledRejection')` + `uncaughtException`
   (log + report + exit propre).
3. **Middleware d'erreur Express** monté en fin de chaîne (raw routes).
4. **Alerting** : au minimum un webhook/ntfy sur erreur serveur critique (ntfy
   existe déjà pour les deploys).
5. Renommer/clarifier le canal `/api/voice/debug` détourné pour les crashes
   client, ou le router vers l'error tracking.

---

## Verdict

L'observabilité est **prévue mais non livrée** (env var `SENTRY_DSN` + stub TODO,
sans SDK ni config, sans filet process). C'est **OPE-13** ; cet audit en fournit
l'**état des lieux précis** + l'incident `/parametres` comme justification.
→ **OPE-13 étendu par commentaire.** Pas de nouvelle issue.
