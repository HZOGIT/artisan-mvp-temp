# 🧪 GUIDE DE TEST - ISOLATION MULTI-TENANT

**Durée estimée:** 30-45 minutes  
**Objectif:** Valider que chaque artisan ne peut accéder qu'à ses propres données

---

## 📋 PRÉREQUIS

✅ 2 comptes Manus de test :
- **Artisan A :** artisan-test-a@monartisan.fr
- **Artisan B :** artisan-test-b@monartisan.fr

✅ Accès à l'application : http://localhost:5173  
✅ Serveur de développement en cours d'exécution  
✅ Deux navigateurs ou deux onglets incognito

---

## 📊 TEMPLATE DE RAPPORT

Copier-coller ce template et le remplir au fur et à mesure :

```
# RAPPORT DE TEST - ISOLATION MULTI-TENANT

Date : _______________
Testeur : _______________

| Test | Résultat attendu | Résultat obtenu | Statut |
|------|------------------|-----------------|--------|
| 1. Clients | 403/404 | | ✅/❌ |
| 2. Devis | 403/404 | | ✅/❌ |
| 3. Factures | 403/404 | | ✅/❌ |
| 4. Interventions | 403/404 | | ✅/❌ |
| 5. Stocks | 403/404 | | ✅/❌ |
| 6. Fournisseurs | 403/404 | | ✅/❌ |
| 7. Accès Direct | 403/404 | | ✅/❌ |

Tous les tests passés ? ✅ OUI / ❌ NON
Prêt pour production ? ✅ OUI / ❌ NON
```

---

## 🔐 TEST 1 : ISOLATION DES CLIENTS

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**ARTISAN A :**

1. Se connecter avec **artisan-test-a@monartisan.fr**
2. Aller à la page "Clients"
3. Créer 3 clients :
   - **Client A-1** (email: client-a-1@test.fr)
   - **Client A-2** (email: client-a-2@test.fr)
   - **Client A-3** (email: client-a-3@test.fr)
4. **NOTER L'ID du premier client** dans l'URL
   - Exemple : `/clients/15` → ID = **15**
   - **ID Client A-1 :** _______________

✅ Vérification : Vous voyez 3 clients dans la liste

---

**ARTISAN B :**

5. Ouvrir un nouvel onglet/incognito
6. Se connecter avec **artisan-test-b@monartisan.fr**
7. Aller à la page "Clients"
8. Créer 2 clients :
   - **Client B-1** (email: client-b-1@test.fr)
   - **Client B-2** (email: client-b-2@test.fr)
9. **NOTER LES IDS :**
   - **ID Client B-1 :** _______________
   - **ID Client B-2 :** _______________

✅ Vérification : Les clients de A ne sont PAS visibles

---

**TEST D'ACCÈS CROISÉ :**

10. **Artisan B essaie d'accéder au client de A**
    - Accéder à : `http://localhost:5173/clients/[ID_CLIENT_A]`
    - Remplacer [ID_CLIENT_A] par l'ID noté à l'étape 4

**Résultat attendu :** ❌ Erreur 403 FORBIDDEN ou 404 NOT_FOUND  
**Résultat obtenu :** _______________  
**Statut :** ✅ PASS / ❌ FAIL

---

11. **Artisan A essaie d'accéder au client de B**
    - Retourner à l'onglet d'Artisan A
    - Accéder à : `http://localhost:5173/clients/[ID_CLIENT_B]`
    - Remplacer [ID_CLIENT_B] par l'ID noté à l'étape 9

**Résultat attendu :** ❌ Erreur 403 FORBIDDEN ou 404 NOT_FOUND  
**Résultat obtenu :** _______________  
**Statut :** ✅ PASS / ❌ FAIL

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

## 🔐 TEST 2 : ISOLATION DES DEVIS

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**ARTISAN A :**

1. Aller à la page "Devis"
2. Créer un devis :
   - **Client :** Client A-1
   - **Objet :** Devis Test A
   - **Montant :** 1000€
3. **NOTER L'ID :**
   - **ID Devis A :** _______________

---

**ARTISAN B :**

