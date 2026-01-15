# 🧪 Guide de Test Manuel - Isolation Multi-Tenant

**Date:** 15 janvier 2026  
**Durée estimée:** 30-45 minutes  
**Objectif:** Valider l'isolation complète des données entre 2 artisans  
**Prérequis:** Accès à l'interface web + 2 comptes de test

---

## 📋 Prérequis

### Comptes de test requis
```
Artisan A : artisan-test-a@monartisan.fr
Artisan B : artisan-test-b@monartisan.fr
```

### Accès requis
- ✅ URL de l'application : http://localhost:5173 (ou domaine de production)
- ✅ Serveur de développement en cours d'exécution
- ✅ Base de données de test accessible

### Navigateur
- ✅ Deux onglets/fenêtres séparés (un par artisan)
- ✅ Ou utiliser le mode incognito pour chaque artisan

---

## 🚀 Préparation

### Étape 0 : Démarrer le serveur

```bash
cd /home/ubuntu/artisan-mvp-temp
pnpm dev
```

✅ Vérifier que le serveur démarre sans erreurs
✅ Accéder à http://localhost:5173

### Étape 1 : Créer les comptes de test

**Option A : Créer via l'interface**
1. Aller à http://localhost:5173
2. Cliquer sur "S'inscrire"
3. Créer le compte Artisan A : artisan-test-a@monartisan.fr
4. Créer le compte Artisan B : artisan-test-b@monartisan.fr

**Option B : Utiliser les comptes existants**
1. Si les comptes existent déjà, simplement se connecter

---

## 📊 Template de Rapport

Copier ce template et le remplir au fur et à mesure :

```markdown
# 📋 Rapport de Test - Isolation Multi-Tenant

Date du test : _______________
Testeur : _______________
Environnement : _______________

## Résultats

| Test | Scénario | Résultat attendu | Résultat obtenu | Statut |
|------|----------|------------------|-----------------|--------|
| 1 | Isolation Clients | FORBIDDEN/NOT_FOUND | | ✅/❌ |
| 2 | Isolation Devis | FORBIDDEN/NOT_FOUND | | ✅/❌ |
| 3 | Isolation Factures | FORBIDDEN/NOT_FOUND | | ✅/❌ |
| 4 | Isolation Interventions | FORBIDDEN/NOT_FOUND | | ✅/❌ |
| 5 | Isolation Stocks | FORBIDDEN/NOT_FOUND | | ✅/❌ |
| 6 | Isolation Fournisseurs | FORBIDDEN/NOT_FOUND | | ✅/❌ |
| 7 | Accès Direct par URL | FORBIDDEN/NOT_FOUND | | ✅/❌ |

## Observations

[Ajouter vos observations ici]

## Conclusion

Tous les tests passés ? ✅ OUI / ❌ NON

Prêt pour production ? ✅ OUI / ❌ NON
```

---

## 🔐 TEST 1 : Isolation des Clients

### Étape 1.1 : Artisan A crée 3 clients

**Actions :**
1. Se connecter avec **artisan-test-a@monartisan.fr**
2. Aller à la page "Clients"
3. Cliquer sur "Nouveau client"
4. Créer le client avec :
   - **Nom :** Client Test A-1
   - **Email :** client-a-1@test.fr
   - **Téléphone :** 0123456789
   - Cliquer sur "Créer"

5. **IMPORTANT :** Noter l'ID du client dans l'URL
   - Exemple : `/clients/15` → ID = 15
   - **ID Client A-1 :** _______________

6. Répéter pour créer 2 autres clients :
   - Client Test A-2 (email: client-a-2@test.fr)
   - Client Test A-3 (email: client-a-3@test.fr)

**Vérification :**
- ✅ Vous voyez 3 clients dans la liste
- ✅ Les IDs sont notés

---

### Étape 1.2 : Artisan B crée 2 clients

