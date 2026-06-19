# OPE-185 — Communication inter-agents (Agentic Factory)

> **Statut** : proposition + PoC fonctionnel (2026-06-12)
> **Scripts** : [`scripts/agents/`](../../scripts/agents/)
> **Contrainte forte** : la communication doit être **sécurisée** — pas de canal
> public en clair.
> **Auteur** : session `ope-185-inter-agent-comm` (Claude Code 2.1.175)

---

## 1. Résumé de la recommandation (TL;DR — 30 s)

On retient un **bus de messages à deux transports interchangeables**, exposé aux
agents par une seule commande (`notify.sh` / `listen.sh`), avec un **schéma de
message JSON unique** :

- **Transport par défaut = bus de fichiers 100 % LOCAL** (`~/.agent-bus`, perms
  `700`). Rien ne sort de la machine → **le plus sûr** pour l'usine mono-serveur :
  aucune surface réseau, confidentialité assurée par les permissions Unix.
  Réveil de l'agent destinataire en lui « tapant » une invite dans sa session
  `screen` via `screen -X stuff` (**texte puis `\r` séparé** — le TUI Claude
  valide sur Entrée=CR, pas sur LF ; c'est LE piège, voir §4.3).
- **Transport optionnel = ntfy SELF-HOSTÉ + authentifié + chiffré de bout en
  bout** (pour le multi-machine) : topic secret par agent, token d'accès
  obligatoire, et **payload chiffré AES-256** côté client → même le broker ne
  voit que du chiffré. **Le ntfy public en clair est explicitement refusé** par
  les scripts. Backfill garanti (rejeu `since=<id>`) → zéro perte.

Le tout journalise chaque message (audit append-only) et ne dépend que de
`coreutils`, `python3`, `screen`, `openssl`, `curl` — **déjà présents**.

> **À évaluer en parallèle** : Claude Code a désormais une fonctionnalité
> **native « Agent Teams »** (mailbox + `SendMessage`, task list partagée). Elle
> est idéale pour du parallélisme **éphémère coordonné par un lead**, mais ne
> correspond **pas** au modèle de l'usine (screens **persistants, indépendants,
> propriétaires d'un domaine, en pair-à-pair**). Détails en §2.1.

---

## 2. Exploration des mécanismes

### 2.1 CLI Claude natif

| Capacité | Verdict |
|---|---|
| **Agent Teams** (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, ≥ v2.1.32 — on a 2.1.175) | **Système natif** : un *lead* spawn des *teammates* (sessions Claude indépendantes), une **Mailbox** + outil `SendMessage` permet aux agents de se parler par nom, **task list partagée** avec dépendances + auto-déblocage + file-locking, livraison **automatique sans polling**, hooks `TeammateIdle`/`TaskCreated`/`TaskCompleted`. State dans `~/.claude/teams/{name}/` et `~/.claude/tasks/{name}/`. **Limites rédhibitoires pour notre usine** : lead **fixe**, **une seule équipe à la fois**, **pas d'équipes imbriquées**, teammates **éphémères spawned par le lead** (pas des screens persistants pré-existants), **pas de reprise de session**, expérimental. On **ne peut pas** « envoyer un message à un screen nommé quelconque depuis un script ». ⇒ **Excellente piste si on bascule vers un modèle lead→teammates éphémère**, mais ❌ pour des pairs persistants auto-organisés. |
| `claude --remote-control` / `remote-control` | Pilote des sessions locales **depuis claude.ai/code ou le mobile** (pont cloud). Pas un IPC local script→session. ❌ pour la délégation locale. |
| `claude agents` (background agents) | Dispatch parent→enfants, pas des pairs. ❌ pour le modèle pair-à-pair. |
| IPC dans `~/.claude/` (sessions, history, settings, sockets) | Aucun mécanisme de messagerie inter-session exploitable hors Agent Teams. ❌ |
| `screen -X stuff` | Le **primitive de réveil** d'un TUI Claude dans un screen (recette `\r`, §4.3). ✅ |

**Conclusion CLI** : pour des **pairs persistants**, pas d'IPC natif ; le seul
levier est `screen -X stuff`. Agent Teams couvre un *autre* modèle (éphémère,
lead-centré) et mérite un POC séparé.

### 2.2 ntfy

- **Non installé** localement ; `ntfy.sh` joignable, Internet OK, `sudo`
  disponible, et **le projet a déjà des tunnels Cloudflare**
  (`terraform/tunnels.tf`, `staging.operioz.com`) → **self-hosting réaliste**.
- **Fiabilité (validée doc)** : messages **cachés 12 h** par défaut
  (configurable) ; le flux `/<topic>/json` renvoie une ligne JSON par message ;
  `since=<id|timestamp|durée|all>` **rejoue** ce qui a été publié pendant une
  coupure → **backfill sans perte** au reconnect ; `poll=1` pour du one-shot.
- **Publier** : `curl -d … <url>/<topic>` (trivial depuis un prompt).
  **S'abonner bloquant** : `curl -sN <url>/<topic>/json` dans un script bash.
- **Sécurité** : ntfy.sh public **n'a pas d'ACL** → le « secret » serait le seul
  nom du topic, et **les données transitent en clair chez un tiers** (cache 12 h
  sur leur disque). **Inacceptable** vu la contrainte. Mitigations retenues
  (§5) : **self-host + token d'auth + chiffrement E2E du payload**.

### 2.3 Autres mécanismes

| Mécanisme | Dispo | Verdict |
|---|---|---|
| **Fichiers + watch** (`inotifywait` absent → polling 1 s) | ✅ | **retenu** (cœur durable du bus). Atomique (`mv`), traçable, **local = sûr**. |
| `screen -X stuff` | ✅ | **retenu** (réveil du TUI). |
| **openssl / gpg** | ✅ | **retenu** pour le chiffrement E2E du transport ntfy. |
| Redis pub/sub | ❌ absent | service à installer, pub/sub **non persistant** (perte si abonné down). ❌ |
| FIFO / socket (`mkfifo`,`socat`,`nc`) | ✅ | pas de persistance ni d'historique, fragile au redémarrage. ❌ |
| `claude --remote-control` | ✅ | cloud, pas un IPC local. ❌ |

---

## 3. Évaluation comparative

✅ fort / 🟡 moyen / ❌ faible — **colonne Sécurité = critère décisif ici**.

| Mécanisme | Sécurité (contrainte) | Intég. prompt | Fiabilité / persist. | Latence | Traçabilité | Sans dépendance lourde |
|---|---|---|---|---|---|---|
| **Fichiers + screen-stuff (DÉFAUT)** | ✅ **local, 0 réseau, perms 700** | ✅ `notify.sh`/`listen.sh` | ✅ fichier durable, atomique | ✅ réveil immédiat | ✅ 1 fichier/msg + log | ✅ coreutils+py3+screen |
| **ntfy self-host + token + E2E (option multi-machine)** | ✅ **chiffré E2E, authentifié, self-host** | ✅ `curl`/bridge | ✅ backfill `since=id` | ✅ | ✅ log local + broker | 🟡 service à gérer (tunnel déjà là) |
| ntfy public (topic-secret) | ❌ **tiers, clair, pas d'ACL** | ✅ | 🟡 | ✅ | 🟡 | 🟡 |
| Agent Teams (natif) | 🟡 local mais éphémère | ✅ natif | 🟡 expérimental, pas de resume | ✅ | 🟡 | ✅ |
| Redis pub/sub | 🟡 | 🟡 | ❌ non persistant | ✅ | ❌ | ❌ service |
| FIFO / socket | 🟡 local | 🟡 | ❌ | ✅ | ❌ | ✅ |
| `--remote-control` | ❌ cloud | ❌ | 🟡 | 🟡 | 🟡 | ✅ |

**Gagnant pour notre usine : bus de fichiers local** (défaut, le plus sûr), avec
**ntfy self-hosté chiffré E2E** en option multi-machine. Même schéma de message,
mêmes commandes côté agent.

---

## 4. Architecture retenue

### 4.1 Vue d'ensemble

```
 Agent A (screen "feature-dev")                 Agent B (screen "unit-tests")
 ┌───────────────────────────┐                  ┌───────────────────────────┐
 │ claude TUI                 │                  │ claude TUI                 │
 │  $ notify.sh unit-tests \  │                  │  (réveillé)                │
 │      TASK_DONE "..."       │                  │  $ listen.sh unit-tests \  │
 └─────────────┬─────────────┘                  │        --drain  ───────────┤
   transport=file │ 1. écrit JSON (mv atomique)              ▲              │
                  ▼                                          │ 3. lit+archive│
   ~/.agent-bus/inbox/unit-tests/<seq>-<from>-<type>.json ───┘              │
   (perms 700)    │ 2. screen -X stuff  (texte + \r séparé)                 │
                  └──────────────────────────────────────────►(nouveau tour)│
   ~/.agent-bus/bus.log  ← journal append-only (audit, 600)  └─────────────┘

 transport=ntfy (multi-machine) : notify chiffre+publie -> ntfy self-host (token)
   -> ntfy-inbox-bridge.sh (par agent) déchiffre + réveille le screen (texte+\r)
```

### 4.2 Transport par défaut — boîte aux lettres par fichiers (local, sûr)

```
~/.agent-bus/                        (= $AGENT_BUS_DIR, chmod 700, hors git)
├── inbox/<agent>/<seq>-<from>-<type>.json   # messages en attente
├── processed/<agent>/<...>.json             # archivés après lecture
└── bus.log                                  # 1 ligne JSON/msg (chmod 600)
```

- **Écriture atomique** : rendu dans `.tmp.XXXX` puis `mv` → jamais de message
  partiel.
- **Ordonnancement** : préfixe `seq` = nanosecondes (`date +%s%N`).
- **Durabilité** : si la cible est éteinte, le message **reste** ; lu au
  prochain `listen.sh`. `agents-status.sh` signale les inbox orphelines.
- **Sécurité** : tout reste sur la machine ; accès limité au propriétaire par
  les permissions Unix. **Aucune donnée ne quitte le serveur.**

### 4.3 Réveil — `screen -X stuff` (recette en deux temps) ⚠️

> **Le point crucial, validé empiriquement (et confirmé par un pont ntfy→Claude
> existant d'un autre projet, ainsi que par la communauté tmux `send-keys -l`).**
> Dans le TUI Claude Code (raw-mode), la zone de saisie est **multi-ligne** : un
> `\n` injecté **insère un retour à la ligne** et **ne soumet rien**. La
> soumission se fait avec **Entrée = `\r`**, envoyé **séparément** après un court
> délai.

```bash
screen -S "<agent>" -X stuff "<texte de l'invite>"   # 1. tape le texte
sleep 1                                                # 2. laisse le TUI rendre
screen -S "<agent>" -X stuff $'\r'                     # 3. Entrée -> soumet
```

Un envoi en un seul coup `"<texte>\r"` s'est révélé **non fiable** (le `\r` est
avalé avec le collage). **Toujours** séparer texte et `\r`. `notify.sh` et le
bridge appliquent cette recette (délai réglable : `AGENT_BUS_WAKE_DELAY`).

### 4.4 Format de message (JSON, identique quel que soit le transport)

```json
{
  "id":        "1781268259281858105-feature-dev-TASK_DONE",
  "from":      "feature-dev",
  "to":        "unit-tests",
  "type":      "TASK_DONE",
  "payload":   "feature 'auth' mergée sur feat/auth",
  "timestamp": "2026-06-12T12:44:19Z"
}
```

- `from` **auto-détecté** : `$AGENT_NAME`, sinon nom de session screen
  (`$STY`), sinon `user@host`.
- `payload` encodé via `python3 json` → guillemets / sauts de ligne / unicode
  sûrs (pas besoin de `jq`, absent de la machine).

### 4.5 Types de messages standardisés

| Type | Sens | Réaction attendue |
|---|---|---|
| `TASK_DELEGATE` | « prends cette tâche » | démarrer le travail décrit dans `payload` |
| `TASK_DONE` | « j'ai fini ma partie » | enchaîner l'étape suivante |
| `REQUEST_REVIEW` | « relis / valide » | lancer une revue / des tests |
| `BLOCKED` | « je suis bloqué » | débloquer ou remonter à l'humain |
| `ALERT` | incident / urgence | traiter + **push humain** (si ntfy configuré) |
| `ACK` | accusé de réception (optionnel) | trace de prise en compte |

Destinataire réservé **`human`** : pas de screen ; journalisé et poussé en
notification (ntfy self-host) si configuré.

### 4.6 Convention de nommage

- **1 agent = 1 nom kebab-case = 1 screen = 1 inbox = 1 topic ntfy
  `<prefix>-<agent>`.** Le nom passé à `launch-claude-bg.sh <nom>` est le même
  partout. Fichier message : `<seq_ns>-<from>-<type>.json`.

---

## 5. Sécurité

La contrainte « pas de canal public en clair » est traitée comme **exigence de
premier plan**, par défense en profondeur :

1. **Défaut local = pas de réseau.** Le transport `file` ne sort jamais de la
   machine. `~/.agent-bus` est forcé en **`chmod 700`**, le log en `600`. Surface
   d'attaque réseau = **nulle**. C'est le mode recommandé pour l'usine actuelle
   (un seul serveur).
2. **Transport ntfy = jamais public, jamais en clair.** `notify.sh` et le bridge
   **refusent** (`ntfy_secure_preflight`) :
   - une URL non-`https` ou pointant vers `ntfy.sh` public → **erreur** ;
   - l'absence de **token d'auth** (`AGENT_BUS_NTFY_TOKEN`, Bearer) → **erreur**
     (le broker self-hosté doit être en `auth-default-access: deny-all`) ;
   - l'absence de clé **`AGENT_BUS_SECRET`** → **erreur**.
3. **Chiffrement de bout en bout.** Le payload est chiffré **côté client** en
   **AES-256-CBC + PBKDF2 (200k itérations) + sel aléatoire** (`openssl`) avant
   publication. Le broker — même self-hosté — **ne voit que du base64
   chiffré**. La sécurité ne dépend donc **pas** du nom du topic ni de la
   confiance dans le broker.
4. **Self-hosting via l'infra existante.** Le projet expose déjà des tunnels
   Cloudflare ; un ntfy self-hosté derrière le tunnel (TLS + token + ACL)
   ferme la boucle réseau sans nouveau service exposé publiquement.

> Override de test uniquement : `AGENT_BUS_NTFY_INSECURE=1` (clair, déconseillé,
> jamais en prod).

---

## 6. Scripts helpers

Tous dans [`scripts/agents/`](../../scripts/agents/) :

| Script | Rôle |
|---|---|
| [`notify.sh`](../../scripts/agents/notify.sh) | `notify.sh [--no-wake] <to> <type> <payload…>` — dépose le message (inbox+log durables), puis **réveille** : transport `file` → `screen -X stuff` (recette `\r`) ; transport `ntfy` → publie **chiffré+authentifié**. Push humain sur `human`/`ALERT`. |
| [`listen.sh`](../../scripts/agents/listen.sh) | `listen.sh <agent> [--drain\|--once\|--follow\|--peek]` — lit la boîte. `--drain` (défaut) : vide+archive et sort ; `--once` : bloque jusqu'à 1 msg ; `--follow` : boucle bloquante ; `--peek` : lecture seule. |
| [`ntfy-inbox-bridge.sh`](../../scripts/agents/ntfy-inbox-bridge.sh) | Pont **sécurisé** ntfy→screen (1 par agent) : abonnement authentifié, **backfill `since=<id>` + dédup** (zéro perte), **déchiffrement E2E**, puis réveil du TUI (texte+`\r`). |
| [`agents-status.sh`](../../scripts/agents/agents-status.sh) | Liste les screens actifs (nom, pid, état, démarrage) + messages en attente par inbox + inbox orphelines. |
| [`_bus_common.sh`](../../scripts/agents/_bus_common.sh) | Helpers partagés : chemins, perms `700/600`, identité, JSON, **`bus_encrypt`/`bus_decrypt`** (AES-256). Sourcé. |
| [`poc-demo.sh`](../../scripts/agents/poc-demo.sh) | PoC auto-contenu : 3 mini-agents relaient un message. |

**Variables d'environnement**

| Variable | Rôle | Défaut |
|---|---|---|
| `AGENT_NAME` | nom de l'agent émetteur | auto (`$STY`) |
| `AGENT_BUS_DIR` | racine du bus | `~/.agent-bus` |
| `AGENT_BUS_TRANSPORT` | `file` (local) \| `ntfy` (multi-machine) | `file` |
| `AGENT_BUS_WAKE_DELAY` | délai texte→Entrée (s) | `1` |
| `AGENT_BUS_POLL_SECS` | polling `listen --follow/--once` | `1` |
| `AGENT_BUS_SECRET` | clé pré-partagée (chiffrement E2E) | — (requis ntfy) |
| `AGENT_BUS_NTFY_URL` | ntfy **self-hosté https** (public refusé) | — (requis ntfy) |
| `AGENT_BUS_NTFY_TOKEN` | token Bearer | — (requis ntfy) |
| `AGENT_BUS_NTFY_PREFIX` | préfixe topic (`<prefix>-<agent>`) | — (requis ntfy) |
| `AGENT_BUS_NTFY_HUMAN_TOPIC` | topic push humain/ALERT | — |

---

## 7. Section à coller dans `CLAUDE.md`

Le bloc prêt à copier est dans [`CLAUDE.md`](../../CLAUDE.md), section
**« Communication inter-agents »**. Reproduit ici pour référence :

```markdown
## Communication inter-agents

Tu peux faire partie d'une « Agentic Factory » : plusieurs sessions Claude Code
tournent en parallèle dans des `screen` nommés et se délèguent des tâches via un
bus de messages **sécurisé** (`~/.agent-bus/`, local par défaut). Ton nom
d'agent = le nom de ta session screen (auto-détecté).

### Envoyer un message
    ./scripts/agents/notify.sh <destinataire> <TYPE> "<message>"
Ex. : ./scripts/agents/notify.sh unit-tests TASK_DELEGATE "Module auth fini sur feat/auth, écris les tests unitaires."
Le destinataire `human` notifie l'humain.

### Recevoir un message
Quand on te réveille avec « 📨 [agent-bus] Nouveau message… », lis ta boîte :
    ./scripts/agents/listen.sh <ton-nom> --drain
Chaque message est une ligne JSON {from,to,type,payload,timestamp}. Agis selon
le TYPE, puis, si une étape suivante existe, renotifie l'agent concerné.

### Types
TASK_DELEGATE (prends cette tâche) · TASK_DONE (j'ai fini, enchaîne) ·
REQUEST_REVIEW (relis/valide) · BLOCKED (je suis bloqué) · ALERT (incident) ·
ACK (accusé de réception, optionnel).

### Superviser
    ./scripts/agents/agents-status.sh   # agents actifs + messages en attente

### Sécurité
Par défaut tout reste LOCAL (aucun réseau ; ~/.agent-bus en chmod 700). Le mode
multi-machine (ntfy) est chiffré de bout en bout et authentifié — n'utilise
jamais un ntfy public en clair.

### Exemple de délégation (chaîne type)
1. feature-dev finit de coder :
   ./scripts/agents/notify.sh unit-tests TASK_DONE "feature X mergée sur feat/x"
2. unit-tests (réveillé) écrit les tests, puis :
   ./scripts/agents/notify.sh qa-browser REQUEST_REVIEW "tests prêts pour feature X"
3. qa-browser fait le QA navigateur, puis prévient l'humain :
   ./scripts/agents/notify.sh human TASK_DONE "QA OK sur feature X, prêt à merger"
```

---

## 8. PoC — instructions de reproduction

### 8.1 PoC automatisé (3 agents, transport file, ~10 s)

```bash
./scripts/agents/poc-demo.sh
```

Lance 3 mini-agents `screen`, déclenche
`poc-feature-dev → poc-unit-tests → poc-reviewer`, affiche la trace. Attendu :

```
[poc-unit-tests] received TASK_DONE from poc-feature-dev: ...
[poc-reviewer]   received REQUEST_REVIEW from poc-unit-tests: ...
[poc-reviewer]   ✅ review complete — chain finished.
PoC OK ✅  — message delivered across 3 agents.
```

### 8.2 Réveil d'un vrai TUI Claude (transport file)

```bash
./scripts/launch-claude-bg.sh demo-agent claude-haiku-4-5-20251001
sleep 12
./scripts/agents/notify.sh demo-agent TASK_DELEGATE \
  "Crée le fichier /tmp/preuve.txt contenant OK, directement."
sleep 20
cat /tmp/preuve.txt           # -> OK   (réveil + action validés)
screen -S demo-agent -X quit
```

> Vérifié pendant OPE-185 : sans la recette `\r` séparée, le message
> **n'est pas soumis** (il reste dans la box) — d'où l'importance du §4.3.

### 8.3 Transport ntfy chiffré (multi-machine)

```bash
export AGENT_BUS_TRANSPORT=ntfy
export AGENT_BUS_NTFY_URL=https://ntfy.interne.operioz.com   # self-hosté
export AGENT_BUS_NTFY_TOKEN=tk_xxx
export AGENT_BUS_SECRET="clé-pré-partagée-longue"
export AGENT_BUS_NTFY_PREFIX=agentic-factory
# un bridge par agent récepteur :
screen -dmS bridge-unit-tests ./scripts/agents/ntfy-inbox-bridge.sh unit-tests
# émission (chiffrée + authentifiée) :
./scripts/agents/notify.sh unit-tests TASK_DELEGATE "tests à écrire pour feat/x"
```

### 8.4 Test minimal du transport local (sans réveil) + sécurité

```bash
AGENT_NAME=alice ./scripts/agents/notify.sh --no-wake bob TASK_DELEGATE "ping"
./scripts/agents/listen.sh bob --drain        # affiche le JSON puis archive
# refus attendu d'un ntfy public :
AGENT_BUS_TRANSPORT=ntfy AGENT_BUS_NTFY_URL=https://ntfy.sh \
AGENT_BUS_NTFY_PREFIX=x AGENT_BUS_NTFY_TOKEN=tk AGENT_BUS_SECRET=k \
  ./scripts/agents/notify.sh bob ALERT "x"    # -> ERROR: refusing public ntfy.sh
```

---

## 9. Limites connues & évolutions

- **Réveil d'un agent occupé** : le texte stuffé s'ajoute à sa file de saisie et
  sera soumis à la fin du tour courant (pas de préemption). OK en v1.
- **Pas d'accusé garanti** : la livraison est sûre, la *prise en compte* dépend
  de l'agent. Utiliser `ACK` si un handshake est requis.
- **Polling 1 s** (pas d'`inotifywait`). Suffisant ; installable plus tard.
- **Agent Teams natif** : à prototyper séparément pour les tâches éphémères
  coordonnées par un lead (mailbox + task list natives).
- **Évolutions** : priorités/TTL par message, rotation de `AGENT_BUS_SECRET`,
  dossier `failed/`, déploiement du ntfy self-hosté derrière le tunnel Cloudflare.

---

## Sources

- Claude Code — Orchestrate teams of Claude Code sessions : https://code.claude.com/docs/en/agent-teams
- ntfy — Subscribe / API (`since`, `poll`, `/json`, cache) : https://docs.ntfy.sh/subscribe/api/
- ntfy — Config (rétention du cache, ACL/auth) : https://docs.ntfy.sh/config/
