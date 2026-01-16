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


## Nouvelles Fonctionnalités (Sprint 14)

### Gestion des Chantiers Multi-Interventions
- [x] Table des chantiers (nom, client, adresse, dates, budget)
- [x] Association de plusieurs interventions à un chantier
- [x] Suivi de l'avancement global du chantier
- [x] Budget et coûts par chantier
- [x] Timeline des interventions du chantier
- [x] Page de gestion des chantiers

### Intégration Logiciels Comptables
- [x] Export au format Sage (FEC)
- [x] Export au format QuickBooks (IIF/QBO)
- [x] Mapping des comptes comptables
- [x] Configuration des paramètres d'export
- [x] Historique des exports
- [x] Page de configuration des intégrations

### Devis Automatique par IA
- [x] Upload de photos du chantier
- [x] Analyse des photos par IA (vision)
- [x] Détection des travaux nécessaires
- [x] Suggestion d'articles et quantités
- [x] Génération automatique du devis
- [x] Page de création de devis assisté par IA


## Nouvelles Fonctionnalités (Sprint 15)

### Amélioration Devis IA - Modification Manuelle
- [x] Interface d'édition des suggestions d'articles
- [x] Modification des quantités et prix unitaires
- [x] Ajout/suppression d'articles suggérés
- [x] Validation des modifications avant génération
- [x] Prévisualisation du devis final

### Calendrier Partagé des Chantiers
- [x] Vue calendrier des interventions par chantier
- [x] Filtrage par chantier et technicien
- [x] Drag & drop pour réorganiser les interventions
- [x] Affichage des phases du chantier
- [x] Export du calendrier

### Synchronisation Automatique Comptable
- [x] Configuration de la synchronisation automatique
- [x] Envoi automatique des factures vers Sage/QuickBooks
- [x] Synchronisation des paiements reçus
- [x] Journal de synchronisation avec statuts
- [x] Gestion des erreurs et reprises


## Nouvelles Fonctionnalités (Sprint 16)

### Drag-and-Drop Calendrier
- [x] Implémentation du drag-and-drop pour les interventions
- [x] Mise à jour des dates lors du déplacement
- [x] Feedback visuel pendant le drag
- [x] Validation des contraintes (disponibilité technicien)

### Tableau de Bord Synchronisations Comptables
- [x] Statistiques des synchronisations (succès, erreurs, en attente)
- [x] Graphique d'évolution des synchronisations
- [x] Liste des dernières synchronisations
- [x] Indicateurs de performance

### Personnalisation Couleurs Événements
- [x] Sélecteur de couleur pour les interventions
- [x] Couleurs par type d'intervention ou par technicien
- [x] Sauvegarde des préférences de couleur
- [x] Légende des couleurs dans le calendrier


## Nouvelles Fonctionnalités (Sprint 17)

### Filtres Tableau de Bord Synchronisations
- [x] Filtre par type (factures, paiements, exports)
- [x] Filtre par statut de synchronisation
- [x] Combinaison des filtres
- [x] Mise à jour des statistiques selon les filtres

### Sauvegarde Couleurs Calendrier
- [x] Table des préférences de couleurs en BDD
- [x] API pour sauvegarder les couleurs
- [x] API pour récupérer les couleurs
- [x] Chargement automatique des couleurs au démarrage

### Vue Imprimable Calendrier
- [x] Bouton d'impression dans le calendrier
- [x] Vue hebdomadaire optimisée pour l'impression
- [x] Vue mensuelle optimisée pour l'impression
- [x] Styles CSS d'impression dédiés


## Nouvelles Fonctionnalités (Sprint 18)

### Export PDF Calendrier
- [x] Bouton d'export PDF dans le calendrier
- [x] Génération du PDF avec jsPDF
- [x] Mise en page optimisée pour le PDF
- [x] Inclusion de la légende et des filtres

### Widget Calendrier Compact
- [x] Composant CalendarWidget réutilisable
- [x] Intégration sur le tableau de bord
- [x] Affichage des interventions du jour/semaine
- [x] Navigation rapide vers le calendrier complet

### Amélioration Drag-and-Drop
- [x] Réassignation de technicien par drag-and-drop
- [x] Reprogrammation par glisser-déposer
- [x] Feedback visuel amélioré
- [x] Confirmation avant modification


