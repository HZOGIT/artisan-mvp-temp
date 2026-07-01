# language: fr
@bloc:Onboarding @modules:auth,artisan,feature-modules,devis @critique
Fonctionnalité: Inscription et prise en main

  @nominal
  Scénario: Marc s'inscrit et arrive prêt à créer son premier devis
    Étant donné que Marc n'a pas encore de compte Operioz
    Quand il s'inscrit avec son email et vérifie son adresse
    Et qu'il renseigne son entreprise "Plomberie Marc" et son métier "Plombier-chauffagiste"
    Et qu'il active les modules "Devis", "Clients" et "Interventions"
    Alors il atterrit sur son tableau de bord personnalisé
    Et le menu n'affiche que les modules qu'il a activés
    Et il est invité à créer son premier devis