**Actions :**
1. **Ouvrir un nouvel onglet/fenêtre incognito**
2. Se connecter avec **artisan-test-b@monartisan.fr**
3. Aller à la page "Clients"
4. Créer 2 clients :
   - Client Test B-1 (email: client-b-1@test.fr)
   - Client Test B-2 (email: client-b-2@test.fr)

5. Noter les IDs :
   - **ID Client B-1 :** _______________
   - **ID Client B-2 :** _______________

**Vérification :**
- ✅ Vous voyez 2 clients dans la liste
- ✅ Les clients de A ne sont PAS visibles
- ✅ Les IDs sont notés

---

### Étape 1.3 : Artisan B essaie d'accéder au client de A

**Actions :**
1. Toujours connecté en tant que Artisan B
2. Dans la barre d'adresse, remplacer l'URL par :
   ```
   http://localhost:5173/clients/[ID_CLIENT_A]
   ```
   (Remplacer [ID_CLIENT_A] par l'ID noté à l'étape 1.1)

3. Appuyer sur Entrée

**Résultat attendu :**
- ❌ Erreur "Accès non autorisé" ou "Client non trouvé"
- ❌ Les données du client A ne s'affichent PAS

**Résultat obtenu :**
```
[Décrire ce que vous voyez]
```

**Statut :** ✅ PASS / ❌ FAIL

---

### Étape 1.4 : Artisan A essaie d'accéder au client de B

**Actions :**
1. Retourner à l'onglet/fenêtre d'Artisan A
2. Dans la barre d'adresse, remplacer l'URL par :
   ```
   http://localhost:5173/clients/[ID_CLIENT_B]
   ```
   (Remplacer [ID_CLIENT_B] par l'ID noté à l'étape 1.2)

3. Appuyer sur Entrée

**Résultat attendu :**
- ❌ Erreur "Accès non autorisé" ou "Client non trouvé"
- ❌ Les données du client B ne s'affichent PAS

**Résultat obtenu :**
```
[Décrire ce que vous voyez]
```

**Statut :** ✅ PASS / ❌ FAIL

---

## 🔐 TEST 2 : Isolation des Devis

### Étape 2.1 : Artisan A crée un devis

**Actions :**
1. Connecté en tant que Artisan A
2. Aller à la page "Devis"
3. Cliquer sur "Nouveau devis"
4. Créer un devis :
   - **Client :** Client Test A-1
   - **Objet :** Devis Test A
   - **Montant :** 1000€
   - Cliquer sur "Créer"

5. Noter l'ID du devis :
   - **ID Devis A :** _______________

**Vérification :**
- ✅ Le devis apparaît dans la liste

---

### Étape 2.2 : Artisan B crée un devis

**Actions :**
1. Connecté en tant que Artisan B
2. Aller à la page "Devis"
3. Créer un devis :
   - **Client :** Client Test B-1
   - **Objet :** Devis Test B
   - **Montant :** 2000€

4. Noter l'ID du devis :
   - **ID Devis B :** _______________

**Vérification :**
- ✅ Le devis de A n'apparaît PAS dans la liste
- ✅ Seul le devis de B est visible

---

### Étape 2.3 : Artisan B essaie d'accéder au devis de A

**Actions :**
1. Toujours connecté en tant que Artisan B
2. Accéder à :
   ```
   http://localhost:5173/devis/[ID_DEVIS_A]
   ```

**Résultat attendu :**
- ❌ Erreur "Accès non autorisé" ou "Devis non trouvé"

**Résultat obtenu :**
```
[Décrire ce que vous voyez]
```

**Statut :** ✅ PASS / ❌ FAIL

---

## 🔐 TEST 3 : Isolation des Factures

### Étape 3.1 : Artisan A crée une facture

**Actions :**
1. Connecté en tant que Artisan A
2. Aller à la page "Factures"
3. Cliquer sur "Nouvelle facture"
4. Créer une facture :
   - **Client :** Client Test A-1
   - **Objet :** Facture Test A
   - **Montant :** 1200€

5. Noter l'ID :
   - **ID Facture A :** _______________

---

### Étape 3.2 : Artisan B crée une facture

