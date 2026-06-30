# OPE-877 — Modèle de concurrence de dispatch (SPIKE)

> **Statut : investigation + recommandation. Aucune modification système/launcher.**
> L'humain tranche le GO. Mesures prises sur le serveur staging le 2026-06-30.

## TL;DR

Le cap dur de **4** vient de l'OOM du 29/06 (swap 1 GiB). Depuis, swap = 32 GiB + 3,3 To
de disque libre (swap extensible ~100×). **Les mesures montrent que la contrainte liante
n'est plus le nombre de sessions, mais (a) le nombre de _builds simultanés_ (`tsc`/`vitest`/`vite`,
pics ~1,6 GB de heap _chaud_ non-swappable) et (b) le _quota Claude_.**

Une session **oisive** coûte ~0,43 GB résidents (largement swappables) et **0 token**. Le swap
absorbe sans peine les sessions oisives ; il **ne sauve pas** un build chaud (→ thrash). Donc :

> **cap = min( cap_build , cap_quota )** — pas un nombre fixe.
> Le compte de sessions lui-même n'est quasiment plus borné par la RAM.

Gain attendu vs cap 4 : **×2–3 de parallélisme** sur du travail léger/sonnet/haiku, tout en
**s'auto-bridant** sous le quota lors des rafales opus — sans risque OOM (sémaphore de build).

---

## 1. Mesures (2026-06-30, serveur staging)

### 1.1 RAM / swap / disque
| Métrique | Valeur |
|---|---|
| RAM totale | 31 GiB (32,5 GB) |
| Swap | 32 GiB (used 2,1 GiB au repos) |
| Disque libre (`/`, md3) | 3,3 To → swap peut croître ~100× |
| CPU | 8 cœurs |
| PSI mem au repos | `some avg10=0.00` — aucune pression |

### 1.2 Empreinte par session worker (PSS de l'arbre process, `smaps_rollup`)
Arbre = `claude` + ~3 serveurs MCP stdio (firecrawl ~60 MB, linear, notion).

| Session | PSS arbre | #procs |
|---|---|---|
| worker fix-* (×4) | **390–484 MB** | 4–7 |
| infra (reviewer/PM/auditor) | 393–472 MB | 4 |
| **Médiane par session (oisive/légère)** | **~430 MB** | |

- Le `claude` lui-même : ~370–480 MB RSS, mais **PSS plus bas** (binaire node partagé).
- L'essentiel de l'anon d'une session oisive est **froid → swappable** quasi gratuitement.

### 1.3 Pic de build (transitoire, 30–90 s)
| Process | RSS pic | PSS |
|---|---|---|
| `tsc -p tsconfig.api.json` | ~400 MB | ~300 MB |
| `tsc -p tsconfig.web.json` | **~1,64 GB** | (heap chaud) |
| `vite`/`vitest` | même ordre | |

Ce heap est **chaud et incompressible** pendant le build (le typechecker parcourt tout le
graphe) → **non-swappable sans thrash**. C'est la vraie variable de risque OOM.

### 1.4 Démonstration en direct (capturée pendant le spike)
Au repos : 8 sessions claude + outillage dev = 14,3 GB RSS total, **MemAvailable 17 GB**, swap
2,1/32 GB, PSI mem = 0.

Quand ~4 workers + infra ont lancé `pnpm check` **en même temps** :
`MemAvailable 17 GB → 4,6 GB`, **swap-out actif (`vmstat so≈19 700 KB/s`)**, `PSI mem some
avg10≈0.94` (pression légère, pas encore de thrash). → **Ce sont les builds web-`tsc` empilés
(~1,6 GB chacun) qui mangent la RAM, pas les sessions oisives.**

### 1.5 Reconstitution de l'OOM du 29/06
84 process node, 22,8 GB / 31 GB, **swap 1 GB**. ≈ 12 sessions buildant *toutes en même temps*
(api+web tsc + vite + vitest = plusieurs node/session). Le swap minuscule n'a pas pu évacuer le
froid → OOM. **Cause racine = build-concurrency non bornée × swap insuffisant**, pas
« trop de sessions ».

### 1.6 Quota Claude (mesuré via l'accounting JSONL, pas le panneau `/usage`)
> Le panneau `/usage` ne se scrape pas de façon fiable (TUI, box-drawing cassé, bannière plan).
> Source fiable : `~/.claude/projects/**/<session>.jsonl` (tokens réels par tour).

