# Artisan MVP - TODO

## Authentification et Profils
- [x] Système d'authentification complet avec login/logout
- [x] Gestion des profils artisans (SIRET, adresse, téléphone, spécialité)
- [x] Page de profil artisan avec édition

## Gestion des Clients
- [x] Liste des clients avec recherche et filtrage
- [x] Création de nouveaux clients
- [x] Modification des clients existants
- [x] Suppression des clients
- [x] Fiche client détaillée

## Système de Devis
- [x] Liste des devis avec statuts
- [x] Création de devis avec lignes d'articles
- [x] Calculs automatiques (sous-total, TVA, total)
- [x] Gestion des statuts (brouillon, envoyé, accepté, refusé)
- [x] Modification et suppression de devis

## Système de Facturation
- [x] Liste des factures avec suivi des paiements
- [x] Génération de facture à partir d'un devis
- [x] Création de facture directe
- [x] Suivi des paiements (payé, en attente, en retard)
- [x] Modification et suppression de factures

## Bibliothèque d'Articles
- [x] 100 articles de plomberie
- [x] 150 articles d'électricité
- [x] Recherche et filtrage par catégorie/métier
- [x] Articles personnalisés par artisan

## Module d'Interventions
- [x] Liste des interventions planifiées
- [x] Création d'interventions avec association client
- [x] Planification avec date et heure
- [x] Suivi du statut (planifiée, en cours, terminée, annulée)
- [x] Modification et suppression d'interventions

## Système de Notifications
- [x] Alertes et rappels
- [x] Compteur de notifications non lues
- [x] Marquage comme lu
- [x] Archivage des notifications

## Tableau de Bord
- [x] Statistiques du chiffre d'affaires
- [x] Nombre de devis en cours
- [x] Factures impayées
- [x] Interventions à venir
- [x] Graphiques de performance

## Interface Utilisateur
- [x] Navigation par sidebar pour artisans connectés
- [x] Interface responsive
- [x] Design professionnel et fonctionnel
- [x] Thème adapté à un usage métier quotidien


## Nouvelles Fonctionnalités (Sprint 2)

### Export PDF
- [x] Export PDF pour les devis
- [x] Export PDF pour les factures
- [x] Mise en page professionnelle avec logo et informations artisan

### Calendrier Visuel
- [x] Calendrier interactif pour les interventions
- [x] Vue mensuelle des interventions planifiées
- [x] Création d'intervention depuis le calendrier
- [x] Affichage des détails au clic

### Historique Client Amélioré
- [x] Onglet historique sur la fiche client
- [x] Liste des devis du client
- [x] Liste des factures du client
- [x] Liste des interventions du client
- [x] Statistiques client (total facturé, nombre d'interventions)


## Nouvelles Fonctionnalités (Sprint 3)

### Envoi par Email
- [x] Bouton d'envoi par email sur la page de détail du devis
- [x] Bouton d'envoi par email sur la page de détail de la facture
- [x] Génération du PDF et envoi en pièce jointe
- [x] Personnalisation du message d'accompagnement

### Rappels Automatiques
- [x] Notifications pour factures impayées (échéance dépassée)
- [x] Notifications pour interventions à venir (J-1)
- [x] Affichage des rappels dans le système de notifications
- [x] Configuration des rappels dans les paramètres

### Duplication de Devis
- [x] Bouton de duplication sur la page de détail du devis
- [x] Copie de toutes les lignes d'articles
- [x] Génération d'un nouveau numéro de devis
- [x] Redirection vers le nouveau devis pour modification


## Nouvelles Fonctionnalités (Sprint 4)

### Signature Électronique
- [x] Génération de lien de signature unique pour chaque devis
- [x] Page publique de visualisation et signature du devis
- [x] Canvas de signature tactile/souris
- [x] Enregistrement de la signature avec horodatage
- [x] Mise à jour automatique du statut du devis après signature
- [x] Notification à l'artisan lors de la signature

### Tableau de Bord Avancé
- [x] Graphique d'évolution du CA sur 12 mois
- [x] Comparatif année N vs N-1
- [x] Répartition du CA par type de prestation
- [x] Taux de conversion devis/factures
- [x] Évolution du nombre de clients
- [x] Top 5 des clients par CA

### Gestion des Stocks
- [x] Table de stock pour les articles
- [x] Suivi des quantités en stock
- [x] Seuil d'alerte de réapprovisionnement
- [x] Notifications d'alerte stock bas
- [x] Historique des mouvements de stock
- [x] Page de gestion des stocks


## Nouvelles Fonctionnalités (Sprint 5)

### Export Tableau de Bord
- [x] Export des statistiques en format PDF
- [x] Export des données en format CSV
- [x] Sélection de la période à exporter
- [x] Mise en page professionnelle du PDF

### Gestion des Fournisseurs
- [x] Table des fournisseurs (nom, contact, email, téléphone)
- [x] Association articles-fournisseurs
- [x] Affichage du fournisseur sur la page de stocks
- [x] Filtrage des articles par fournisseur
- [x] Page de gestion des fournisseurs

### Validation SMS pour Signature
- [x] Envoi de code SMS au client avant signature
- [x] Vérification du code SMS
- [x] Enregistrement de la validation SMS avec la signature
- [x] Configuration du numéro de téléphone du client