**Actions :**
1. Connecté en tant que Artisan B
2. Aller à la page "Factures"
3. Créer une facture :
   - **Client :** Client Test B-1
   - **Objet :** Facture Test B
   - **Montant :** 2400€

4. Noter l'ID :
   - **ID Facture B :** _______________

**Vérification :**
- ✅ La facture de A n'apparaît PAS

---

### Étape 3.3 : Artisan B essaie d'accéder à la facture de A

**Actions :**
1. Accéder à :
   ```
   http://localhost:5173/factures/[ID_FACTURE_A]
   ```

**Résultat attendu :**
- ❌ Erreur "Accès non autorisé"

**Résultat obtenu :**
```
[Décrire ce que vous voyez]
```

**Statut :** ✅ PASS / ❌ FAIL

---

## 🔐 TEST 4 : Isolation des Interventions

### Étape 4.1 : Artisan A crée une intervention

**Actions :**
1. Connecté en tant que Artisan A
2. Aller à la page "Interventions"
3. Cliquer sur "Nouvelle intervention"
4. Créer une intervention :
   - **Client :** Client Test A-1
   - **Titre :** Intervention Test A
   - **Date :** Demain
   - Cliquer sur "Créer"

5. Noter l'ID :
   - **ID Intervention A :** _______________

---

### Étape 4.2 : Artisan B essaie d'accéder à l'intervention de A

**Actions :**
1. Connecté en tant que Artisan B
2. Accéder à :
   ```
   http://localhost:5173/interventions/[ID_INTERVENTION_A]
   ```

**Résultat attendu :**
- ❌ Erreur "Accès non autorisé"

**Résultat obtenu :**
```
[Décrire ce que vous voyez]
```

**Statut :** ✅ PASS / ❌ FAIL

---

## 🔐 TEST 5 : Isolation des Stocks

### Étape 5.1 : Artisan A crée un stock

**Actions :**
1. Connecté en tant que Artisan A
2. Aller à la page "Stocks"
3. Cliquer sur "Nouveau stock"
4. Créer un stock :
   - **Référence :** STOCK-A-001
   - **Désignation :** Stock Test A
   - **Quantité :** 100
   - Cliquer sur "Créer"

5. Noter l'ID :
   - **ID Stock A :** _______________

---

### Étape 5.2 : Artisan B essaie d'accéder au stock de A

**Actions :**
1. Connecté en tant que Artisan B
2. Accéder à :
   ```
   http://localhost:5173/stocks/[ID_STOCK_A]
   ```

**Résultat attendu :**
- ❌ Erreur "Accès non autorisé"

**Résultat obtenu :**
```
[Décrire ce que vous voyez]
```

**Statut :** ✅ PASS / ❌ FAIL

---

## 🔐 TEST 6 : Isolation des Fournisseurs

### Étape 6.1 : Artisan A crée un fournisseur

**Actions :**
1. Connecté en tant que Artisan A
2. Aller à la page "Fournisseurs"
3. Cliquer sur "Nouveau fournisseur"
4. Créer un fournisseur :
   - **Nom :** Fournisseur Test A
   - **Email :** fournisseur-a@test.fr
   - Cliquer sur "Créer"

5. Noter l'ID :
   - **ID Fournisseur A :** _______________

---

### Étape 6.2 : Artisan B essaie d'accéder au fournisseur de A

**Actions :**
1. Connecté en tant que Artisan B
2. Accéder à :
   ```
   http://localhost:5173/fournisseurs/[ID_FOURNISSEUR_A]
   ```

**Résultat attendu :**
- ❌ Erreur "Accès non autorisé"

**Résultat obtenu :**
```
[Décrire ce que vous voyez]
```

**Statut :** ✅ PASS / ❌ FAIL

---

## 🔐 TEST 7 : Tentatives de Modification/Suppression

### Étape 7.1 : Artisan B essaie de modifier le client de A

**Actions :**
1. Connecté en tant que Artisan B
2. Accéder à :
   ```
   http://localhost:5173/clients/[ID_CLIENT_A]/edit
   ```

