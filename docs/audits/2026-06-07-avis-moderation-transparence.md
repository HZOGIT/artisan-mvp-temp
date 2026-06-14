# Audit — Avis clients : modération & transparence (avis en ligne)

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : `avisRouter` (`routers.ts:4974`), affichage public des avis et de
> la note moyenne sur la vitrine. Cadre légal : Code de la consommation
> art. L111-7-2 + **décret n° 2017-1436** (loyauté/transparence des avis en
> ligne), art. L121-2 (pratiques commerciales trompeuses).

---

## Ce qui fonctionne correctement

- **Pas d'IDOR** : `repondre` et `moderer` vérifient `avis.artisanId ===
  artisan.id` (NOT_FOUND sinon). ✓
- L'artisan **ne peut pas éditer** la note ni le commentaire du client : `moderer`
  ne modifie que `statut`, `repondre` n'ajoute que `reponseArtisan`. Le texte de
  l'avis client reste intègre. ✓
- Les avis sont publiés immédiatement à la soumission (`submitAvis` → `statut:
  'publie'`), pas de file de pré-modération opaque. ✓
- Demande d'avis liée à une intervention réelle de l'artisan, token 14 j. ✓

---

## 🟠 HIGH — L'artisan peut masquer des avis négatifs authentiques → note publique gonflée, sans transparence

### Problème

`avis.moderer` (`routers.ts:5145`) permet à l'artisan de passer **n'importe
lequel de ses avis** en `statut: 'masque'`, sans aucune contrainte ni motif :

```typescript
// routers.ts:5145
moderer: protectedProcedure
  .input(z.object({ avisId: z.number(), statut: z.enum(["publie", "masque"]) }))
  .mutation(async ({ ctx, input }) => {
    // ... ownership OK ...
    return await db.updateAvis(input.avisId, { statut: input.statut });
  }),
```

Or l'affichage public **et la note moyenne** ne comptent que les avis `publie` :

```typescript
// db.ts getPublishedAvisStats — moyenne calculée UNIQUEMENT sur 'publie'
.where(and(eq(avisClients.artisanId, artisanId), eq(avisClients.statut, 'publie')));
// moyenne = sum(note)/total  ← exclut les 'masque'
```

Conséquence directe : un artisan qui reçoit un avis 1 étoile le passe en
`masque` → l'avis **disparaît de la vitrine** ET **la note moyenne publique
remonte** (la mauvaise note ne compte plus), le `total` affiché diminuant aussi.
Aucune indication n'est donnée au consommateur qu'un ou des avis ont été retirés.

### Impact

- **Note publique gonflée artificiellement** : la moyenne affichée
  (`getPublishedAvisStats` / `getVitrinePublicStats`) reflète une sélection
  d'avis triée par l'artisan, pas l'ensemble des avis authentiques.
- **Risque légal pour Operioz** (la plateforme qui fournit ce levier en un clic) :
  - Manquement à l'obligation de **loyauté/transparence** sur les avis en ligne
    (décret 2017-1436) : pas d'information sur l'existence/critères de modération,
    pas d'indication des avis écartés.
  - Possible **pratique commerciale trompeuse** (art. L121-2) si la note sert
    d'argument commercial alors que les avis négatifs authentiques sont masqués.
- Aucune trace/audit des actions de masquage (pas d'`auditLog`).

> Nuance : modérer le **spam / abus / hors-sujet** est légitime (et nécessaire).
> Le problème est l'absence de distinction entre ça et le masquage d'un avis
> authentique négatif, et l'absence totale de transparence.

### Fix proposé

1. **Ne pas laisser le masquage gonfler silencieusement la moyenne.** Au choix :
   - calculer la moyenne publique sur **tous** les avis authentiques (le masquage
     ne retire que l'affichage du commentaire, pas le poids dans la note) ; ou
   - restreindre `masque` à un **motif de modération** (spam/abus/hors-sujet) et
     n'exclure que ces catégories ; un avis authentique négatif peut recevoir une
     **réponse** mais pas être retiré de la note.
2. **Transparence** (décret 2017-1436) : afficher la politique de modération et,
   le cas échéant, le nombre d'avis écartés / la date des avis.
3. **Auditer** chaque action `moderer` (`createAuditLog`) avec le motif.

### Estimation

~1 j — motif de modération obligatoire + recalcul moyenne + mention transparence
+ audit log.

---

## Estimation totale

- HIGH (masquage d'avis authentiques + note gonflée sans transparence) : ~1 j
