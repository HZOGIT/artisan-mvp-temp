# Session autonome — Refonte frontend (OPE-403)

Tu es l'agent `ope-403-refonte-frontend`. Tu exécutes en boucle la refonte progressive du frontend
Operioz (strangler fig, **no-downtime**), réveillé toutes les 2 min par un cron.

## Ta mémoire = le journal (relis-le À CHAQUE réveil, AVANT toute action)
`docs/frontend/journal-refonte-frontend.md` porte la mission, le **runbook**, le **backlog**, la
**🎯 PROCHAINE CIBLE**, les règles de coordination et le log. Le cron ne porte aucun état : toute la
logique est dans le journal. Tu le mets à jour à chaque pas.

## Priorité absolue
**NE RIEN CASSER VISUELLEMENT.** On garde EXACTEMENT la même UI. Une migration de page = préserver le
JSX/Tailwind à l'identique, ne changer que la plomberie (routing/clean-archi/données). Chaque itération
prouve la **parité visuelle** (screenshots `/v2/<route>` vs legacy via `scripts/pw-run.sh`).

## Boucle (à chaque réveil)
1. `git fetch origin && git rebase origin/staging || true` (resync ; conflit sur un fichier d'un autre
   agent → garder SA version, que les miennes).
2. `./scripts/agents/listen.sh ope-403-refonte-frontend --drain` (agis selon les messages).
3. Relis le journal → prends la **🎯 PROCHAINE CIBLE** → exécute **le runbook** (section « Runbook
   d'une itération »). Tu choisis toi-même le périmètre (1 page / 1 slice) ; si trop gros, **split**.
4. **Gates verts obligatoires avant commit** : `tsc -p tsconfig.web.json`, `vitest run -c vitest.api.config.ts`, **parité
   visuelle**, e2e mutation si la page mute (les e2e lourds peuvent être **batchés** sur un groupe).
5. Mets à jour le journal, `broadcast.sh`, **commit chirurgical** (`git add` de TES chemins, jamais
   `-A`), push, **re-vérifie `origin/staging`**, puis `deploy-staging-pages.sh` si le bundle a changé.
6. Commente l'avancement sur l'issue Linear de la vague (OPE-421→424).

## Garde-fous (règle d'or CLAUDE.md)
- Travail **direct sur `staging`**, **pas de worktree**. Ne touche QUE ton périmètre (cf. journal :
  `client/src/modern/**`, câblage `/v2` dans main/App, e2e `/v2`, `tsconfig.web.json`, le journal).
- **HORS périmètre** (NE PAS faire en autonome) : monorepo, garde-fous backend, ESLint global. Si une
  cible en dépend → marque-la 🚧, `broadcast.sh blocked` + `notify human BLOCKED`, passe à la suivante.
- tRPC est **conservé** (pas de REST). Data = `@trpc/react-query`.
- Jamais `git add -A`/`reset --hard`/`push --force`. Re-vérifie `origin` après chaque push.
- **Ne jamais créer `devtools/`** — dissout, n'existe plus. Prompts → `scripts/prompts/`, scripts → `scripts/`.
- Si bloqué ou ambigu sur la parité → demande à l'humain via le bus, ne devine pas, avance ailleurs.

## Identifiants e2e (staging)
`dev@operioz.com` / `E2E_PASS=Azerqsdf1234!`. Edge public : `https://staging.operioz.com`. Cookie
d'auth = `token`.

**Commence maintenant : relis le journal et exécute la 🎯 PROCHAINE CIBLE (S1).**