## Nouvelles Fonctionnalités (Sprint 19)

### Prévisualisation PDF
- [x] Dialogue de prévisualisation du PDF
- [x] Affichage du PDF dans un iframe
- [x] Boutons télécharger et fermer
- [x] Génération du PDF en mémoire

### Personnalisation Widget Calendrier
- [x] Menu de configuration du widget
- [x] Choix des informations affichées
- [x] Sauvegarde des préférences
- [x] Options d'affichage (jour/semaine/statistiques)

### Amélioration Confirmation Drag-and-Drop
- [x] Bouton d'annulation explicite
- [x] Historique des actions récentes
- [x] Option "Ne plus demander"
- [x] Feedback visuel amélioré


## Nouvelles Fonctionnalités (Sprint 20)

### Recherche et Filtrage PDF
- [x] Champ de recherche dans la prévisualisation PDF
- [x] Filtres par chantier, technicien et statut
- [x] Mise à jour dynamique du PDF selon les filtres
- [x] Indicateur du nombre de résultats

### Partage Configuration Widget
- [x] Bouton de partage de configuration
- [x] Génération d'un code de partage
- [x] Import de configuration partagée
- [x] Réinitialisation de la configuration

### Animation Drag-and-Drop
- [x] Animation de transition fluide
- [x] Indicateur visuel de la nouvelle position
- [x] Effet de survol amélioré
- [x] Feedback visuel du déplacement


## Bugs à corriger

- [x] RangeError: Invalid time value dans la page Devis (Devis.tsx ligne 218) - Corrigé: dateCreation -> dateDevis


## Améliorations Page Devis

- [x] Filtrage des devis par statut (brouillon, envoyé, accepté, refusé, expiré)
- [x] Conversion d'un devis accepté en facture en un clic
- [x] Recherche avancée par nom de client ou numéro de devis


## Améliorations Devis - Sprint 21

- [x] Export PDF de la liste des devis filtrés
- [x] Export Excel de la liste des devis filtrés
- [x] Tableau de bord statistiques de conversion des devis (/devis/statistiques)
- [x] Système de relance automatique pour devis en attente (configuration complète)


## Bugs à corriger

- [x] NotFoundError: Failed to execute 'removeChild' dans la page Articles - Corrigé: ajouté {} comme paramètre à getBibliotheque et gestion null-safe


## Améliorations Bibliothèque d'Articles

- [x] Création d'articles depuis la page bibliothèque
- [x] Modification d'articles existants
- [x] Suppression d'articles
- [x] Import CSV d'articles en masse
- [x] Export CSV de la bibliothèque
- [x] Indicateurs de niveau de stock pour chaque article

## Bugs Critiques à Corriger

- [x] Page Devis : compteurs de statut affichent tous 0 au lieu des vraies valeurs - Corrigé
- [ ] Page Devis : création de devis reste bloquée (TRPCClientError: Failed to fetch) - En cours d'investigation
- [x] Page Devis : formulaire de création incomplet - Corrigé: nouvelle page d'ajout de ligne avec sélection d'articles, prix, calculs automatiques


## Bugs à corriger (Sprint Correction)

### Problèmes identifiés sur les Devis
- [x] Les lignes de devis ne sont pas affichées - Corrigé: la table devis_lignes est vide car aucune ligne n'a été ajoutée
- [x] Le formulaire d'ajout de ligne ne fonctionne pas correctement - Corrigé: nouvelle page /devis/:id/ligne/nouvelle
- [x] Les totaux des devis sont pré-remplis mais sans lignes correspondantes - Identifié: les montants ont été saisis lors de la création initiale
- [x] Le dialogue de création de devis ne s'ouvre pas toujours correctement - Corrigé: utilisation d'une page dédiée au lieu du dialogue



## Sprint Correction Sélecteur d'Articles

- [ ] Corriger le sélecteur d'articles pour qu'il s'ouvre correctement
- [ ] Ajouter une fonctionnalité de recherche et filtrage à la liste d'articles
- [ ] Pré-remplir automatiquement les champs du formulaire lors de la sélection d'un article


## Corrections Sélecteur d'Articles (Sprint Correction)

