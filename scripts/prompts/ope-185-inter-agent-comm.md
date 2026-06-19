Tu es un architecte senior spécialisé en systèmes multi-agents et outillage CLI. Ta mission est d'explorer les mécanismes de communication disponibles entre sessions Claude Code, de choisir le meilleur, et de produire une proposition concrète et actionnable.

**Issue Linear** : OPE-185 — Communication inter-agents : exploration, choix et implémentation du protocole
**Projet** : Agentic Factory

## Contexte

On construit une "Agentic Factory" : plusieurs sessions Claude Code tournent en parallèle (dans des screen sessions), chacune propriétaire d'un domaine. On veut qu'elles puissent se déléguer des tâches.

**Exemple type :**
1. Agent `feature-dev` finit de coder → notifie `unit-tests`
2. `unit-tests` implémente les tests → notifie `qa-browser`
3. `qa-browser` prend le contrôle d'un navigateur, fait les tests → notifie l'humain ou `reviewer`

Le projet est dans `/home/developer/artisan-mvp-temp`.

## Étape 1 — Exploration des mécanismes

### Claude CLI natif
Examine les capacités du CLI :
```bash
claude --help
claude remote-control --help
```
- Le `--remote-control` permet-il d'envoyer un message à une session nommée depuis une autre session ou un script ?
- Y a-t-il un mécanisme d'IPC (stdin/stdout, socket, fichier) entre sessions ?
- Cherche dans la doc, dans les binaires, dans les fichiers de config Claude (`~/.claude/`) tout mécanisme de messaging

### ntfy
- Installe ou vérifie si ntfy est disponible (`which ntfy`, `ntfy --help`)
- Teste un publish/subscribe simple en local ou via ntfy.sh
- Évalue : peut-on faire `ntfy subscribe <topic>` en mode bloquant depuis un script bash qu'un agent lance ?
- Peut-on publier depuis un simple `curl` dans un prompt Claude ?
- Self-hosting possible sur ce serveur ?

### Autres mécanismes
- Fichiers de signaux + `inotifywait` : un agent écrit `/tmp/agent-signals/<target>/<message>`, l'autre watch
- Redis pub/sub : redis disponible ? (`which redis-cli`)
- FIFO Unix pipes nommées
- Tout autre mécanisme pertinent découvert

## Étape 2 — Évaluation comparative

Produis un tableau comparatif sur ces critères :
- Simplicité d'intégration dans un prompt Claude (l'agent peut envoyer/recevoir avec une commande bash simple)
- Fiabilité (pas de message perdu, persistance si l'agent est down)
- Latence
- Traçabilité (logs, historique)
- Self-hostable / pas de fuite de données
- Pas de dépendance externe lourde à installer

## Étape 3 — Proposition

Choisis le mécanisme optimal (ou une combinaison) et propose :

### Architecture de communication
- Comment un agent envoie un message à un autre (commande exacte)
- Comment un agent écoute / se réveille sur un message
- Format standardisé des messages : JSON recommandé avec au minimum `{ from, to, type, payload, timestamp }`
- Types de messages standardisés : `TASK_DELEGATE`, `TASK_DONE`, `REQUEST_REVIEW`, `BLOCKED`, `ALERT`
- Convention de nommage des canaux/topics/fichiers

### Scripts helpers
Écris les scripts dans `scripts/agents/` :
- `notify.sh <to> <type> <payload>` — envoyer un message à un agent
- `listen.sh <agent-name>` — écouter les messages entrants (mode bloquant)
- `agents-status.sh` — lister les agents actifs (screen sessions) et leur état

### Section CLAUDE.md
Rédige le texte exact à ajouter dans `CLAUDE.md` dans une section `## Communication inter-agents`, pour que n'importe quel agent lancé sache :
- Comment envoyer un message
- Comment recevoir
- Les types de messages disponibles
- Un exemple concret de délégation

## Étape 4 — Proof of Concept

Implémente un PoC minimal mais fonctionnel :
- Lance 2 mini-agents (via screen ou en local) qui s'échangent un message
- Montre que le message est reçu et que l'agent réagit
- Documente les commandes pour reproduire le PoC

## Livrable

Écris tout dans `docs/architecture/ope-185-inter-agent-communication.md` :
1. Résumé de la recommandation (1 paragraphe, lisible par un humain en 30 secondes)
2. Exploration et comparatif
3. Architecture retenue
4. Scripts helpers (ou pointeurs vers les fichiers créés)
5. Section CLAUDE.md prête à copier-coller
6. Instructions pour le PoC

Ensuite, crée les fichiers helpers dans `scripts/agents/` et poste un commentaire sur l'issue OPE-185 dans Linear avec le résumé de la recommandation et le lien vers le document.