4. Aller à la page "Devis"
5. Créer un devis :
   - **Client :** Client B-1
   - **Objet :** Devis Test B
   - **Montant :** 2000€
6. **NOTER L'ID :**
   - **ID Devis B :** _______________

✅ Vérification : Le devis de A n'apparaît PAS dans la liste

---

**TEST D'ACCÈS CROISÉ :**

7. **Artisan B essaie d'accéder au devis de A**
   - Accéder à : `http://localhost:5173/devis/[ID_DEVIS_A]`

**Résultat attendu :** ❌ Erreur 403 FORBIDDEN ou 404 NOT_FOUND  
**Résultat obtenu :** _______________  
**Statut :** ✅ PASS / ❌ FAIL

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

## 🔐 TEST 3 : ISOLATION DES FACTURES

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**ARTISAN A :**

1. Aller à la page "Factures"
2. Créer une facture :
   - **Client :** Client A-1
   - **Objet :** Facture Test A
   - **Montant :** 1200€
3. **NOTER L'ID :**
   - **ID Facture A :** _______________

---

**ARTISAN B :**

4. Aller à la page "Factures"
5. Créer une facture :
   - **Client :** Client B-1
   - **Objet :** Facture Test B
   - **Montant :** 2400€
6. **NOTER L'ID :**
   - **ID Facture B :** _______________

✅ Vérification : La facture de A n'apparaît PAS

---

**TEST D'ACCÈS CROISÉ :**

7. **Artisan B essaie d'accéder à la facture de A**
   - Accéder à : `http://localhost:5173/factures/[ID_FACTURE_A]`

**Résultat attendu :** ❌ Erreur 403 FORBIDDEN ou 404 NOT_FOUND  
**Résultat obtenu :** _______________  
**Statut :** ✅ PASS / ❌ FAIL

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

## 🔐 TEST 4 : ISOLATION DES INTERVENTIONS

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**ARTISAN A :**

1. Aller à la page "Interventions"
2. Créer une intervention :
   - **Client :** Client A-1
   - **Titre :** Intervention Test A
   - **Date :** Demain
3. **NOTER L'ID :**
   - **ID Intervention A :** _______________

---

**ARTISAN B :**

4. Aller à la page "Interventions"
5. Créer une intervention :
   - **Client :** Client B-1
   - **Titre :** Intervention Test B
   - **Date :** Demain
6. **NOTER L'ID :**
   - **ID Intervention B :** _______________

✅ Vérification : L'intervention de A n'apparaît PAS

---

**TEST D'ACCÈS CROISÉ :**

7. **Artisan B essaie d'accéder à l'intervention de A**
   - Accéder à : `http://localhost:5173/interventions/[ID_INTERVENTION_A]`

**Résultat attendu :** ❌ Erreur 403 FORBIDDEN ou 404 NOT_FOUND  
**Résultat obtenu :** _______________  
**Statut :** ✅ PASS / ❌ FAIL

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

## 🔐 TEST 5 : ISOLATION DES STOCKS

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**ARTISAN A :**

1. Aller à la page "Stocks"
2. Créer un stock :
   - **Référence :** STOCK-A-001
   - **Désignation :** Stock Test A
   - **Quantité :** 100
3. **NOTER L'ID :**
   - **ID Stock A :** _______________

---

**ARTISAN B :**

4. Aller à la page "Stocks"
5. Créer un stock :
   - **Référence :** STOCK-B-001
   - **Désignation :** Stock Test B
   - **Quantité :** 200
6. **NOTER L'ID :**
   - **ID Stock B :** _______________

✅ Vérification : Le stock de A n'apparaît PAS

---

**TEST D'ACCÈS CROISÉ :**

7. **Artisan B essaie d'accéder au stock de A**
   - Accéder à : `http://localhost:5173/stocks/[ID_STOCK_A]`

**Résultat attendu :** ❌ Erreur 403 FORBIDDEN ou 404 NOT_FOUND  
**Résultat obtenu :** _______________  
**Statut :** ✅ PASS / ❌ FAIL

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

## 🔐 TEST 6 : ISOLATION DES FOURNISSEURS

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**ARTISAN A :**

