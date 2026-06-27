# Session — Setup BetterStack en profondeur (monitoring/observability Operioz)

Tu es une session de travail dédiée à **approfondir la mise en place de BetterStack** (monitoring,
logs, heartbeats, alerting) pour Operioz. Repo : `/home/developer/artisan-mvp-temp`. Bus agents :
`./scripts/agents/`. Tu fais partie de l'Agentic Factory (cf. CLAUDE.md) — règle d'or des commits
chirurgicaux sur la branche partagée respectée.

## Étape 1 (À FAIRE EN PREMIER) — Inventaire des issues BetterStack dans Linear

Avant tout code, **liste et synthétise toutes les issues Linear relatives à BetterStack/monitoring**.
Utilise les outils MCP Linear (`list_issues`, `get_issue`, `search`) avec des requêtes variées :
- `betterstack`, `better stack`, `better-stack`
- `monitoring`, `observability`, `observabilité`, `alerting`, `alertes`, `heartbeat`, `uptime`, `logs`
- l'issue connue **OPE-521** (enrichissement logs BetterStack — déjà traitée par une session passée)
  et ses éventuelles issues liées/sœurs/enfants.

Pour chaque issue trouvée, note : identifiant OPE-XXX, titre, statut, projet, et un résumé d'une ligne
de son périmètre. Déduis ce qui est **déjà fait** vs **restant**.

**Rends ce rapport d'inventaire à l'humain** dès qu'il est prêt, AVANT d'implémenter :
`./scripts/agents/ntfy-pub.sh human "<résumé inventaire BetterStack>"` (et détaille dans un commentaire
sur l'issue parent de monitoring si elle existe). Attends idéalement un signal humain avant de coder du
gros, mais tu peux préparer le terrain (lecture de la conf existante).

## Contexte technique à recouper (lecture seule d'abord)

- L'enrichissement des logs BetterStack (OPE-521) a déjà été livré (logs Pino structurés → BetterStack).
  Cherche dans le code : `betterstack`, `logtail`, `BETTERSTACK`, `BETTER_STACK`, le transport Pino,
  les `app.log.fatal`/alertes (ex. `billing_tick_critical` câblé sur `log.fatal` en #57).
- Variables d'env : règles CLAUDE.md — secrets runtime dans le `.env` serveur / Docker, **jamais** dans
  `.env.production` commité.
- Déploiement : `./scripts/deploy-backend.sh` (rebuild conteneur). Frontend = CF Pages auto sur push staging.

## Étape 2 — Approfondir le setup (après l'inventaire + accord)

Selon les findings, propose puis implémente l'approfondissement : sources de logs supplémentaires,
**heartbeats/uptime monitors** (health endpoint `/health` qui vérifie déjà la DB), **politiques d'alerte**
(erreurs critiques, billing tick, webhooks Stripe en échec, crons), dashboards. Toute évolution de code
passe par une PR : `gh pr create --base staging`, puis `notify.sh reviewer PR_READY`.

## Communication

- Inventaire + avancement → `ntfy-pub.sh human` et, si pertinent, commentaire Linear.
- PR prête → `./scripts/agents/notify.sh reviewer PR_READY "<url>"`.
- Bloqué → `./scripts/agents/notify.sh human BLOCKED "<raison>"`.

Commence MAINTENANT par l'Étape 1 (inventaire Linear) et rends le rapport à l'humain.
