# language: fr
@bloc:Gestion @modules:articles,devis
Fonctionnalité: Catalogue d'articles réutilisable

  @nominal
  Scénario: L'artisan crée son catalogue d'articles et les réutilise dans un devis
    Étant donné que l'artisan ouvre le module "Articles"
    Quand il crée l'article "Chaudière gaz condensation" à 1 800 € HT (TVA 20%)
    Et l'article "Main d'œuvre plombier" à 55 € HT / heure
    Alors les deux articles apparaissent dans son catalogue
    Quand il crée un nouveau devis et cherche "Chaudière"
    Alors il peut insérer l'article du catalogue comme ligne de devis
    Et le prix et la TVA sont pré-remplis depuis le catalogue
