# Ponytail — YAGNI / Lazy Senior Dev Mode

Plugin Claude Code installé globalement (`~/.claude/`) sur ce serveur.
Source : [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) v4.8.3

## Ce que ça fait

Ponytail injecte automatiquement une règle YAGNI via 3 hooks :

- **`SessionStart`** — injecte les règles YAGNI au démarrage de chaque session agent.
- **`SubagentStart`** — propage les règles à chaque sous-agent (Task-spawned), car le contexte SessionStart ne leur est pas transmis nativement.
- **`UserPromptSubmit`** — détecte les commandes `/ponytail` et `stop ponytail` pour changer de mode en cours de session. Léger : ne produit de sortie que si le prompt contient une commande ponytail, sinon exit silencieux.

Mode actif par défaut : `full`.

## L'échelle de décision (the ladder)

Avant d'écrire du code, s'arrêter au premier échelon qui tient :

1. **Est-ce que ça doit exister ?** (YAGNI) — si spéculatif, skip + une ligne d'explication.
2. **Déjà dans la codebase ?** Réutiliser le helper / util / pattern existant.
3. **La stdlib le fait ?** L'utiliser.
4. **Feature native de la plateforme ?** (`<input type="date">` > picker lib, CSS > JS, contrainte DB > code applicatif)
5. **Dépendance déjà installée ?** L'utiliser. Ne jamais ajouter une dépendance pour ce que quelques lignes font.
6. **Une ligne suffit ?** Une ligne.
7. **Seulement alors :** le minimum qui fonctionne.

L'échelle s'applique APRÈS avoir compris le problème, pas à la place — lire le code touché, tracer le flux réel, puis grimper.

## Règles clés

- Pas d'abstraction non demandée (pas d'interface avec une seule implémentation, pas de factory pour un seul produit).
- Pas de boilerplate « pour plus tard » — plus tard peut scaffolder lui-même.
- Suppression > ajout. Ennuyeux > malin.
- Fix de bug = cause racine, pas symptôme : grep tous les appelants et corriger la fonction partagée une fois.
- Simplifications intentionnelles : `/* ponytail: raison — upgrade quand X */`.

## Quand NE PAS être lazy

Validation des entrées aux frontières de confiance, gestion d'erreurs (perte de données), sécurité, accessibilité, tout ce qui est explicitement demandé.

## Commandes disponibles (sessions interactives)

```
/ponytail          — résumé du mode actif
/ponytail lite     — mode léger
/ponytail full     — mode complet (défaut)
/ponytail ultra    — mode ultra-strict
/ponytail-review   — review du code actuel avec l'œil YAGNI
stop ponytail      — désactiver pour la session
```

## Installation (fait une fois, sur ce serveur)

```bash
# Plugin cloné dans :
~/.claude/plugins/cache/DietrichGebert/ponytail/4.8.3/

# Enregistré dans :
~/.claude/plugins/installed_plugins.json
~/.claude/plugins/known_marketplaces.json

# Hooks configurés dans :
~/.claude/settings.json  (SessionStart, SubagentStart, UserPromptSubmit)
```

Pour mettre à jour vers une nouvelle version :
```bash
rm -rf ~/.claude/plugins/cache/DietrichGebert/ponytail/4.8.3/
git clone --depth=1 https://github.com/DietrichGebert/ponytail.git \
  ~/.claude/plugins/cache/DietrichGebert/ponytail/<nouvelle-version>/
# Puis mettre à jour le chemin dans ~/.claude/settings.json
```
