# language: fr
@bloc:commercial @module:devis @critique
Fonctionnalité: Création et envoi d'un devis

  Parcours commercial amont : l'artisan rédige un devis en brouillon,
  puis l'envoie au client, ce qui le fait passer au statut envoyé.

  @nominal
  Scénario: L'artisan crée un devis en brouillon
    Étant donné que l'artisan a un client enregistré
    Quand il crée un devis avec une ligne "Dépannage plomberie" à 150 € HT
    Alors le devis est enregistré au statut "Brouillon"

  @nominal
  Scénario: L'artisan envoie un devis au client
    Étant donné qu'un devis au statut "Brouillon" est prêt
    Quand l'artisan envoie ce devis au client par email
    Alors le devis passe au statut "Envoyé"
    Et le client reçoit un lien pour le consulter
