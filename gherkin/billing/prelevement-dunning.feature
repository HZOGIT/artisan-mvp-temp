# language: fr
@bloc:parametres @module:billing
Fonctionnalité: Prélèvement automatique et relance en cas d'échec

  Parcours abonnement : à chaque cycle, l'abonnement est prélevé
  automatiquement sur la carte enregistrée ; si le prélèvement échoue, une
  relance est programmée, jusqu'à un nombre maximal de tentatives.

  @edge
  Scénario: Un prélèvement automatique échoué programme une nouvelle tentative
    Étant donné qu'un cycle d'abonnement est dû et prélevé automatiquement
    Quand le prélèvement échoue sur la carte enregistrée
    Alors le cycle passe au statut "En échec"
    Et une nouvelle tentative de prélèvement est programmée

  @edge
  Scénario: La relance s'arrête après le nombre maximal de tentatives
    Étant donné qu'un cycle en échec a atteint le nombre maximal de tentatives
    Quand une nouvelle tentative de prélèvement est déclenchée
    Alors aucune tentative supplémentaire n'est effectuée pour ce cycle
