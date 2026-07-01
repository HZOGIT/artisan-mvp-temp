# language: fr
@bloc:clients @module:chat
Fonctionnalité: Échange avec un client par messagerie

  Parcours client : l'artisan échange avec un client via la messagerie
  intégrée ; le client est notifié de chaque nouveau message.

  @nominal
  Scénario: L'artisan envoie un message à un client
    Étant donné qu'une conversation est ouverte avec un client
    Quand l'artisan envoie un message dans cette conversation
    Alors le message apparaît dans la conversation
    Et le client est notifié du nouveau message
