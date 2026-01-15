-- ============================================================================
-- MIGRATION: Ajout des index de performance
-- Description: Améliore les performances des requêtes fréquentes
-- ============================================================================

-- Index sur la table clients
CREATE INDEX IF NOT EXISTS idx_clients_artisanId ON clients(artisanId);
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_telephone ON clients(telephone);
CREATE INDEX IF NOT EXISTS idx_clients_artisanId_email ON clients(artisanId, email);

-- Index sur la table devis
CREATE INDEX IF NOT EXISTS idx_devis_artisanId ON devis(artisanId);
CREATE INDEX IF NOT EXISTS idx_devis_clientId ON devis(clientId);
CREATE INDEX IF NOT EXISTS idx_devis_numero ON devis(numero);
CREATE INDEX IF NOT EXISTS idx_devis_statut ON devis(statut);
CREATE INDEX IF NOT EXISTS idx_devis_dateEmission ON devis(dateEmission);
CREATE INDEX IF NOT EXISTS idx_devis_artisanId_statut ON devis(artisanId, statut);
CREATE INDEX IF NOT EXISTS idx_devis_artisanId_dateEmission ON devis(artisanId, dateEmission);

-- Index sur la table factures
CREATE INDEX IF NOT EXISTS idx_factures_artisanId ON factures(artisanId);
CREATE INDEX IF NOT EXISTS idx_factures_clientId ON factures(clientId);
CREATE INDEX IF NOT EXISTS idx_factures_numero ON factures(numero);
CREATE INDEX IF NOT EXISTS idx_factures_statut ON factures(statut);
CREATE INDEX IF NOT EXISTS idx_factures_dateEmission ON factures(dateEmission);
CREATE INDEX IF NOT EXISTS idx_factures_artisanId_statut ON factures(artisanId, statut);
CREATE INDEX IF NOT EXISTS idx_factures_artisanId_dateEmission ON factures(artisanId, dateEmission);

-- Index sur la table interventions
CREATE INDEX IF NOT EXISTS idx_interventions_artisanId ON interventions(artisanId);
CREATE INDEX IF NOT EXISTS idx_interventions_clientId ON interventions(clientId);
CREATE INDEX IF NOT EXISTS idx_interventions_dateDebut ON interventions(dateDebut);
CREATE INDEX IF NOT EXISTS idx_interventions_statut ON interventions(statut);
CREATE INDEX IF NOT EXISTS idx_interventions_artisanId_statut ON interventions(artisanId, statut);
CREATE INDEX IF NOT EXISTS idx_interventions_artisanId_dateDebut ON interventions(artisanId, dateDebut);

-- Index sur la table stocks
CREATE INDEX IF NOT EXISTS idx_stocks_artisanId ON stocks(artisanId);
CREATE INDEX IF NOT EXISTS idx_stocks_reference ON stocks(reference);
CREATE INDEX IF NOT EXISTS idx_stocks_artisanId_reference ON stocks(artisanId, reference);

-- Index sur la table articles_artisan
CREATE INDEX IF NOT EXISTS idx_articles_artisan_artisanId ON articles_artisan(artisanId);
CREATE INDEX IF NOT EXISTS idx_articles_artisan_reference ON articles_artisan(reference);

-- Index sur la table fournisseurs
CREATE INDEX IF NOT EXISTS idx_fournisseurs_artisanId ON fournisseurs(artisanId);
CREATE INDEX IF NOT EXISTS idx_fournisseurs_email ON fournisseurs(email);

-- Index sur la table commandes_fournisseurs
CREATE INDEX IF NOT EXISTS idx_commandes_fournisseurs_artisanId ON commandes_fournisseurs(artisanId);
CREATE INDEX IF NOT EXISTS idx_commandes_fournisseurs_fournisseurId ON commandes_fournisseurs(fournisseurId);
CREATE INDEX IF NOT EXISTS idx_commandes_fournisseurs_statut ON commandes_fournisseurs(statut);

-- Index sur la table notifications
CREATE INDEX IF NOT EXISTS idx_notifications_artisanId ON notifications(artisanId);
CREATE INDEX IF NOT EXISTS idx_notifications_createdAt ON notifications(createdAt);
CREATE INDEX IF NOT EXISTS idx_notifications_artisanId_createdAt ON notifications(artisanId, createdAt);

-- Index sur la table paiements_stripe
CREATE INDEX IF NOT EXISTS idx_paiements_stripe_artisanId ON paiements_stripe(artisanId);
CREATE INDEX IF NOT EXISTS idx_paiements_stripe_factureId ON paiements_stripe(factureId);
CREATE INDEX IF NOT EXISTS idx_paiements_stripe_stripeSessionId ON paiements_stripe(stripeSessionId);

-- Index sur la table signatures_devis
CREATE INDEX IF NOT EXISTS idx_signatures_devis_devisId ON signatures_devis(devisId);
CREATE INDEX IF NOT EXISTS idx_signatures_devis_tokenSignature ON signatures_devis(tokenSignature);

-- Index sur la table techniciens
CREATE INDEX IF NOT EXISTS idx_techniciens_artisanId ON techniciens(artisanId);
CREATE INDEX IF NOT EXISTS idx_techniciens_email ON techniciens(email);

-- Index sur la table interventions_techniciens
CREATE INDEX IF NOT EXISTS idx_interventions_techniciens_interventionId ON interventions_techniciens(interventionId);
CREATE INDEX IF NOT EXISTS idx_interventions_techniciens_technicienId ON interventions_techniciens(technicienId);

-- Index sur la table contrats
CREATE INDEX IF NOT EXISTS idx_contrats_artisanId ON contrats(artisanId);
CREATE INDEX IF NOT EXISTS idx_contrats_clientId ON contrats(clientId);
CREATE INDEX IF NOT EXISTS idx_contrats_statut ON contrats(statut);

-- Index sur la table avis_clients
CREATE INDEX IF NOT EXISTS idx_avis_clients_artisanId ON avis_clients(artisanId);
CREATE INDEX IF NOT EXISTS idx_avis_clients_clientId ON avis_clients(clientId);
CREATE INDEX IF NOT EXISTS idx_avis_clients_interventionId ON avis_clients(interventionId);

-- Index sur la table conversations
CREATE INDEX IF NOT EXISTS idx_conversations_artisanId ON conversations(artisanId);
CREATE INDEX IF NOT EXISTS idx_conversations_clientId ON conversations(clientId);

-- Index sur la table messages
CREATE INDEX IF NOT EXISTS idx_messages_conversationId ON messages(conversationId);
CREATE INDEX IF NOT EXISTS idx_messages_createdAt ON messages(createdAt);

-- Index sur la table vehicules
CREATE INDEX IF NOT EXISTS idx_vehicules_artisanId ON vehicules(artisanId);
CREATE INDEX IF NOT EXISTS idx_vehicules_immatriculation ON vehicules(immatriculation);

-- Index sur la table chantiers
CREATE INDEX IF NOT EXISTS idx_chantiers_artisanId ON chantiers(artisanId);
CREATE INDEX IF NOT EXISTS idx_chantiers_clientId ON chantiers(clientId);
CREATE INDEX IF NOT EXISTS idx_chantiers_statut ON chantiers(statut);
