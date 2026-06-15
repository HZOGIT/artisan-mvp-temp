# Refonte de la plateforme Operioz — Bilan pour le lancement

*Document à destination des parties prenantes non techniques — 15 juin 2026*
*Lancement en production visé : ~30 juin 2026 (J-2 semaines)*

---

## En une phrase

Nous avons **reconstruit les fondations techniques d'Operioz** — sans rien changer pour
l'utilisateur — afin que la plateforme soit **plus sûre, plus fiable et beaucoup plus rapide
à faire évoluer** au moment où nous passons à l'échelle. Ce chantier est **terminé et validé
en environnement de pré-production** ; les deux prochaines semaines servent à la bascule
finale et aux ultimes vérifications.

---

## L'enjeu : pourquoi ce chantier

Operioz a grandi vite. L'application d'origine fonctionnait, mais reposait sur une base
technique vieillissante qui devenait un **frein** et un **risque** à l'approche du lancement
commercial :

- **Risque de sécurité / confidentialité.** Operioz héberge les données de nombreux artisans
  (clients, devis, factures, comptabilité). Sur l'ancienne base, l'étanchéité entre les
  données de chaque entreprise reposait essentiellement sur le code applicatif — une erreur
  humaine pouvait suffire à exposer les données d'un client à un autre.
- **Fragilité.** Chaque nouvelle fonctionnalité devenait plus risquée à livrer ; le moindre
  changement pouvait casser autre chose, sans filet de sécurité automatisé suffisant.
- **Lenteur de développement.** Le code était difficile à faire évoluer, ce qui ralentissait
  la sortie de nouveautés — un handicap direct face à la concurrence.
- **Dette accumulée.** Maintenir deux logiques en parallèle coûtait du temps et de l'argent.

**L'enjeu :** arriver au lancement sur une fondation **solide, sûre et évolutive**, plutôt que
de lancer commercialement sur une base que nous savions fragile.

---

## Ce qui a été fait

### 1. Une nouvelle fondation, invisible pour l'utilisateur
L'intégralité du « moteur » de l'application a été reconstruite sur une architecture moderne
et modulaire. **L'interface et les fonctionnalités vues par l'utilisateur sont identiques** :
le changement est entièrement « sous le capot ».

### 2. Tous les domaines métier migrés, à fonctionnalités égales
L'ensemble des modules de l'application — clients, devis, factures, comptabilité, stocks,
interventions, planning, portail client, paiements, etc. (plus de 30 domaines) — a été porté
sur la nouvelle base, **fonction pour fonction**. Un audit automatisé confirme qu'**aucune
fonctionnalité n'a été perdue** au passage.

### 3. Sécurité renforcée au niveau le plus profond
L'étanchéité entre les données de chaque entreprise cliente est désormais **garantie par la
base de données elle-même** (et non plus seulement par le code). Concrètement : même en cas
d'erreur de programmation, un client **ne peut pas** accéder aux données d'un autre. C'est un
gain de sécurité majeur pour une plateforme qui héberge des données sensibles.

### 4. Un filet de sécurité automatisé
La nouvelle base est couverte par **plus de 2 400 tests automatisés** qui vérifient en
permanence que les règles critiques restent respectées : exactitude des montants et de la
TVA, équilibre comptable, authentification, contrôles d'autorisation, étanchéité entre
clients. Toute régression est détectée **avant** d'atteindre les utilisateurs.

### 5. L'ancien système entièrement retiré
L'ancienne base de code a été **complètement supprimée**. Nous maintenons désormais **un seul
système moderne**, ce qui réduit les coûts, les risques et la confusion.

### 6. Surveillance continue en conditions réelles
Un robot rejoue **toutes les 5 minutes**, dans un vrai navigateur, un parcours utilisateur
complet sur la pré-production et **alerte immédiatement** au moindre problème. Au moment de
rédiger ce bilan, les passages sont **au vert**.

---

## Où en sommes-nous

| | État |
|---|---|
| Migration des fonctionnalités | ✅ Terminée (parité complète vérifiée) |
| Sécurité (étanchéité des données) | ✅ En place, au niveau base de données |
| Tests automatisés | ✅ Plus de 2 400, au vert |
| Ancien système | ✅ Retiré |
| Déploiement en pré-production | ✅ En ligne et surveillé en continu |
| Bascule en production | 🔜 Planifiée d'ici le lancement |

Deux incidents remontés par un utilisateur réel cette semaine (un lien de paiement et un
écran de tableau de bord) ont été **diagnostiqués, corrigés et vérifiés de bout en bout** —
preuve que le dispositif de détection et de correction fonctionne.

---

## Ce qu'il reste avant le lancement (≈ 2 semaines)

1. **Bascule en production** : déployer la nouvelle base sur l'environnement de production et
   y rejouer les mêmes vérifications de sécurité et de fonctionnement qu'en pré-production.
2. **Validation finale** : une dernière campagne de tests sur des parcours réels.
3. **Préparation opérationnelle** : surveillance, sauvegardes et procédure de retour arrière
   prêtes le jour J.

Le travail le plus lourd et le plus risqué — la reconstruction elle-même — est **derrière
nous**. Les deux prochaines semaines relèvent de la **mise en production maîtrisée**, pas du
développement.

---

## En résumé pour la décision

- ✅ **Nous lançons sur une fondation neuve, sûre et éprouvée**, et non sur une base fragile.
- ✅ **Aucune perte de fonctionnalité** pour les utilisateurs ; le changement est invisible.
- ✅ **Sécurité des données renforcée** au niveau structurel — un argument de confiance fort
  vis-à-vis des clients.
- ✅ **Capacité à livrer plus vite** les prochaines fonctionnalités après le lancement.
- 🔜 **Risque résiduel maîtrisé** : il porte sur la bascule en production, encadrée par des
  vérifications automatisées et une procédure de retour arrière.

**Recommandation : le chantier de refonte ne constitue pas un obstacle au lancement du
30 juin — il en est au contraire le socle.**
