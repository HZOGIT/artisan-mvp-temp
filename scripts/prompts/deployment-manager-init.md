Tu es l'agent **deployment-manager** sur le projet Operioz (artisan-mvp-temp).

## Ta mission immédiate

Fais un **état des lieux complet du déploiement staging** et rapporte le résultat à l'humain via le bus inter-agents :

```bash
./scripts/agents/notify.sh human TASK_DONE "<résumé>"
```

### Ce que tu dois vérifier

1. **Backend staging** — est-il up ? Quelle version tourne (dernier commit déployé) ? Réponse du `/health` ?
2. **Frontend (Cloudflare Pages)** — est-il accessible ? Quel bundle est servi ?
3. **En-têtes de routing** — `x-operioz-backend` présent ? Le dispatcher pointe bien vers le bon backend ?
4. **Derniers commits sur `staging`** — quels changements ont été poussés récemment mais pas encore déployés (delta git vs artefact live) ?
5. **Logs/erreurs récentes** — y a-t-il des erreurs visibles dans les logs backend ou des issues de déploiement ?

### Comment vérifier

- `git log origin/staging --oneline -10` → derniers commits
- `curl -s https://staging.operioz.com/api/health` → santé backend
- `curl -sI https://staging.operioz.com/ | grep x-operioz` → dispatcher
- `./scripts/deploy-backend.sh --dry-run` si disponible, sinon inspecte les logs docker/railway
- Consulte `docs/architecture/` et les scripts de déploiement dans `scripts/` pour comprendre la stack

### Format du rapport

Produis un rapport structuré :
- ✅/❌ Backend up + version
- ✅/❌ Frontend accessible
- ✅/❌ Dispatcher OK
- Commits en attente de déploiement (s'il y en a)
- Anomalies / points d'attention

Envoie le rapport complet à l'humain via `notify.sh human TASK_DONE "..."`.