1. Aller à la page "Fournisseurs"
2. Créer un fournisseur :
   - **Nom :** Fournisseur Test A
   - **Email :** fournisseur-a@test.fr
3. **NOTER L'ID :**
   - **ID Fournisseur A :** _______________

---

**ARTISAN B :**

4. Aller à la page "Fournisseurs"
5. Créer un fournisseur :
   - **Nom :** Fournisseur Test B
   - **Email :** fournisseur-b@test.fr
6. **NOTER L'ID :**
   - **ID Fournisseur B :** _______________

✅ Vérification : Le fournisseur de A n'apparaît PAS

---

**TEST D'ACCÈS CROISÉ :**

7. **Artisan B essaie d'accéder au fournisseur de A**
   - Accéder à : `http://localhost:5173/fournisseurs/[ID_FOURNISSEUR_A]`

**Résultat attendu :** ❌ Erreur 403 FORBIDDEN ou 404 NOT_FOUND  
**Résultat obtenu :** _______________  
**Statut :** ✅ PASS / ❌ FAIL

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

## 🔐 TEST 7 : TENTATIVES DE MODIFICATION/SUPPRESSION

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**ARTISAN B essaie de modifier le client de A :**

1. Accéder à : `http://localhost:5173/clients/[ID_CLIENT_A]/edit`

**Résultat attendu :** ❌ Erreur 403 FORBIDDEN ou formulaire n'apparaît pas  
**Résultat obtenu :** _______________  
**Statut :** ✅ PASS / ❌ FAIL

---

**ARTISAN B essaie de supprimer le client de A :**

2. Essayer de cliquer sur "Supprimer" (si accessible)

**Résultat attendu :** ❌ Erreur 403 FORBIDDEN ou suppression échoue  
**Résultat obtenu :** _______________  
**Statut :** ✅ PASS / ❌ FAIL

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

## ✅ RÉSUMÉ DES RÉSULTATS

| Test | Statut |
|------|--------|
| 1. Clients - Accès croisé A→B | ✅ / ❌ |
| 2. Clients - Accès croisé B→A | ✅ / ❌ |
| 3. Devis - Accès croisé B→A | ✅ / ❌ |
| 4. Factures - Accès croisé B→A | ✅ / ❌ |
| 5. Interventions - Accès croisé B→A | ✅ / ❌ |
| 6. Stocks - Accès croisé B→A | ✅ / ❌ |
| 7. Fournisseurs - Accès croisé B→A | ✅ / ❌ |
| 8. Modification - Tentative B sur A | ✅ / ❌ |
| 9. Suppression - Tentative B sur A | ✅ / ❌ |

---

## 🚦 CRITÈRES GO/NO-GO PRODUCTION

### ✅ GO PRODUCTION si :
- ✅ **TOUS les 9 tests passent** (statut ✅)
- ✅ **Aucun accès croisé** n'est possible
- ✅ **Les tentatives retournent 403 FORBIDDEN ou 404 NOT_FOUND**
- ✅ **Aucune erreur 500**

### ❌ NO-GO PRODUCTION si :
- ❌ **Un ou plusieurs tests échouent**
- ❌ **Un artisan peut accéder aux données d'un autre**
- ❌ **Des erreurs 500 apparaissent**
- ❌ **Un artisan peut modifier/supprimer les données d'un autre**

---

## 📝 RAPPORT FINAL

```
RÉSUMÉ EXÉCUTIF

Date du test : _______________
Testeur : _______________

Nombre de tests : 9
Tests réussis : ___ / 9
Tests échoués : ___ / 9

Taux de réussite : ___%

CONCLUSION :
Tous les tests passés ? ✅ OUI / ❌ NON
Prêt pour production ? ✅ OUI / ❌ NON

PROBLÈMES IDENTIFIÉS :
[Lister les problèmes trouvés]

RECOMMANDATIONS :
[Ajouter vos recommandations]
```

---

**Créé par:** Manus AI  
**Date:** 15 janvier 2026  
**Durée estimée:** 30-45 minutes  
**Version:** 1.0
