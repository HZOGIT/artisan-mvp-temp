# Audit — Résilience process : crash de l'instance sur erreur non gérée (pool MySQL + absence de filet global)

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin · **Sévérité : 🟠 HIGH**

> Périmètre : bootstrap serveur (`server/_core/index.ts`), création du pool MySQL
> (`server/db.ts:130`), gestion d'erreurs process/Express.

---

## 🟠 HIGH — une coupure DB (événement de routine) crashe toute l'instance multi-tenant

Le serveur n'a **aucun filet d'erreur de dernier recours** :

| Filet attendu (prod) | Présent ? | Preuve |
| -- | -- | -- |
| `pool.on('error', …)` (mysql2) | ❌ | `db.ts:130` `mysql.createPool({...})` — aucun `_pool.on('error')` après |
| `process.on('unhandledRejection', …)` | ❌ | `grep -rn process.on server/` → **0** |
| `process.on('uncaughtException', …)` | ❌ | idem → **0** |
| Middleware d'erreur Express (4 args) | ❌ | dernier `app.use` = middleware tRPC (`index.ts:1294`), pas de `(err,req,res,next)` |

### Le chemin de crash concret : pool MySQL

Le `Pool` mysql2 est un `EventEmitter`. Quand une connexion poolée subit une erreur
fatale (fermeture serveur, `PROTOCOL_CONNECTION_LOST`, failover du MySQL managé,
`wait_timeout`, blip réseau), le pool **émet un événement `'error'`**. Sur un
`EventEmitter`, un `'error'` **sans listener** est **relancé** par Node →
`uncaughtException`. Comme **aucun** `process.on('uncaughtException')` n'est enregistré,
**Node 22 termine le process**.

→ **Une coupure DB transitoire (événement courant en cloud) ne dégrade pas une requête :
elle tue tout le serveur**, droppant toutes les requêtes/SSE en vol de **tous les
tenants**. `enableKeepAlive:true` réduit les déconnexions *idle* mais **n'empêche pas** les
coupures côté serveur (maintenance/failover du MySQL managé).

### Aggravants

- **Express 4.21.2** (`package.json`) : un handler `async` qui *reject* n'est **pas**
  transmis à un middleware d'erreur (comportement v4) → toute route async oubliant un
  `try/catch` (ou une lib qui rejette de façon asynchrone) devient un `unhandledRejection`
  → crash. *(Les routes actuelles sont disciplinées en try/catch, mais le filet manque
  pour le premier oubli.)*
- **Crash-loop** : si la DB est durablement injoignable, `restart: unless-stopped`
  redémarre le conteneur → reconnexion échoue → re-crash → **outage prolongé** au lieu
  d'un back-off propre.
- **DoS** : si un jour un chemin async *request-triggerable* échappe au try/catch, un
  attaquant peut **boucler la requête** pour maintenir le crash-loop → indisponibilité
  totale.

### Mitigation actuelle (partielle)

`restart: unless-stopped` (compose) relance le conteneur → ~quelques secondes d'outage
**par incident**, requêtes en vol perdues. Ce n'est pas une résilience, c'est un
ramasse-miettes.

---

## Distinction (anti-doublon)

- **OPE-13 (observabilité)** = brancher New Relic/BetterStack pour *voir* les erreurs.
  Ici le problème n'est pas la visibilité mais le **crash** : il faut **survivre** à
  l'erreur (handlers) et **logger** (sink). Complémentaire, pas doublon.
- Aucune issue existante ne traite `pool.on('error')` / `uncaughtException` /
  `unhandledRejection` / middleware d'erreur Express.

---

## Fix proposé

1. **Pool MySQL** (`db.ts`, après `createPool`) :
   ```typescript
   _pool.on('error', (err) => console.error('[MySQL pool] error (non-fatal):', err?.code, err?.message));
   ```
2. **Filet process** (au bootstrap, `index.ts`) :
   ```typescript
   process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));
   process.on('uncaughtException', (err) => { console.error('[uncaughtException]', err); /* log → sink, ne pas exit brutalement */ });
   ```
3. **Middleware d'erreur Express** (dernier `app.use`, 4 args) qui renvoie 500 propre et
   logge — + envelopper les handlers async dans un `asyncHandler` (ou passer Express 5).
4. Brancher ces logs sur le sink d'observabilité d'OPE-13.

---

## Verdict

Le serveur **n'a aucun filet de dernier recours** : un événement `error` du pool MySQL
(coupure DB de routine) → `uncaughtException` non géré → **crash de toute l'instance
multi-tenant**, avec risque de **crash-loop**. **🟠 HIGH** (disponibilité). → **Issue
Linear créée.**
