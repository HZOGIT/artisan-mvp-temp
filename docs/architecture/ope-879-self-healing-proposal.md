# OPE-879 — Self-healing data par module : SPIKE + PROPOSITION

> **Statut : PROPOSITION — en attente de validation humaine.** Aucune implémentation engagée.
> Ce document est un *spike* (recherche + proposition d'architecture), pas un plan d'exécution validé.
> Auteur : session `spike-self-healing` (2026-06-30).

## 0. TL;DR

Des inconsistances data apparaissent (écritures manquantes, `emails_log` non écrit, events non émis, désync stock/modules/abonnement…). On veut des **crons de réconciliation par module** + une **trace auditable** de chaque réparation.

**Conclusion de l'échelle YAGNI : on ne construit presque rien de neuf.** Operioz a déjà
(a) un **scheduler idempotent** (`scheduler_job_runs`, `JobRegistry`/`JobDefinition`/`runJob`),
(b) un **outbox d'events auditable** (`event_outbox` → `events`, drainé `FOR UPDATE SKIP LOCKED`),
(c) un **précédent de reconciler en prod** (`pa-reconciliation-poller.ts`, clés synthétiques idempotentes + advisory lock),
(d) un **précédent d'« acteur système »** (`billing_events.actor = "scheduler" | "stripe_webhook"`).

Un *reconciler* = un `JobDefinition` dont le `run()` exécute `detect → diagnose → heal → verify` et **émet un healing event dans `event_outbox`** (`action: "healing.<module>.<invariant>"`, `payload` = avant/après/raison, acteur = système). **Zéro nouvelle infra de scheduling, zéro nouveau bus.** Le seul ajout *éventuel* est une vue/table légère de **revue manuelle** pour les cas ambigus — et encore, seulement quand un module en a réellement besoin.

---

## 1. Recherche web — patterns établis (sourcés)

### 1.1 Reconcile / control loop (Kubernetes)

Le pattern de référence du self-healing. Un contrôleur compare en continu **desired state** (`spec`) vs **observed state** (`status`), calcule le diff et agit jusqu'à convergence. Point clé pour nous : la logique est **level-triggered, pas edge-triggered** — le contrôleur ne réagit pas *une fois* à un event ; il redemande en boucle « le monde est-il dans l'état voulu ? » et converge **quel que soit le nombre d'events manqués**. C'est exactement ce qui donne la résilience « gratuite » : si un event a été perdu (la cause de nos inconsistances), un système edge-triggered reste cassé pour toujours ; un reconciler level-triggered se rattrape au tick suivant.

- *Reconciliation Loop Pattern* — [oneuptime.com](https://oneuptime.com/blog/post/2026-02-09-operator-reconciliation-loop/view)
- *Kubernetes and Reconciliation Patterns* — [hkassaei.com](https://hkassaei.com/posts/kubernetes-and-reconciliation-patterns/)
- *Operators 101, How operators work* — [Red Hat Developer](https://developers.redhat.com/articles/2021/06/22/kubernetes-operators-101-part-2-how-operators-work)

**À retenir pour Operioz** : chaque reconciler exprime un **invariant désiré** (« toute facture émise a ses écritures comptables ») et **converge** vers lui à chaque tick, indépendamment de l'event manqué qui a causé la dérive.

### 1.2 Anti-entropy / read-repair / Merkle (Cassandra, DynamoDB)

Réparer la **dérive entre répliques** : comparer les données et mettre à jour vers la version correcte. Deux variantes complémentaires :
- **Read-repair** : réparation *opportuniste*, déclenchée par le trafic de lecture (« anti-entropy déclenché par les reads »).
- **Anti-entropy (background)** : balayage périodique comparant via **arbres de Merkle** (hash hiérarchique) pour ne transférer **que** les plages divergentes, sans rescanner tout le dataset.

- *Anti-Entropy in Distributed Systems* — [GeeksforGeeks](https://www.geeksforgeeks.org/anti-entropy-in-distributed-systems/)
- *Merkle Trees and Anti-Entropy* — [deepengineering.substack.com](https://deepengineering.substack.com/p/merkle-trees-and-anti-entropy-concepts)
- *Anti-entropy repair* — [DataStax / Cassandra docs](https://docs.datastax.com/en/cassandra-oss/3.x/cassandra/operations/opsRepairNodesManualRepair.html)

**À retenir pour Operioz** : on n'a pas de répliques façon Cassandra, mais le concept *read-repair* est directement transposable — réparer *au moment où on lit* l'entité (cheap, ciblé) **en plus** du cron de fond (exhaustif). Et le principe Merkle = **ne scanner que ce qui peut avoir dérivé** (curseur/`updatedAt`/fenêtre glissante) plutôt que toute la table à chaque tick.

### 1.3 Transactional outbox / DLQ / idempotent consumer

Le problème racine de nos « events non émis » est le **dual-write** : écrire en base *et* publier un event comme deux opérations séparées → l'une peut échouer. La parade canonique est l'**outbox transactionnel** (déjà en place chez nous via `withOutbox`). En complément :
- **Consommateur idempotent** : porter un `event_id` unique et vérifier « déjà traité ? » avant d'appliquer.
- **DLQ + retry/back-off** : isoler les échecs persistants sans bloquer le pipeline ; les rejouer plus tard.
- **Reconciliation/cleanup** : TTL / archivage des events traités, partitions.

- *Transactional Outbox — trade-offs* — [softwarecraftsperson.com](https://www.softwarecraftsperson.com/posts/2025-10-08-transactional-outbox-pattern/)
- *AWS Prescriptive Guidance — Transactional outbox* — [docs.aws.amazon.com](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)
- *Idempotency, DLQ & Outbox in Kafka* — [Medium / Melis Togan](https://medium.com/@melistogan6/idempotency-dlq-and-the-outbox-pattern-in-kafka-a-practical-guide-to-consistent-streams-b5e7620ea80d)

**À retenir pour Operioz** : le healing est le **filet de sécurité** quand l'outbox n'a pas été utilisé (vieux chemins de code, mutations directes hors `withOutbox`). Le reconciler joue le rôle d'« anti-entropy » sur la divergence *table métier ↔ journal d'events / `emails_log`*. La file de **revue manuelle** = notre DLQ applicative.

### 1.4 Self-healing / auto-remediation (SRE, closed-loop)

La boucle standard : **detect → diagnose → decide → remediate → verify → (escalate / learn)**. Composants : télémétrie, règles de détection, moteur de décision (runbook/policy), exécution, **vérification post-action**, **escalade si la vérif échoue**, feedback. Deux niveaux d'automatisation : **semi-auto** (propose un fix, exige une approbation) et **full-auto** (exécute sans humain, réservé au *low-risk*). Garde-fou transverse : **circuit breaker** (Hystrix/Resilience4j) contre les cascades, et **idempotence** pour des retries sûrs.

- *Closed-Loop Remediation & Self-Healing AIOps* — [aicompetence.org](https://aicompetence.org/closed-loop-remediation-self-healing-aiops/)
- *Kill the Pager — Auto-Remediation & Self-Healing* — [Medium / Anudeep Balla](https://medium.com/@anudeepballa7/kill-the-pager-a-practical-guide-to-auto-remediation-and-self-healing-systems-f1507343f9f2)
- *How to Build Self-Healing Systems* — [oneuptime.com](https://oneuptime.com/blog/post/2026-01-30-self-healing-systems/view)

**À retenir pour Operioz** : la phase **verify** est non-négociable (re-`detect()` après `heal()` : l'anomalie a-t-elle disparu ?), et l'**escalade** sur échec de vérif = notre alerte humaine. Le **niveau d'automatisation par invariant** est un choix explicite : low-risk → full-auto, ambigu/destructif → semi-auto (revue).

### 1.5 Saga / compensation (workflows partiels)

Pour les processus multi-étapes qui échouent au milieu (ex. signature devis → génération facture → écriture comptable). Une saga **annule logiquement** (compensating transaction) les étapes déjà faites — pas un rollback exact, un **inverse métier**. Recovery : retries back-off, puis **flag pour résolution manuelle** si la compensation échoue elle-même.

- *Compensating Transaction Pattern* — [Microsoft Learn](https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction)
- *Saga Design Pattern* — [Microsoft Learn](https://learn.microsoft.com/en-us/azure/architecture/patterns/saga)
- *Avoid Manual Reconciliation with Saga* — [zhorifiandi.github.io](https://zhorifiandi.github.io/software-engineering/2024/09/14/solve-stuck-systems-flow-using-saga-pattern.html)

**À retenir pour Operioz** : la plupart de nos inconsistances ne sont **pas** des sagas à compenser mais des **étapes manquantes à compléter** (forward-fix : créer l'écriture absente) — plus simple et moins destructif que la compensation. Réserver la logique de compensation aux cas où un *avancement partiel* doit être **annulé** (rare).

### 1.6 Auditabilité du healing (réconciliation financière)

En finance, chaque réconciliation capture **qui / quoi / quand / justification / approbation**, et chaque exception est liée à une **piste d'audit immuable** : on doit pouvoir retracer l'historique avant de finaliser. L'écriture corrective générée est **liée à son exception** d'origine (pas de re-saisie aveugle). Alertes aux *data stewards* quand une exception sort des règles attendues.

- *Reconciliation Audit Trail* — [hyperbots.com](https://www.hyperbots.com/glossary/reconciliation-audit-trail)
- *Immutable Audit Trails* — [hubifi.com](https://www.hubifi.com/blog/immutable-audit-log-basics)
- *Transaction Reconciliation best practices* — [numeric.io](https://www.numeric.io/blog/transaction-reconciliation-guide)

**À retenir pour Operioz** : un **healing event** doit porter `entité`, `invariant`, `avant → après`, `raison`, `acteur=système`, `dry-run?`, et être **immuable** (append-only `events`). Vu nos enjeux légaux (facture électronique, archivage 10 ans — OPE-295), une réparation **comptable** doit être traçable au même niveau qu'une saisie humaine.

---

## 2. Diagnostic interne — candidats Operioz

Croisé avec les invariants réels du schéma (`drizzle/schema/*`) et les audits récents. Classés par criticité.

| # | Invariant désiré | Dérive observée | Tables | Risque | Niveau auto |
|---|---|---|---|---|---|
| C1 | Toute facture émise/payée a ses **écritures comptables** équilibrées | écriture manquante | `factures`, `ecritures_comptables` | **Légal/compta** | semi-auto (forward-fix + revue) |
| C2 | Tout envoi d'email a sa ligne **`emails_log`** | log manquant | `emails_log`, `event_outbox` | Traçabilité | full-auto (insert log `statut=inconnu`) |
| C3 | Toute mutation métier « eventée » a son **event** dans `events` | event non émis | `event_outbox`, `events` | Observabilité, fan-out | full-auto (read-repair) |
| C4 | `event_outbox` ne contient pas d'items **bloqués** (drain en échec) | backlog qui grandit | `event_outbox` | Pipeline | full-auto requeue + DLQ si N retries |
| C5 | **Stock** courant = Σ `mouvements_stock` | écart quantité | `stocks`, `mouvements_stock` | Données métier | semi-auto (recompute + revue si |Δ| > seuil) |
| C6 | `artisan_modules` cohérent avec le **plan** d'abonnement | modules désync plan | `artisan_modules`, `subscriptions` | Accès/billing | semi-auto |
| C7 | Abonnement **`past_due`** ne reste pas bloqué indéfiniment | état coincé | `subscriptions`, `billing_events` | Revenu/accès | semi-auto (déjà partiellement couvert par `billing-scheduler`) |
| C8 | Devis **signé** ⇒ état/ò facture cohérents | désync signature | `devis`, `factures` | Métier | semi-auto |

**Précédents déjà en prod à généraliser, pas à réinventer :**
- `apps/api/shared/infra/pa-reconciliation-poller.ts` — reconciler e-invoicing : clés synthétiques **déterministes** (`reconcil:<doc>:<statut>:<ts>` → `ON CONFLICT DO NOTHING`) + **advisory lock** anti-double-poll multi-réplica. **C'est déjà le pattern cible.**
- `apps/api/modules/billing/application/billing-scheduler.ts` — jobs périodiques avec `actor: "scheduler"` dans `billing_events`. Couvre déjà partiellement C7.

**Pilotes recommandés (ordre)** : **C3 + C4** (events — réutilisent l'outbox tel quel, full-auto, faible risque, valident le framework) → **C2** (`emails_log`, full-auto) → **C5** (stock, premier semi-auto avec seuil) → **C1** (compta, le plus sensible, en dernier, semi-auto strict).

---

## 3. Proposition d'architecture (adaptée Operioz)

### 3.1 Un reconciler = un `JobDefinition` (réutilise le scheduler existant)

Pas de nouveau moteur. On ajoute une **fine surcouche** au-dessus de `JobRegistry`/`runJob` (déjà idempotents via `scheduler_job_runs` + `INSERT ON CONFLICT`). Forme d'un reconciler :

```
detect()   -> liste les entités qui violent l'invariant (requête SQL ciblée, fenêtrée par updatedAt/curseur — façon "Merkle": ne scanner que le récemment-modifié)
diagnose() -> pour chaque anomalie, classe : réparable-auto | ambigu (revue) | ignorer
heal()     -> applique le forward-fix IDEMPOTENT dans une transaction (withOutbox) — ou no-op si dry-run
verify()   -> re-detect sur l'entité : l'anomalie a-t-elle disparu ? sinon -> escalade
```

Chaque reconciler s'enregistre via `registry.register({ name: "heal:events-outbox", periodKey: dailyKey, run })`. **L'idempotence inter-process est déjà fournie** par `tryClaimRun(jobName, periodKey)`. La cadence (cron) réutilise l'infra `toad-scheduler` existante (cf. `*-cron.ts`, `outbox-drainer.ts`).

> **ponytail** : ne PAS introduire d'abstraction `Reconciler<T>` générique tant qu'on n'a pas 2-3 reconcilers réels. Les 2 premiers sont des `JobDefinition` à la main ; on extrait le helper commun **après** avoir vu ce qui se répète (probablement juste `runReconciler(detect, heal, verify, { dryRun })`).

### 3.2 Healing events = `event_outbox`/`events` existants (rien de neuf)

On **réutilise le journal d'events** (`events`, append-only, déjà l'« audit trail » du système). Un healing event :

```
action     : "healing.<module>.<invariant>"   (ex. "healing.compta.ecriture-manquante")  — convention FR minuscule, cohérente OPE-611
entityType : la table réparée (ex. "facture")
entityId   : l'entité réparée
payload    : { invariant, avant, apres, raison, dryRun: bool, reconciler, anomalieId }
userId     : null   (acteur = système)
```

Précédent direct : `billing_events.actor = "scheduler"`. Ici l'acteur système est porté par `userId = null` + le préfixe `healing.*` (filtrable). **Atomicité** : le healing event est inséré **dans la même transaction** que la réparation via `withOutbox` → soit les deux, soit rien (invariant déjà garanti par le helper existant). Pas de table dédiée : le journal `events` *est* la piste d'audit immuable.

### 3.3 Garde-fous (les non-négociables)

| Garde-fou | Mécanisme |
|---|---|
| **Dry-run par défaut** | flag `HEALING_DRYRUN` (env/feature). En dry-run, `heal()` n'écrit que le healing event `dryRun:true` (ce qu'on *aurait* fait) → on observe avant d'armer. Chaque reconciler s'arme individuellement. |
| **Seuil / circuit-breaker** | si `detect()` renvoie > `N` anomalies (config par reconciler), **ne pas réparer en masse** : émettre une **alerte humaine** (ntfy + healing event `action:"healing.<m>.seuil-depasse"`) et s'arrêter. Une dérive massive = un bug à la source, pas à patcher en boucle. |
| **Anti-boucle** | `heal()` est **forward-fix idempotent** (réparer = compléter le manquant, jamais re-déclencher un side-effect). Clé déterministe façon `pa-reconciliation-poller` (`ON CONFLICT DO NOTHING`). Si une même entité est « réparée » à 2 ticks consécutifs → flag anomalie persistante → revue (le fix ne tient pas = symptôme, pas guéri). |
| **File de revue manuelle** | cas `ambigu` (diagnose) ⇒ **pas d'auto-fix** : healing event `action:"healing.<m>.revue-requise"` + (option) ligne dans une vue `healing_review` filtrable par l'admin. Notre « DLQ applicative ». |
| **Verify obligatoire** | après `heal()`, re-`detect()` l'entité ; si encore en violation → escalade humaine, pas de silence. |
| **Idempotence de tick** | déjà fournie par `scheduler_job_runs` (`tryClaimRun`). |

### 3.4 Observabilité

Tout est déjà queryable depuis `events` (`WHERE action LIKE 'healing.%'`) : nb anomalies détectées / réparées / en revue, par module, par jour. Métriques dérivables sans nouvelle table. Alerte ntfy (infra `scripts/agents/ntfy-pub.sh` / log structuré façon `event_outbox_drain_done`) sur : seuil dépassé, échec de verify, anomalie persistante.

### 3.5 Read-repair en complément (optionnel, lot ultérieur)

Pour les invariants chauds (C3 events), réparer **aussi au moment de la lecture** de l'entité (cheap, ciblé) en plus du cron de fond — pattern Cassandra read-repair. À n'ajouter que si le cron seul laisse une latence de réparation gênante. **YAGNI par défaut.**

---

## 4. Lots d'implémentation (proposés, non engagés)

> Chaque lot = 1 issue enfant + 1 session worktree, **après validation humaine de CE document**.
> Un reconciler **touchant la compta (C1) est NON-TRIVIAL/légal** → il repassera lui-même par le gate
> `Awaiting Human Validation` avant merge.

- **Lot 0 — Helper minimal** : `runReconciler(detect, heal, verify, { dryRun, seuil })` + convention healing event (`action: healing.*`). Branché sur `JobRegistry`. Test L2 atomicité (heal + healing event = même tx). *Pas d'abstraction générique.*
- **Lot 1 — C3/C4 events** (pilote, full-auto, faible risque) : reconciler outbox bloqué + read-repair events manquants. Valide le framework de bout en bout.
- **Lot 2 — C2 `emails_log`** (full-auto).
- **Lot 3 — C5 stock** (1er semi-auto + seuil + revue).
- **Lot 4 — C1 compta** (semi-auto strict, dry-run prolongé, **re-validation humaine**). Possible file de revue `healing_review` ici si la volumétrie d'ambigus le justifie.
- **Lots suivants** : C6, C8 selon retour terrain. C7 : étendre `billing-scheduler` existant, ne pas dupliquer.

---

## 5. Risques & alternatives

- **Healing vs correction à la source — les DEUX, pas l'un OU l'autre.** Le reconciler est un **filet** (level-triggered : se rattrape même si un event est perdu), mais une dérive **massive/récurrente** signale un **bug à corriger à la source** (un chemin de mutation qui n'utilise pas `withOutbox`). Le seuil/circuit-breaker (§3.3) **force** ce constat au lieu de masquer le bug en réparant en boucle. Règle : healing event récurrent sur le même invariant ⇒ ouvrir une issue de correction *source*.
- **Faux positifs.** Un `detect()` trop large « répare » du légitime. Mitigation : **dry-run d'abord** (observer les healing events `dryRun:true` avant d'armer), invariants formulés strictement, seuil bas au départ.
- **Réparations destructives.** Interdire les `heal()` qui **suppriment/écrasent** des données métier. Forward-fix (compléter le manquant) uniquement ; toute compensation/annulation (saga) ⇒ **semi-auto + revue obligatoire**, jamais full-auto.
- **Réparer pendant qu'un process légitime est en cours** (course). Mitigation : ne réparer que des entités **stables** (ex. `updatedAt < now - 5min`), advisory lock comme `pa-reconciliation-poller`.
- **Coût de scan.** Ne pas full-scan à chaque tick : fenêtrer par `updatedAt`/curseur (esprit Merkle § 1.2). Cadence adaptée par invariant (events : heures ; compta : quotidien).
- **Sur-ingénierie.** Le risque principal de ce genre de projet. Mitigation : §3.1/§4 — pas de framework générique avant 2-3 reconcilers réels ; pas de nouvelle table tant que `events` suffit ; réutiliser scheduler + outbox + précédent PA.

---

## 6. Décision attendue de l'humain

1. **Valider le principe** « reconciler = JobDefinition + healing event dans `events`, zéro nouvelle infra ».
2. **Confirmer l'ordre des pilotes** (C3/C4 → C2 → C5 → C1) et le **dry-run par défaut**.
3. Trancher : healing events **dans `events`** (recommandé) **ou** table dédiée `healing_log` (plus lourd, à éviter sauf besoin légal spécifique).
4. Valider que **C1 (compta) repasse par `Awaiting Human Validation`** au moment de son lot.

*Sources : voir liens inline §1. Recherche réalisée le 2026-06-30 (WebSearch).*