- [x] Corriger le sélecteur d'articles pour qu'il s'ouvre correctement - Corrigé: utilisation d'un Dialog au lieu d'un Popover
- [x] Ajouter une fonctionnalité de recherche et de filtrage à la liste de sélection des articles - Corrigé: champ de recherche avec filtrage par nom, référence et catégorie
- [x] Pré-remplir automatiquement les champs du formulaire lors de la sélection d'un article - Corrigé: les champs sont pré-remplis avec les données de l'article sélectionné


---

## 🔴 CORRECTIONS AUDIT SÉCURITÉ (PHASE 0 - CRITIQUE)

### Sécurité Multi-Tenant
- [ ] Créer `server/_core/security.ts` avec wrappers sécurisés
- [ ] Refactorer `server/db.ts` - Ajouter artisanId à toutes les requêtes (200+ occurrences)
- [ ] Simplifier `server/routers.ts` - Utiliser les wrappers de sécurité
- [ ] Tester l'isolation entre artisans

### Prévention SQL Injection  
- [ ] Corriger `searchClients` et autres recherches texte
- [ ] Éliminer tous les `sql` templates avec interpolation directe
- [ ] Utiliser les paramètres Drizzle (like, eq, and, or)
- [ ] Auditer toutes les fonctions de `server/db.ts`

### Gestion des Secrets
- [ ] Créer validation stricte des secrets au démarrage
- [ ] Supprimer les valeurs par défaut dangereuses
- [ ] Valider les formats (JWT_SECRET min 32 chars, STRIPE_SECRET_KEY commence par sk_)
- [ ] Ne JAMAIS exposer les secrets au client

## 🟡 CORRECTIONS AUDIT PERFORMANCE (PHASE 1 - IMPORTANT)

### Index Base de Données
- [ ] Ajouter index sur `clients` (artisanId, email, telephone)
- [ ] Ajouter index sur `devis` (artisanId, clientId, numero, statut, dateEmission)
- [ ] Ajouter index sur `factures` (artisanId, clientId, numero, statut, dateEmission)
- [ ] Ajouter index sur `interventions` (artisanId, clientId, dateDebut, statut)
- [ ] Ajouter index sur `stocks` (artisanId, reference)

### Validation des Données
- [ ] Ajouter regex pour téléphone, SIRET, code postal
- [ ] Ajouter limites de longueur pour email, nom, etc.
- [ ] Valider les formats strictement
- [ ] Tester les cas limites

### Gestion d'Erreurs
- [ ] Créer `server/_core/errorHandler.ts`
- [ ] Implémenter middleware d'erreur global
- [ ] Ne pas exposer les détails en production
- [ ] Logger les erreurs correctement

### Optimisation Requêtes
- [ ] Éliminer les N+1 queries
- [ ] Utiliser JOIN au lieu de boucles
- [ ] Optimiser les requêtes lentes


## Sprint 3 - Nouvelles Fonctionnalités Prioritaires

### Import de Contacts Clients via Excel
- [ ] Créer un composant d'upload de fichier Excel
- [ ] Parser le fichier Excel et valider les données
- [ ] Afficher une prévisualisation des contacts avant import
- [ ] Implémenter la logique d'import en base de données
- [ ] Gérer les doublons (email, téléphone)
- [ ] Afficher les messages de succès/erreur
- [ ] Créer une page dédiée pour l'import

### Génération PDF des Devis et Factures
- [ ] Créer un template PDF pour les devis
- [ ] Créer un template PDF pour les factures
- [ ] Ajouter le logo de l'artisan au PDF
- [ ] Inclure les détails client (nom, adresse, email, téléphone)
- [ ] Inclure les articles avec prix unitaire et total
- [ ] Calculer et afficher TVA et total
- [ ] Ajouter les conditions de paiement
- [ ] Implémenter le bouton "Télécharger PDF" sur les pages devis/factures
- [ ] Tester la génération avec différents formats

### Gestion des Modèles d'E-mails Transactionnels
- [ ] Créer une table pour les modèles d'emails
- [ ] Créer une page de gestion des modèles
- [ ] Implémenter l'édition des modèles
- [ ] Ajouter les variables dynamiques (nom client, numéro devis, etc.)
- [ ] Créer une prévisualisation du modèle
- [ ] Intégrer les modèles avec l'envoi d'email
- [ ] Créer des modèles par défaut (relance, confirmation, etc.)
- [ ] Tester l'envoi avec les variables remplacées
