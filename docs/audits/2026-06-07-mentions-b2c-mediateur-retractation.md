# Audit — Mentions légales B2C : médiateur de la consommation & droit de rétractation

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : mentions obligatoires sur les **devis/factures destinés aux
> particuliers (B2C)**. Distinct d'OPE-19/20/21 (FacturX, décennale, franchise
> TVA) — autres mentions.

> Les 3 spécialités de la plateforme (plomberie, électricité, chauffage)
> interviennent majoritairement **chez des particuliers** → relation **B2C** par
> défaut.

---

## 🟠 HIGH — Aucune mention du médiateur de la consommation possible sur les devis/factures (obligatoire B2C)

### Problème

**Code de la consommation art. L616-1 / L612-1** : tout professionnel vendant à
des consommateurs doit **communiquer les coordonnées du médiateur de la
consommation** dont il relève — notamment **sur ses CGV et ses bons de commande
(≈ devis)**. Sanction : amende administrative jusqu'à **15 000 €** (personne
morale) / 3 000 € (personne physique).

Or **« médiateur de la consommation » n'apparaît nulle part** dans le code
(`grep médiateur|mediateur|médiation` sur `client/` + `server/` → **0
résultat**) :
- pas de champ dans les **paramètres artisan** (schéma `artisans` / `parametres_artisan`),
- pas de mention dans le **générateur PDF** (`pdfGenerator.ts`) devis/facture,
- pas dans les CGV (la page `legal/CGV.tsx` est celle d'**Operioz envers
  l'artisan**, pas un modèle pour l'artisan envers ses clients).

→ Un artisan utilisant Operioz **ne peut pas** faire figurer la mention
obligatoire sur ses devis/factures → ses documents B2C sont **non conformes**.
(Même nature de manque qu'OPE-20 décennale : champ absent ⇒ mention impossible.)

### Fix proposé

1. Ajouter des champs **paramètres artisan** : `mediateurNom`, `mediateurUrl`
   (et adresse).
2. Les afficher en **pied de devis/facture** (`pdfGenerator.ts`) et/ou dans un
   bloc CGV propre à l'artisan, dès qu'ils sont renseignés.
3. Onboarding/Paramètres : inciter à renseigner le médiateur (tooltip + lien vers
   la liste des médiateurs référencés CECMC).

### Estimation

~0,5 j — champs settings + bloc PDF + UI.

---

## 🟡 MEDIUM (documenté) — Droit de rétractation (vente hors établissement) non géré

Pour un devis **signé au domicile du client** (vente hors établissement /
démarchage), le pro doit informer le consommateur de son **droit de rétractation
de 14 jours** et fournir un **formulaire de rétractation** (Code conso L221-5,
L221-9). Operioz ne gère **aucune** clause/formulaire de rétractation pour les
devis B2C hors établissement (la seule « rétractation » du code concerne l'abo
Operioz, `CGV.tsx:73`).

Plus nuancé (ne s'applique qu'au hors-établissement, avec exceptions
travaux urgents), d'où MEDIUM — mais à prévoir : clause + formulaire optionnels
sur les devis marqués « signé au domicile ».

---

## Estimation totale

- HIGH (médiateur de la consommation) : ~0,5 j
- MEDIUM (droit de rétractation hors établissement) : ~1 j