**Résultat attendu :**
- ❌ Erreur "Accès non autorisé"
- ❌ Le formulaire ne s'affiche pas

**Résultat obtenu :**
```
[Décrire ce que vous voyez]
```

**Statut :** ✅ PASS / ❌ FAIL

---

### Étape 7.2 : Artisan B essaie de supprimer le client de A

**Actions :**
1. Accéder au client de A (s'il est accessible)
2. Cliquer sur "Supprimer"

**Résultat attendu :**
- ❌ Erreur "Accès non autorisé"
- ❌ Le client n'est pas supprimé

**Résultat obtenu :**
```
[Décrire ce que vous voyez]
```

**Statut :** ✅ PASS / ❌ FAIL

---

## ✅ Résumé des Résultats

### Tableau récapitulatif

| Test | Statut |
|------|--------|
| 1.3 - Artisan B accès client A | ✅ / ❌ |
| 1.4 - Artisan A accès client B | ✅ / ❌ |
| 2.3 - Artisan B accès devis A | ✅ / ❌ |
| 3.3 - Artisan B accès facture A | ✅ / ❌ |
| 4.2 - Artisan B accès intervention A | ✅ / ❌ |
| 5.2 - Artisan B accès stock A | ✅ / ❌ |
| 6.2 - Artisan B accès fournisseur A | ✅ / ❌ |
| 7.1 - Artisan B modifie client A | ✅ / ❌ |
| 7.2 - Artisan B supprime client A | ✅ / ❌ |

---

## 🚦 Critères GO/NO-GO Production

### ✅ GO PRODUCTION si :
- ✅ **TOUS les 9 tests passent** (statut ✅)
- ✅ **Aucun accès croisé** n'est possible
- ✅ **Les tentatives d'accès non autorisé retournent des erreurs**
- ✅ **Les données sont complètement isolées**

### ❌ NO-GO PRODUCTION si :
- ❌ **Un ou plusieurs tests échouent**
- ❌ **Un artisan peut accéder aux données d'un autre**
- ❌ **Un artisan peut modifier/supprimer les données d'un autre**
- ❌ **Des erreurs 500 apparaissent au lieu de 403/404**

---

## 📝 Rapport Final

### Résumé exécutif

```
Date du test : _______________
Testeur : _______________
Environnement : _______________

Nombre de tests : 9
Tests réussis : ___ / 9
Tests échoués : ___ / 9

Taux de réussite : ___%
```

### Conclusion

**Tous les tests passés ?**
- ✅ OUI → Prêt pour production
- ❌ NON → Problèmes à corriger

**Problèmes identifiés :**
```
[Lister les problèmes trouvés]
```

**Recommandations :**
```
[Ajouter vos recommandations]
```

---

## 🆘 Dépannage

### Problème : Erreur 500 au lieu de 403/404

**Cause probable :** Serveur en erreur  
**Solution :**
1. Vérifier les logs du serveur : `pnpm dev`
2. Redémarrer le serveur
3. Vérifier la base de données

### Problème : Impossible de se connecter

**Cause probable :** Compte non créé  
**Solution :**
1. Créer les comptes via l'interface d'inscription
2. Vérifier les identifiants
3. Vérifier que le serveur OAuth fonctionne

### Problème : Les données de A sont visibles pour B

**Cause probable :** Isolation multi-tenant non implémentée  
**Solution :**
1. Vérifier que les fonctions sécurisées de db-secure.ts sont utilisées
2. Vérifier que chaque requête inclut la vérification d'artisanId
3. Consulter CORRECTIONS_SECURITE_AUDIT.md

---

## 📞 Support

Pour toute question ou problème :
1. Consulter RAPPORT_SECURITE_FINAL.md
2. Consulter CORRECTIONS_SECURITE_AUDIT.md
3. Vérifier les logs du serveur
4. Contacter l'équipe de développement

---

**Créé par:** Manus AI  
**Date:** 15 janvier 2026  
**Version:** 1.0  
**Durée estimée:** 30-45 minutes
