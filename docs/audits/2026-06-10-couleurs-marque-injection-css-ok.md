# Audit — Couleurs de marque/catégorie : injection CSS — OK

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : `couleurPrincipale`/`couleurSecondaire` (artisan), `couleur` (catégories
> dépenses, techniciens, badges) ; rendu client (`Parametres`, `Vitrine`, `Badges`,
> `Techniciens`, `Depenses`…) ; validation serveur (`parametres.update`).

---

## Conclusion : pas d'injection CSS. Pas de BLOCKER/HIGH.

Enjeu : une couleur **contrôlée par l'utilisateur** (`couleurPrincipale`, `couleur` de
catégorie/technicien) injectée dans du CSS sans garde-fou (`red; background:url(...)`)
pourrait casser le style ou (anciennement) exécuter du `expression()`/`url(javascript:)`.

### Rendu via `style={{ ... }}` React (CSSOM-confiné)

Toutes les occurrences rendent la couleur via des **objets de style inline React** :

```tsx
style={{ backgroundColor: tech.couleur || "#3B82F6" }}   // Techniciens, Geoloc, Planif…
style={{ backgroundColor: `${badge.couleur}20`, color: badge.couleur }}  // Badges
```

→ React applique `element.style.backgroundColor = value` via le **setter CSSOM**, qui
**confine** la valeur à **cette propriété** : une valeur invalide (`red; x:y`,
`url(javascript:…)`) est **rejetée/ignorée** par le navigateur, **impossible** d'injecter
une propriété supplémentaire ou de « breakout ». Pas de sink d'injection CSS.

### Aucun sink dangereux

`grep '<style>'|cssText|setProperty|dangerouslySetInnerHTML` **avec une couleur** = **0** :
les couleurs ne sont **jamais** concaténées dans un bloc `<style>` brut ni posées via
`cssText`/`setProperty(string)`. Uniquement des objets `style={{}}`.

---

## Réserve LOW

- Côté serveur, `couleurPrincipale/Secondaire: z.string().optional()` (`routers.ts:3018`)
  **sans regex hex** → une chaîne arbitraire peut être stockée. **Inoffensif** ici (rendu
  CSSOM-confiné → ignoré si invalide), mais une validation `.regex(/^#[0-9a-fA-F]{6}$/)`
  serait un durcissement propre (et éviterait des couleurs « cassées » à l'affichage).

---

## Verdict

Les couleurs (marque/catégorie/technicien) sont rendues via des **objets `style={{}}`
React** (setter CSSOM, valeur **confinée** à la propriété) et **jamais** dans un `<style>`
brut → **pas d'injection CSS**, même sans validation de format serveur. Réserve = regex hex
(durcissement LOW). **Pas de nouvelle issue Linear.**
