# Scénarios Gherkin — conventions

Dataset de scénarios **cross-module** décrivant le parcours de découverte d'un
artisan sur Operioz. Source de vérité versionnée ici, synchronisée vers une DB
Notion semi-éditable pour l'organisation / la collaboration testing.

On vise le **standard Gherkin réel** (Cucumber), dialecte **français** (`fr`).
Aucune syntaxe maison.

## Références (standards)

- Gherkin — référence syntaxe & sémantique des mots-clés : <https://cucumber.io/docs/gherkin/reference/>
- Gherkin — langues / dialecte français (`# language: fr`) : <https://cucumber.io/docs/gherkin/languages/>
- Mots-clés FR officiels (source i18n) : <https://github.com/cucumber/gherkin/blob/main/gherkin-languages.json>
- BDD & « writing good Gherkin » : <https://cucumber.io/docs/bdd/> · <https://automationpanda.com/2017/01/30/bdd-101-writing-good-gherkin/>

## Structure d'un fichier `.feature`

```gherkin
# language: fr
@bloc:commercial @module:clients @module:devis @critique @paiement
Fonctionnalité: Du devis signé à la facture

  Courte description libre du parcours (facultatif, non exécutable).

  @nominal
  Scénario: L'artisan convertit un devis signé en facture
    Étant donné qu'un devis au statut "Signé" comporte une ligne "Chaudière" à 2 500 € HT
    Quand l'artisan convertit ce devis en facture
    Alors une facture est créée avec les mêmes lignes et le même total TTC
```

- **`# language: fr`** en 1re ligne → mots-clés français (obligatoire).
- **`Fonctionnalité:`** (Feature) + description libre facultative.
- **`Scénario:`** (Scenario). Regrouper plusieurs scénarios liés dans une même fonctionnalité.
- **Indentation 2 espaces**, commentaires `#` en début de ligne uniquement.

## Given / When / Then (mots-clés FR)

| Rôle | Anglais | Français | Règle |
|---|---|---|---|
| Contexte / préconditions | `Given` | `Étant donné (que/qu')` | État **passé**, met le système dans un état connu. **Pas** d'interaction utilisateur ici. |
| Événement / action | `When` | `Quand` / `Lorsque` | **Un seul `Quand` par scénario** — une action, un événement. |
| Résultat attendu | `Then` | `Alors` | Sortie **observable** (UI, message, statut) — pas un état interne de la BDD. |
| Enchaînement | `And` / `But` | `Et` / `Mais` | Pour un 2e step consécutif du même type. |

Découper les parcours multi-actions en **plusieurs scénarios** (un `Quand`
chacun) plutôt qu'un long scénario `Quand…Alors…Quand…Alors`.

## Personas (jamais de nom propre)

`l'artisan` (propriétaire), `le technicien` (terrain), `le client`,
`le prospect`. Rédiger sans dépendre de la technologie ou de l'UI.

## Tags (atomiques — jamais de liste dans un tag)

| Tag | Sens | Où |
|---|---|---|
| `@bloc:<bloc>` | bloc produit : `onboarding`, `commercial`, `clients`, `terrain`, `gestion` | niveau fonctionnalité |
| `@module:<slug>` | **un tag par module** traversé (`@module:devis @module:signature`) | niveau fonctionnalité |
| `@nominal` `@edge` `@erreur` `@securite` | nature du scénario | niveau scénario |
| `@critique` `@public` `@paiement` … | étiquettes sémantiques libres | fonctionnalité ou scénario |

> ❌ `@modules:devis,signature` (liste séparée par virgule) = **non standard**.
> ✅ `@module:devis @module:signature` (tags atomiques).

## Arborescence

```
gherkin/<module-d-ancrage>/<nom>.feature
```

Un scénario cross-module vit dans le dossier de son **module d'ancrage** (bloc
principal) ; les modules réellement traversés sont listés en tags `@module:`.

## Synchronisation Notion

```bash
task notion:gherkin:sync            # push vers Notion (upsert par slug)
task notion:gherkin:sync DRY=1      # dry-run (contrôle du parsing, sans écriture)
```

Le script (`scripts/notion/notion-gherkin-sync.ts`) :

- **upsert idempotent par `Slug`** (= `<chemin>#<titre-kebab>`) — rejouable,
  écritures Notion **parallélisées** (`pMap`, concurrence 5) ;
- écrit uniquement les **colonnes machine** (Bloc, Module, Modules, Nature,
  Tags, Gherkin, Fichier source…) ;
- ne touche **jamais** les **colonnes humaines** (Statut, Priorité, Owner,
  Test lié, Automatisé) → DB **semi-éditable** ;
- marque les scénarios disparus du repo (`Présent dans le repo = false`) au lieu
  de les supprimer.