Burn **coût-équivalent** (poids tarifaires standard : in 1× / cache-write 1,25× / cache-read 0,1× / out ~5×) :

| Modèle | Session active | Notes |
|---|---|---|
| **opus-4-8** | **~19–54 $/h** (médiane ~30 $/h) | cache-read 5–19 M tok/h, out 65–160 k/h |
| **sonnet-4-6** | **~2–4 $/h** | ~10× moins cher qu'opus |
| **haiku** | ≪ sonnet | négligeable |
| **session oisive** (cron en attente, bloquée) | **~0** | aucun tour = aucun token |

**Point clé** : le quota brûle avec le **débit de tours ACTIFS × poids du modèle**,
**indépendamment du nombre de sessions**. 10 sessions oisives ≈ 0 quota.

---

## 2. Modèle de la contrainte liante

| Variable | Bornée par | Mitigeable ? |
|---|---|---|
| **Compte de sessions** | swap + RAM / ~0,43 GB → **>100** | oui (swap, ~gratuit) → **non liant** |
| **Builds simultanés** | RAM / ~1,6 GB de heap chaud | partiellement (sémaphore + stagger) |
| **Débit quota** | budget 5h/hebdo / (burn × #actifs) | **non** (plafond dur Anthropic) |

**Conclusion : la contrainte liante a basculé de « RAM-compte » vers « quota » (pour le débit
utile) et « build-concurrency » (pour le risque OOM résiduel).** Le swap **repousse réellement**
le plafond de _compte_ (le froid évince proprement) mais **convertit l'OOM en lenteur** dès qu'on
empile des builds _chauds_ — il ne crée pas de RAM pour le working set actif.

---

## 3. Formule de cap dynamique

```
cap_dispatch = min( cap_quota , cap_build )           # plus de cap fixe à 4

cap_build  = floor( (RAM_total − headroom_OS − Σ résident_sessions) / build_peak )
           # gouverne les BUILDS concurrents, pas les sessions.
           # 31 GiB − ~6 GiB headroom − (N×0,43) / 1,6 GiB  →  ~4–6 builds chauds sûrs.

cap_quota  = floor( budget_restant_5h / (burn_actif_pondéré × horizon_h × frac_active) )
           # budget_restant_5h : lu sur le plan ; burn_actif_pondéré : §1.6 par modèle.
           # ex. opus ~30 $/h, sonnet ~3 $/h → cap_quota(opus) ≪ cap_quota(sonnet).

cap_sessions_soft = 12   # plafond de blast-radius/manageabilité, PAS une limite RAM.
```

Deux gouverneurs **séparés** (c'est la nuance qui débloque le parallélisme) :

1. **Admission de session (compte)** = `min(cap_quota, cap_sessions_soft)`.
   Le swap absorbe les sessions oisives → on peut en avoir beaucoup si elles sont légères/cheap.
2. **Sémaphore de build (concurrence)** = `cap_build` (~4–6).
   Empêche l'empilement de `tsc`/`vitest` chauds → **pas d'OOM quel que soit le compte de sessions.**
   C'est le vrai héritier du « cap 4 » : il borne ce qui faisait l'OOM, pas les sessions.

---

## 4. Recommandations

### 4.1 Auto-grow swap — **priorité BASSE** (la RAM-compte n'est plus liante)
Le swap actuel (32 GiB) suffit largement pour absorber le froid de ~12 sessions. Auto-grow utile
seulement comme **filet** si on lève le plafond soft très haut. Si retenu, garder simple :
```
# ponytail: filet, pas un système. cron 2min.
# si SwapFree < 4 GiB ET PSI mem some avg10 > 20 → fallocate +16 GiB swapfile, swapon.
# disque 3,3 To → marge ~100×. Jamais en deçà de 4 GiB libres.
```
**Ne PAS** investir là-dessus avant d'avoir bridé la build-concurrency : sans sémaphore, plus de
swap = plus de thrash, pas plus de débit.

### 4.2 Monitoring pour piloter le cap à chaud (à LIRE, déjà tout dispo)
| Signal | Source | Seuil d'action |
|---|---|---|
| Pression mémoire | `/proc/pressure/memory` `some avg10` | > 20 → geler nouveau build ; > 40 → geler dispatch |
| Thrash | `vmstat` `si/so` | `so` soutenu > ~10 MB/s → trop de builds chauds |
| RAM dispo | `MemAvailable` | < ~4 GB → pause admission |
| Builds en cours | `pgrep -f 'tsc|vitest|vite'` regroupé/session | ≥ cap_build → file d'attente |
| Quota 5h/hebdo | accounting JSONL §1.6 (fiable) ou `/usage` | budget restant → cap_quota |

PSI (`/proc/pressure/memory`) est **le** bon signal anti-OOM : il monte _avant_ le thrash dur
(vu en §1.4 : 0.94 sous charge de builds, bien avant la rupture).

### 4.3 Mix de modèles = levier de quota gratuit
opus brûle ~10× sonnet. Router le travail mécanique (tests, fix simples, audits) vers
sonnet/haiku **multiplie** `cap_quota`. Réserver opus au reviewer/architecture (déjà la convention
CLAUDE.md). Le cap dynamique **récompense** ce routage automatiquement.

---

## 5. Comparaison chiffrée — cap fixe 4 vs dynamique

| | Cap fixe 4 | Cap dynamique `min(cap_quota, cap_build)` |
|---|---|---|
| Sessions légères/oisives | plafonné à 4 — **gâche ~17 GB RAM + quota** | ~10–12 (swap absorbe) → **×2,5–3** |
| Rafale opus lourde | 4 (peut quand même dépasser quota) | s'auto-bride à `cap_quota` → **protège le quota** |
| Risque OOM | « géré » en sous-dimensionnant tout | géré par **sémaphore de build (~4–6)**, découplé du compte |
| Builds simultanés | implicite ≤ 4 | explicitement borné (le vrai héritier du cap 4) |
| Utilisation RAM | ~45 % typique | pilotée par PSI, ~70–80 % cible |

**Risques du dynamique** : (1) si le sémaphore de build est mal réglé → thrash (mitigé : PSI gate
§4.2) ; (2) rafale opus → quota crâmé vite (mitigé : `cap_quota` + routage modèle §4.3) ;
(3) plus de sessions = plus de surface de collision sur `staging`/migrations (déjà géré par les
règles PM existantes : sérialiser migrations & éditions de contrat).

---

## 6. Plan d'implémentation découpé (pour décision humaine — NON implémenté)

- **Lot A — Sémaphore de build (le plus important, débloque la sécurité).**
  Un sémaphore global `cap_build=4` (fichier-lock dans `~/.agent-bus/` ou `flock`) que chaque
  session prend avant `pnpm check`/`vitest` et relâche après. Remplace le rôle anti-OOM du cap 4.
  *Effort : petit. Risque : faible. À faire en premier.*

- **Lot B — Cap de dispatch dynamique côté PM/launcher.**
  Avant chaque tick de dispatch : calculer `cap = min(cap_quota, cap_sessions_soft)` avec
  `cap_quota` lu de l'accounting JSONL (helper ~30 lignes) + garde PSI (`some avg10 < 20`).
  Remplace le `>= 4 → skip` actuel. *Effort : moyen. Dépend de Lot A pour la sécurité.*

- **Lot C — Monitoring/observabilité (optionnel).**
  Petit script `dispatch-pressure.sh` qui imprime PSI + MemAvailable + builds-en-cours + burn-5h,
  appelé par le PM au réveil. *Effort : petit.*

- **Lot D — Auto-grow swap (filet, optionnel, priorité basse).**
  Seulement si on pousse `cap_sessions_soft` > ~15. Voir §4.1. *Effort : petit. À ne pas prioriser.*

### Recommandation finale
1. **GO Lot A** (sémaphore de build) — récupère la sécurité OOM indépendamment du compte.
2. **GO Lot B** avec `cap_sessions_soft = 12`, `cap_build = 4`, gate PSI — passe de 4 fixe à un cap
   piloté ; gain ×2–3 sur le travail léger, auto-protection quota sur opus.
3. **Lot C** si on veut de la visibilité ; **Lot D** seulement si on monte le plafond plus haut.

> Le « cap 4 » n'était pas faux — il visait juste la **mauvaise variable** (sessions) au lieu de la
> bonne (**builds chauds simultanés**). Le découpler libère le parallélisme sans rouvrir l'OOM.
