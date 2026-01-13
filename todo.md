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


## Nouvelles Fonctionnalités (Sprint 6)

### Intégration Twilio SMS
- [x] Configuration du service Twilio
- [x] Création du module d'envoi SMS
- [x] Intégration avec la validation de signature
- [x] Gestion des erreurs d'envoi SMS
- [x] Configuration des secrets Twilio

### Rapport de Commande Fournisseur
- [x] Endpoint pour récupérer les articles en rupture de stock
- [x] Association avec les fournisseurs correspondants
- [x] Page de génération du rapport de commande
- [x] Export PDF du rapport de commande
- [x] Regroupement par fournisseur
### Relance Automatique des Devis
- [x] Endpoint pour récupérer les devis non signés
- [x] Configuration du délai de relance (paramètres)
- [x] Génération automatique des notifications de relance
- [x] Envoi d'email de relance au client
- [x] Historique des relances effectuées


## Nouvelles Fonctionnalités (Sprint 7)

### Modèles d'Emails Personnalisables
- [x] Table des modèles d'emails (nom, sujet, contenu, variables)
- [x] Page de gestion des modèles d'emails
- [x] Variables dynamiques (nom client, numéro devis, montant, etc.)
- [x] Prévisualisation du modèle avant envoi
- [x] Intégration avec le module de relance

### Tableau de Bord Performances Fournisseurs
- [x] Table des commandes fournisseurs
- [x] Suivi des délais de livraison
- [x] Calcul du taux de fiabilité
- [x] Page de tableau de bord avec graphiques
- [x] Historique des commandes par fournisseur

### Paiement en Ligne Stripe
- [x] Configuration de l'intégration Stripe
- [x] Génération de liens de paiement pour les factures
- [x] Page de paiement publique
- [x] Webhook pour confirmation de paiement
- [x] Mise à jour automatique du statut de la facture


## Nouvelles Fonctionnalités (Sprint 8)

### Portail Client
- [x] Système d'authentification client par lien magique
- [x] Page d'accueil du portail client
- [x] Liste des devis du client avec statuts
- [x] Liste des factures du client avec statuts de paiement
- [x] Historique des interventions
- [x] Possibilité de signer les devis depuis le portail
- [x] Possibilité de payer les factures depuis le portail

### Application Mobile PWA
- [x] Configuration du manifest.json pour PWA
- [x] Service Worker pour le mode hors-ligne
- [x] Page mobile optimisée pour les interventions
- [x] Géolocalisation et navigation vers le client
- [x] Prise de photos pendant l'intervention
- [x] Signature client sur mobile
- [x] Synchronisation des données hors-ligne

### Facturation Récurrente
- [x] Table des contrats de maintenance
- [x] Configuration de la périodicité (mensuel, trimestriel, annuel)
- [x] Génération automatique des factures
- [x] Notifications de renouvellement
- [x] Page de gestion des contrats
- [x] Historique des factures générées par contrat


## Nouvelles Fonctionnalités (Sprint 9)

### Chat en Temps Réel
- [x] Table des conversations et messages
- [x] Interface de chat sur le portail client
- [x] Interface de chat côté artisan
- [x] Notifications de nouveaux messages
- [x] Historique des conversations
- [x] Indicateur de messages non lus

### Gestion des Équipes
- [x] Table des techniciens/membres d'équipe
- [x] Assignation des interventions aux techniciens
- [x] Calendrier de disponibilité des techniciens
- [x] Page de gestion de l'équipe
- [x] Filtrage des interventions par technicien
- [x] Statistiques par technicien

### Notation et Avis Clients
- [x] Table des avis et notations
- [x] Email de demande d'avis après intervention
- [x] Page publique de notation (1-5 étoiles + commentaire)
- [x] Affichage des avis sur la fiche client
- [x] Statistiques de satisfaction globale
- [x] Modération des avis par l'artisan


## Nouvelles Fonctionnalités (Sprint 10)

### Géolocalisation Temps Réel des Techniciens
- [x] Table des positions GPS des techniciens
- [x] Mise à jour de la position depuis l'app mobile
- [x] Carte interactive avec positions des techniciens
- [x] Calcul des distances et temps de trajet
- [x] Optimisation des affectations d'interventions
- [x] Historique des déplacements

### Module de Comptabilité
- [x] Export du grand livre comptable
- [x] Export de la balance comptable
- [x] Journaux de ventes et achats
- [x] Rapports TVA
- [x] Export au format compatible comptable
- [x] Page de tableau de bord comptable

### Devis Multi-Options
- [x] Table des options de devis
- [x] Création de plusieurs options par devis
- [x] Comparatif des options pour le client
- [x] Sélection d'option par le client
- [x] Page de visualisation multi-options
- [x] Conversion de l'option choisie en facture


## Nouvelles Fonctionnalités (Sprint 11)

### Intégration Google Maps
- [x] Composant carte Google Maps pour la géolocalisation
- [x] Affichage des marqueurs des techniciens sur la carte
- [x] Mise à jour en temps réel des positions
- [x] Info-bulle avec détails du technicien au clic
- [x] Clustering des marqueurs si plusieurs techniciens proches

### Planification Intelligente
- [x] Calcul de distance entre technicien et adresse d'intervention
- [x] Suggestion du technicien le plus proche
- [x] Prise en compte des disponibilités
- [x] Affichage du temps de trajet estimé
- [x] Interface de sélection avec recommandation

### Rapports Personnalisables
- [x] Table des modèles de rapports
- [x] Création de rapports avec filtres personnalisés
- [x] Sélection des métriques à inclure
- [x] Génération de graphiques dynamiques
- [x] Export PDF et CSV des rapports
- [x] Sauvegarde des modèles de rapports


## Nouvelles Fonctionnalités (Sprint 12)

### Notifications Push
- [x] Configuration du service de notifications push
- [x] Enregistrement des tokens de notification des techniciens
- [x] Envoi de notifications lors de nouvelles assignations
- [x] Notifications pour les modifications d'interventions
- [x] Page de gestion des préférences de notification

### Gestion des Congés et Absences
- [x] Table des congés et absences
- [x] Création de demandes de congés
- [x] Validation des congés par l'artisan
- [x] Calendrier des absences
- [x] Prise en compte dans la planification
- [x] Historique des congés par technicien

### Prévisions de CA
- [x] Analyse de l'historique des ventes
- [x] Calcul des tendances mensuelles
- [x] Prévisions sur 3, 6 et 12 mois
- [x] Graphiques de projection
- [x] Comparaison prévisions vs réalisé
- [x] Alertes si écart significatif


## Nouvelles Fonctionnalités (Sprint 13)
### Gestion des Véhicules

- [x] Table des véhicules (immatriculation, marque, modèle, année)
- [x] Suivi kilométrique avec historique
- [x] Gestion des entretiens (vidange, pneus, contrôle technique)
- [x] Suivi des assurances (dates, montants, alertes expiration)
- [x] Assignation des véhicules aux techniciens
- [x] Page de gestion de la flotte

### Badges et Gamification
- [x] Table des badges et récompenses
- [x] Définition des objectifs (interventions, avis positifs, CA)
- [x] Attribution automatique des badges
- [x] Classement des techniciens
- [x] Page de profil avec badges obtenus
- [x] Notifications de nouveaux badges

### Alertes Écarts Prévisions CA
- [x] Calcul automatique des écarts prévisions vs réalisé
- [x] Configuration des seuils d'alerte (ex: +/- 10%)
- [x] Envoi d'alertes par email
- [x] Envoi d'alertes par SMS (optionnel)
- [x] Historique des alertes envoyées
- [x] Page de configuration des alertes
