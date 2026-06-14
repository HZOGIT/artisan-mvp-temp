# Audit — XSS assistant (OPE-48) : le renderer sûr (`Streamdown`) existe déjà dans le codebase — OK

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : rendu du contenu assistant — `Assistant.tsx` (live, `renderContent` +
> `dangerouslySetInnerHTML`) vs `AIChatBox.tsx` (`<Streamdown>`).

---

## Conclusion : pas de nouveau finding ; le fix d'OPE-48 est déjà disponible en interne.

### Deux renderers coexistent

| Composant | Rendu | Sûreté |
| -- | -- | -- |
| **`Assistant.tsx:518`** (live, drawer + page) | `dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }}` (markdown→HTML **regex sans échappement**) | ❌ **non-safe = OPE-48** |
| **`AIChatBox.tsx:406`** (ComponentShowcase, ancien composant) | `<Streamdown>{message.content}</Streamdown>` | ✅ **safe** |

### `Streamdown` est sûr par défaut

`AIChatBox` rend le **même type de contenu** (réponses assistant) via **`<Streamdown>`**
(lib Vercel, markdown→**composants React**). `grep rehype-raw|allowDangerous|skipHtml` sur
`AIChatBox` = **0** → **aucun flag dangereux** : Streamdown **n'exécute pas** le HTML brut
par défaut (le markdown est rendu en éléments React, le HTML inline est échappé/ignoré). →
Pas de sink `dangerouslySetInnerHTML`.

### Conséquence : le fix d'OPE-48 est trivial et déjà en dépôt

La page **live** utilise le chemin **non-safe** alors que le codebase **contient déjà** le
renderer sûr (`Streamdown`, importé, utilisé dans `AIChatBox`/`ComponentShowcase`). Le fix
d'OPE-48 = **remplacer** dans `Assistant.tsx` :

```tsx
// AVANT (OPE-48)
<div dangerouslySetInnerHTML={{ __html: renderContent(msg.content || "") }} />
// APRÈS (renderer déjà présent)
<Streamdown>{msg.content || ""}</Streamdown>
```

→ supprime le sink HTML brut **sans nouvelle dépendance** (Streamdown est déjà installé).

---

## Réserve LOW (hygiène)

- `AssistantDrawer.tsx:12` **importe** encore `AIChatBox` alors que le drawer rend
  désormais `<Assistant embedded />` (`:13`) → **import mort** probable à nettoyer.
  `AIChatBox` ne subsiste que pour `ComponentShowcase` (page démo dev).

---

## Distinction (anti-doublon)

- L'XSS du sink `renderContent` est **OPE-48**. Cet audit n'ouvre pas de doublon : il
  **fournit le fix concret** (utiliser `Streamdown`, déjà présent) en **commentaire**
  d'OPE-48.

---

## Verdict

Le renderer markdown **sûr** (`Streamdown`, sans `rehype-raw`) est **déjà dans le
codebase** (`AIChatBox`) ; la page live (`Assistant.tsx`) utilise encore le chemin
**non-safe** (`renderContent`, OPE-48). Fix = swap vers `<Streamdown>` (zéro nouvelle dep).
**Pas de nouvelle issue** ; fix actionnable ajouté en commentaire d'**OPE-48**.
