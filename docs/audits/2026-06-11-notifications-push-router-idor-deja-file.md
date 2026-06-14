# Audit — notificationsPushRouter : IDOR systémique (technicienId sans ctx) — déjà filé

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : `notificationsPushRouter` (`routers.ts:5737-5810`) — subscribe, unsubscribe,
> getPreferences, savePreferences, getHistorique, markAsRead, **send**.

---

## Conclusion : IDOR sur tout le routeur — **déjà filé OPE-31**. Pas de BLOCKER/HIGH nouveau.

### Toutes les procédures sont `async ({ input })` **sans `ctx`**

| Procédure | Signature | Effet (technicienId d'entrée non validé) |
| -- | -- | -- |
| `subscribe` (`:5738`) | `async ({ input })` | abonne le push d'un technicien **arbitraire** |
| `unsubscribe` (`:5750`) | `async ({ input })` | désabonne par `endpoint` arbitraire |
| `getPreferences` (`:5757`) | `async ({ input })` | lit les prefs de **n'importe quel** technicien |
| `savePreferences` (`:5763`) | `async ({ input })` | écrit les prefs d'un technicien arbitraire |
| `getHistorique` (`:5779`) | `async ({ input })` | **lit l'historique de notifs** d'un autre tenant |
| `markAsRead` (`:5785`) | `async ({ input })` | marque lu sur un id arbitraire |
| **`send` (`:5793`)** | `async ({ input })` | **push/notif vers un technicien arbitraire** (cross-tenant) |

→ **Aucun** handler ne résout `ctx.user` ni ne vérifie `tech.artisanId === artisan.id`.
C'est la **signature systémique de l'IDOR** (cf. véhicules OPE-47, rapports OPE-46).

### Déjà filé

- **OPE-31** (« 🔴 IDOR multi-tenant — routes « technicienId » sans ownership
  (notificationsPush + conges.byTechnicien) ») couvre **exactement** ce routeur (le
  `technicienId` de l'appelant passé direct aux helpers sans scope). → **Pas de doublon.**
- Le **pipeline web-push absent** (pas de VAPID/SW/envoi réel) = **déjà filé**
  (notifications-push-pipeline-mort) → le `send` n'envoie de toute façon rien (impact de
  l'IDOR `send` borné à l'écriture de lignes de notif cross-tenant).

---

## Verdict

Le `notificationsPushRouter` est **intégralement IDOR** (handlers `async ({ input })` sans
`ctx`, `technicienId` non validé) → **déjà capturé par OPE-31**. Le pipeline push mort est
**déjà filé**. **Pas de nouvelle issue Linear.**
