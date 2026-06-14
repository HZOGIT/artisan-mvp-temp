# Audit — Pages légales publiques inaccessibles : « Page en construction » (mentions légales / CGV / confidentialité)

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : routage des pages légales publiques (`client/src/App.tsx`),
> contenu `client/src/pages/legal/*`, footer landing (`Home.tsx`).

---

## 🟠 HIGH — Les pages légales obligatoires affichent « Page en construction » pour tout visiteur public

### Problème (shadowing de routes)

Le contenu réel **existe** : `legal/MentionsLegales.tsx` (72 l.), `CGV.tsx`
(108 l.), `Confidentialite.tsx` (138 l.). Mais dans le `Switch` parent de
`Router()`, des routes **placeholder** interceptent ces chemins **avant** le
catch-all qui contient les vraies pages :

```tsx
// App.tsx — Router() (Switch public), ordre = première route qui matche gagne
:247  <Route path="/mentions-legales" component={PageEnConstruction} />
:248  <Route path="/cgv"              component={PageEnConstruction} />
:249  <Route path="/confidentialite"  component={PageEnConstruction} />
...
:265  <Route component={AuthenticatedRoutes} />   // ← contient les VRAIES pages (:224-227), jamais atteintes
```

→ `/mentions-legales`, `/cgv`, `/confidentialite` matchent lignes 247-249
(**`PageEnConstruction`** → « Cette page est en cours de construction. ») **avant**
d'atteindre le catch-all. Les vraies pages (`:224-227`, dans `AuthenticatedRoutes`)
sont **du code mort**. `/cgu` n'est pas shadowé mais tombe dans `AuthenticatedRoutes`
→ derrière le gate d'auth `DashboardLayout` → un visiteur public voit **« Connexion
requise »**, pas les CGU.

**Bilan : aucune des 4 pages légales ne rend son contenu à un visiteur public.**

### Reproduction

Landing page → footer (`Home.tsx:1581-1596` lie `/mentions-legales`, `/cgu`,
`/cgv`, `/confidentialite`) → cliquer **Mentions légales / CGV / Politique de
confidentialité** → **« Page en construction »** (et CGU → « Connexion requise »).

### Impact (conformité légale au lancement)

- **Mentions légales** : obligatoires pour tout éditeur pro (LCEN art. 6 III) →
  absentes publiquement.
- **CGV** : obligatoires pour la vente B2C d'abonnements (Code conso) → absentes.
- **Politique de confidentialité** : obligatoire (RGPD art. 13/14) →
  inaccessible. **Aggrave OPE-26** (la politique est non seulement « mensongère »
  mais carrément **non publiée**).
- Signal de fiabilité désastreux pour un SaaS payant le jour du lancement.

### Fix proposé

Dans `Router()` (Switch public), **remplacer** les routes `PageEnConstruction`
(247-249) par les vrais composants et **ajouter `/cgu`**, en amont du catch-all :

```tsx
<Route path="/mentions-legales" component={MentionsLegales} />
<Route path="/cgu"              component={CGU} />
<Route path="/cgv"              component={CGV} />
<Route path="/confidentialite"  component={Confidentialite} />
```

(et retirer les doublons légaux dans `AuthenticatedRoutes` :224-227 pour éviter la
confusion ; ces pages doivent être **publiques**, hors `DashboardLayout`).
Vérifier ensuite que `/contact`, `/aide`, `/guide` (toujours `PageEnConstruction`)
sont assumés comme placeholders au lancement ou pointés vers du contenu.

### Estimation

~30 min — re-câbler 4 routes publiques + retirer les placeholders légaux + test
(footer landing → contenu réel).

---

## Estimation totale

- HIGH (pages légales obligatoires non publiées / shadowées) : ~30 min
