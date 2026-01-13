import mysql from 'mysql2/promise';

const articles = [
  // PLOMBERIE - 100 articles
  // Tuyauterie et raccords
  { reference: "PLB-001", designation: "Tube cuivre 12mm - 1m", description: "Tube cuivre écroui diamètre 12mm, longueur 1 mètre", categorie: "plomberie", unite: "mètre", prixUnitaireHT: "8.50" },
  { reference: "PLB-002", designation: "Tube cuivre 14mm - 1m", description: "Tube cuivre écroui diamètre 14mm, longueur 1 mètre", categorie: "plomberie", unite: "mètre", prixUnitaireHT: "10.20" },
  { reference: "PLB-003", designation: "Tube cuivre 16mm - 1m", description: "Tube cuivre écroui diamètre 16mm, longueur 1 mètre", categorie: "plomberie", unite: "mètre", prixUnitaireHT: "12.80" },
  { reference: "PLB-004", designation: "Tube cuivre 18mm - 1m", description: "Tube cuivre écroui diamètre 18mm, longueur 1 mètre", categorie: "plomberie", unite: "mètre", prixUnitaireHT: "14.50" },
  { reference: "PLB-005", designation: "Tube cuivre 22mm - 1m", description: "Tube cuivre écroui diamètre 22mm, longueur 1 mètre", categorie: "plomberie", unite: "mètre", prixUnitaireHT: "18.90" },
  { reference: "PLB-006", designation: "Tube PER 12mm - 1m", description: "Tube PER gainé diamètre 12mm, longueur 1 mètre", categorie: "plomberie", unite: "mètre", prixUnitaireHT: "2.80" },
  { reference: "PLB-007", designation: "Tube PER 16mm - 1m", description: "Tube PER gainé diamètre 16mm, longueur 1 mètre", categorie: "plomberie", unite: "mètre", prixUnitaireHT: "3.50" },
  { reference: "PLB-008", designation: "Tube PER 20mm - 1m", description: "Tube PER gainé diamètre 20mm, longueur 1 mètre", categorie: "plomberie", unite: "mètre", prixUnitaireHT: "4.80" },
  { reference: "PLB-009", designation: "Tube multicouche 16mm - 1m", description: "Tube multicouche diamètre 16mm, longueur 1 mètre", categorie: "plomberie", unite: "mètre", prixUnitaireHT: "4.20" },
  { reference: "PLB-010", designation: "Tube multicouche 20mm - 1m", description: "Tube multicouche diamètre 20mm, longueur 1 mètre", categorie: "plomberie", unite: "mètre", prixUnitaireHT: "5.80" },
  { reference: "PLB-011", designation: "Raccord laiton 12mm", description: "Raccord droit laiton diamètre 12mm", categorie: "plomberie", unite: "unité", prixUnitaireHT: "3.20" },
  { reference: "PLB-012", designation: "Raccord laiton 16mm", description: "Raccord droit laiton diamètre 16mm", categorie: "plomberie", unite: "unité", prixUnitaireHT: "4.50" },
  { reference: "PLB-013", designation: "Coude cuivre 90° 12mm", description: "Coude à souder 90 degrés diamètre 12mm", categorie: "plomberie", unite: "unité", prixUnitaireHT: "1.80" },
  { reference: "PLB-014", designation: "Coude cuivre 90° 16mm", description: "Coude à souder 90 degrés diamètre 16mm", categorie: "plomberie", unite: "unité", prixUnitaireHT: "2.40" },
  { reference: "PLB-015", designation: "Té cuivre 12mm", description: "Té à souder diamètre 12mm", categorie: "plomberie", unite: "unité", prixUnitaireHT: "2.80" },
  { reference: "PLB-016", designation: "Té cuivre 16mm", description: "Té à souder diamètre 16mm", categorie: "plomberie", unite: "unité", prixUnitaireHT: "3.60" },
  { reference: "PLB-017", designation: "Manchon cuivre 12mm", description: "Manchon à souder diamètre 12mm", categorie: "plomberie", unite: "unité", prixUnitaireHT: "1.20" },
  { reference: "PLB-018", designation: "Manchon cuivre 16mm", description: "Manchon à souder diamètre 16mm", categorie: "plomberie", unite: "unité", prixUnitaireHT: "1.60" },
  { reference: "PLB-019", designation: "Réduction cuivre 16/12", description: "Réduction à souder 16mm vers 12mm", categorie: "plomberie", unite: "unité", prixUnitaireHT: "2.20" },
  { reference: "PLB-020", designation: "Réduction cuivre 22/16", description: "Réduction à souder 22mm vers 16mm", categorie: "plomberie", unite: "unité", prixUnitaireHT: "3.40" },
  // Robinetterie
  { reference: "PLB-021", designation: "Robinet d'arrêt 1/2\"", description: "Robinet d'arrêt à boisseau sphérique 1/2 pouce", categorie: "plomberie", unite: "unité", prixUnitaireHT: "12.50" },
  { reference: "PLB-022", designation: "Robinet d'arrêt 3/4\"", description: "Robinet d'arrêt à boisseau sphérique 3/4 pouce", categorie: "plomberie", unite: "unité", prixUnitaireHT: "18.90" },
  { reference: "PLB-023", designation: "Vanne à sphère 1\"", description: "Vanne à boisseau sphérique 1 pouce", categorie: "plomberie", unite: "unité", prixUnitaireHT: "28.50" },
  { reference: "PLB-024", designation: "Robinet de puisage 1/2\"", description: "Robinet de puisage extérieur 1/2 pouce", categorie: "plomberie", unite: "unité", prixUnitaireHT: "15.80" },
  { reference: "PLB-025", designation: "Robinet flotteur WC", description: "Robinet flotteur universel pour WC", categorie: "plomberie", unite: "unité", prixUnitaireHT: "22.50" },
  { reference: "PLB-026", designation: "Mitigeur lavabo", description: "Mitigeur monocommande pour lavabo", categorie: "plomberie", unite: "unité", prixUnitaireHT: "45.00" },
  { reference: "PLB-027", designation: "Mitigeur évier", description: "Mitigeur monocommande pour évier de cuisine", categorie: "plomberie", unite: "unité", prixUnitaireHT: "55.00" },
  { reference: "PLB-028", designation: "Mitigeur douche", description: "Mitigeur thermostatique de douche", categorie: "plomberie", unite: "unité", prixUnitaireHT: "120.00" },
  { reference: "PLB-029", designation: "Mitigeur baignoire", description: "Mitigeur thermostatique de baignoire", categorie: "plomberie", unite: "unité", prixUnitaireHT: "145.00" },
  { reference: "PLB-030", designation: "Colonne de douche", description: "Colonne de douche thermostatique avec douchette", categorie: "plomberie", unite: "unité", prixUnitaireHT: "189.00" },
  // Évacuation
  { reference: "PLB-031", designation: "Tube PVC 32mm - 1m", description: "Tube PVC évacuation diamètre 32mm", categorie: "plomberie", unite: "mètre", prixUnitaireHT: "3.20" },
  { reference: "PLB-032", designation: "Tube PVC 40mm - 1m", description: "Tube PVC évacuation diamètre 40mm", categorie: "plomberie", unite: "mètre", prixUnitaireHT: "4.50" },
  { reference: "PLB-033", designation: "Tube PVC 50mm - 1m", description: "Tube PVC évacuation diamètre 50mm", categorie: "plomberie", unite: "mètre", prixUnitaireHT: "5.80" },
  { reference: "PLB-034", designation: "Tube PVC 100mm - 1m", description: "Tube PVC évacuation diamètre 100mm", categorie: "plomberie", unite: "mètre", prixUnitaireHT: "8.90" },
  { reference: "PLB-035", designation: "Coude PVC 87° 40mm", description: "Coude PVC 87 degrés diamètre 40mm", categorie: "plomberie", unite: "unité", prixUnitaireHT: "2.80" },
  { reference: "PLB-036", designation: "Coude PVC 45° 40mm", description: "Coude PVC 45 degrés diamètre 40mm", categorie: "plomberie", unite: "unité", prixUnitaireHT: "2.40" },
  { reference: "PLB-037", designation: "Té PVC 40mm", description: "Té PVC diamètre 40mm", categorie: "plomberie", unite: "unité", prixUnitaireHT: "3.60" },
  { reference: "PLB-038", designation: "Culotte PVC 100/40", description: "Culotte de branchement PVC 100mm vers 40mm", categorie: "plomberie", unite: "unité", prixUnitaireHT: "8.50" },
  { reference: "PLB-039", designation: "Siphon lavabo", description: "Siphon à culot pour lavabo", categorie: "plomberie", unite: "unité", prixUnitaireHT: "12.50" },
  { reference: "PLB-040", designation: "Siphon évier", description: "Siphon à culot pour évier", categorie: "plomberie", unite: "unité", prixUnitaireHT: "15.80" },
  // Sanitaires
  { reference: "PLB-041", designation: "WC complet", description: "Pack WC complet avec abattant et mécanisme", categorie: "plomberie", unite: "unité", prixUnitaireHT: "189.00" },
  { reference: "PLB-042", designation: "WC suspendu", description: "Cuvette WC suspendue sans bâti", categorie: "plomberie", unite: "unité", prixUnitaireHT: "245.00" },
  { reference: "PLB-043", designation: "Bâti-support WC", description: "Bâti-support pour WC suspendu", categorie: "plomberie", unite: "unité", prixUnitaireHT: "320.00" },
  { reference: "PLB-044", designation: "Lavabo céramique", description: "Lavabo céramique blanc 60cm", categorie: "plomberie", unite: "unité", prixUnitaireHT: "85.00" },
  { reference: "PLB-045", designation: "Vasque à poser", description: "Vasque à poser céramique ronde", categorie: "plomberie", unite: "unité", prixUnitaireHT: "120.00" },
  { reference: "PLB-046", designation: "Évier inox 1 bac", description: "Évier inox 1 bac à encastrer", categorie: "plomberie", unite: "unité", prixUnitaireHT: "95.00" },
  { reference: "PLB-047", designation: "Évier inox 2 bacs", description: "Évier inox 2 bacs à encastrer", categorie: "plomberie", unite: "unité", prixUnitaireHT: "145.00" },
  { reference: "PLB-048", designation: "Receveur douche 80x80", description: "Receveur de douche acrylique 80x80cm", categorie: "plomberie", unite: "unité", prixUnitaireHT: "125.00" },
  { reference: "PLB-049", designation: "Receveur douche 90x90", description: "Receveur de douche acrylique 90x90cm", categorie: "plomberie", unite: "unité", prixUnitaireHT: "145.00" },
  { reference: "PLB-050", designation: "Baignoire acrylique 170", description: "Baignoire acrylique 170x70cm", categorie: "plomberie", unite: "unité", prixUnitaireHT: "280.00" },
  // Chauffe-eau et accessoires
  { reference: "PLB-051", designation: "Chauffe-eau 100L", description: "Chauffe-eau électrique vertical 100 litres", categorie: "plomberie", unite: "unité", prixUnitaireHT: "320.00" },
  { reference: "PLB-052", designation: "Chauffe-eau 150L", description: "Chauffe-eau électrique vertical 150 litres", categorie: "plomberie", unite: "unité", prixUnitaireHT: "420.00" },
  { reference: "PLB-053", designation: "Chauffe-eau 200L", description: "Chauffe-eau électrique vertical 200 litres", categorie: "plomberie", unite: "unité", prixUnitaireHT: "520.00" },
  { reference: "PLB-054", designation: "Groupe de sécurité", description: "Groupe de sécurité pour chauffe-eau", categorie: "plomberie", unite: "unité", prixUnitaireHT: "28.50" },
  { reference: "PLB-055", designation: "Réducteur de pression", description: "Réducteur de pression réglable", categorie: "plomberie", unite: "unité", prixUnitaireHT: "45.00" },
  { reference: "PLB-056", designation: "Vase d'expansion 8L", description: "Vase d'expansion sanitaire 8 litres", categorie: "plomberie", unite: "unité", prixUnitaireHT: "35.00" },
  { reference: "PLB-057", designation: "Flexible inox 50cm", description: "Flexible inox pour alimentation 50cm", categorie: "plomberie", unite: "unité", prixUnitaireHT: "8.50" },
  { reference: "PLB-058", designation: "Flexible inox 80cm", description: "Flexible inox pour alimentation 80cm", categorie: "plomberie", unite: "unité", prixUnitaireHT: "10.50" },
  { reference: "PLB-059", designation: "Clapet anti-retour 1/2\"", description: "Clapet anti-retour laiton 1/2 pouce", categorie: "plomberie", unite: "unité", prixUnitaireHT: "12.80" },
  { reference: "PLB-060", designation: "Clapet anti-retour 3/4\"", description: "Clapet anti-retour laiton 3/4 pouce", categorie: "plomberie", unite: "unité", prixUnitaireHT: "18.50" },
  // Consommables et accessoires
  { reference: "PLB-061", designation: "Téflon rouleau", description: "Ruban téflon 12m pour étanchéité", categorie: "plomberie", unite: "unité", prixUnitaireHT: "1.50" },
  { reference: "PLB-062", designation: "Filasse 100g", description: "Filasse de chanvre 100 grammes", categorie: "plomberie", unite: "unité", prixUnitaireHT: "4.80" },
  { reference: "PLB-063", designation: "Pâte à joint", description: "Pâte à joint pour raccords filetés", categorie: "plomberie", unite: "unité", prixUnitaireHT: "8.50" },
  { reference: "PLB-064", designation: "Colle PVC 250ml", description: "Colle pour tubes et raccords PVC", categorie: "plomberie", unite: "unité", prixUnitaireHT: "12.50" },
  { reference: "PLB-065", designation: "Décapant cuivre", description: "Décapant pour brasure cuivre", categorie: "plomberie", unite: "unité", prixUnitaireHT: "6.80" },
  { reference: "PLB-066", designation: "Brasure étain", description: "Fil de brasure étain 250g", categorie: "plomberie", unite: "unité", prixUnitaireHT: "18.50" },
  { reference: "PLB-067", designation: "Collier isophonique 32mm", description: "Collier de fixation isophonique diamètre 32mm", categorie: "plomberie", unite: "unité", prixUnitaireHT: "2.80" },
  { reference: "PLB-068", designation: "Collier isophonique 40mm", description: "Collier de fixation isophonique diamètre 40mm", categorie: "plomberie", unite: "unité", prixUnitaireHT: "3.20" },
  { reference: "PLB-069", designation: "Collier atlas 16mm", description: "Collier de fixation atlas diamètre 16mm", categorie: "plomberie", unite: "unité", prixUnitaireHT: "0.80" },
  { reference: "PLB-070", designation: "Collier atlas 22mm", description: "Collier de fixation atlas diamètre 22mm", categorie: "plomberie", unite: "unité", prixUnitaireHT: "1.00" },
  // Pompes et circulateurs
  { reference: "PLB-071", designation: "Pompe de relevage", description: "Pompe de relevage eaux usées", categorie: "plomberie", unite: "unité", prixUnitaireHT: "280.00" },
  { reference: "PLB-072", designation: "Circulateur chauffage", description: "Circulateur pour circuit de chauffage", categorie: "plomberie", unite: "unité", prixUnitaireHT: "185.00" },
  { reference: "PLB-073", designation: "Pompe à eau", description: "Pompe à eau de surface", categorie: "plomberie", unite: "unité", prixUnitaireHT: "220.00" },
  { reference: "PLB-074", designation: "Surpresseur", description: "Groupe surpresseur avec réservoir", categorie: "plomberie", unite: "unité", prixUnitaireHT: "380.00" },
  { reference: "PLB-075", designation: "Pompe à chaleur", description: "Pompe à chaleur air/eau", categorie: "plomberie", unite: "unité", prixUnitaireHT: "4500.00" },
  // Accessoires WC
  { reference: "PLB-076", designation: "Mécanisme WC complet", description: "Mécanisme de chasse complet universel", categorie: "plomberie", unite: "unité", prixUnitaireHT: "35.00" },
  { reference: "PLB-077", designation: "Abattant WC standard", description: "Abattant WC blanc standard", categorie: "plomberie", unite: "unité", prixUnitaireHT: "25.00" },
  { reference: "PLB-078", designation: "Abattant WC soft close", description: "Abattant WC avec frein de chute", categorie: "plomberie", unite: "unité", prixUnitaireHT: "45.00" },
  { reference: "PLB-079", designation: "Joint de cuvette", description: "Joint d'étanchéité pour cuvette WC", categorie: "plomberie", unite: "unité", prixUnitaireHT: "8.50" },
  { reference: "PLB-080", designation: "Pipe WC droite", description: "Pipe de raccordement WC droite", categorie: "plomberie", unite: "unité", prixUnitaireHT: "12.50" },
  // Filtration
  { reference: "PLB-081", designation: "Filtre à eau 9\"", description: "Porte-filtre à eau 9 pouces", categorie: "plomberie", unite: "unité", prixUnitaireHT: "45.00" },
  { reference: "PLB-082", designation: "Cartouche filtrante", description: "Cartouche filtrante 20 microns", categorie: "plomberie", unite: "unité", prixUnitaireHT: "12.50" },
  { reference: "PLB-083", designation: "Adoucisseur 15L", description: "Adoucisseur d'eau 15 litres", categorie: "plomberie", unite: "unité", prixUnitaireHT: "650.00" },
  { reference: "PLB-084", designation: "Sel adoucisseur 25kg", description: "Sac de sel pour adoucisseur 25kg", categorie: "plomberie", unite: "unité", prixUnitaireHT: "12.50" },
  { reference: "PLB-085", designation: "Anticalcaire magnétique", description: "Anticalcaire magnétique pour canalisation", categorie: "plomberie", unite: "unité", prixUnitaireHT: "85.00" },
  // Divers plomberie
  { reference: "PLB-086", designation: "Bonde lavabo", description: "Bonde à clapet pour lavabo", categorie: "plomberie", unite: "unité", prixUnitaireHT: "15.00" },
  { reference: "PLB-087", designation: "Bonde douche", description: "Bonde de douche extra-plate", categorie: "plomberie", unite: "unité", prixUnitaireHT: "35.00" },
  { reference: "PLB-088", designation: "Grille d'aération", description: "Grille d'aération PVC 100mm", categorie: "plomberie", unite: "unité", prixUnitaireHT: "8.50" },
  { reference: "PLB-089", designation: "Ventouse WC", description: "Ventouse déboucheur WC", categorie: "plomberie", unite: "unité", prixUnitaireHT: "8.00" },
  { reference: "PLB-090", designation: "Furet déboucheur 5m", description: "Furet déboucheur spirale 5 mètres", categorie: "plomberie", unite: "unité", prixUnitaireHT: "25.00" },
  { reference: "PLB-091", designation: "Déboucheur chimique", description: "Déboucheur chimique 1 litre", categorie: "plomberie", unite: "unité", prixUnitaireHT: "12.00" },
  { reference: "PLB-092", designation: "Mastic sanitaire", description: "Mastic silicone sanitaire blanc", categorie: "plomberie", unite: "unité", prixUnitaireHT: "8.50" },
  { reference: "PLB-093", designation: "Joint torique lot", description: "Lot de joints toriques assortis", categorie: "plomberie", unite: "lot", prixUnitaireHT: "15.00" },
  { reference: "PLB-094", designation: "Joint fibre lot", description: "Lot de joints fibre assortis", categorie: "plomberie", unite: "lot", prixUnitaireHT: "12.00" },
  { reference: "PLB-095", designation: "Rosace chromée 1/2\"", description: "Rosace chromée cache-tuyau 1/2 pouce", categorie: "plomberie", unite: "unité", prixUnitaireHT: "3.50" },
  { reference: "PLB-096", designation: "Manchette souple", description: "Manchette souple de raccordement", categorie: "plomberie", unite: "unité", prixUnitaireHT: "8.50" },
  { reference: "PLB-097", designation: "Tampon de visite", description: "Tampon de visite PVC 100mm", categorie: "plomberie", unite: "unité", prixUnitaireHT: "12.50" },
  { reference: "PLB-098", designation: "Regard PVC 30x30", description: "Regard de visite PVC 30x30cm", categorie: "plomberie", unite: "unité", prixUnitaireHT: "45.00" },
  { reference: "PLB-099", designation: "Compteur d'eau", description: "Compteur d'eau divisionnaire", categorie: "plomberie", unite: "unité", prixUnitaireHT: "85.00" },
  { reference: "PLB-100", designation: "Détecteur de fuite", description: "Détecteur de fuite d'eau électronique", categorie: "plomberie", unite: "unité", prixUnitaireHT: "45.00" },

  // ÉLECTRICITÉ - 150 articles
  // Câbles et fils
  { reference: "ELE-001", designation: "Fil H07VU 1.5mm² bleu - 100m", description: "Fil rigide H07VU 1.5mm² bleu, couronne 100m", categorie: "electricite", unite: "couronne", prixUnitaireHT: "28.00" },
  { reference: "ELE-002", designation: "Fil H07VU 1.5mm² rouge - 100m", description: "Fil rigide H07VU 1.5mm² rouge, couronne 100m", categorie: "electricite", unite: "couronne", prixUnitaireHT: "28.00" },
  { reference: "ELE-003", designation: "Fil H07VU 1.5mm² vert/jaune - 100m", description: "Fil rigide H07VU 1.5mm² vert/jaune terre, couronne 100m", categorie: "electricite", unite: "couronne", prixUnitaireHT: "28.00" },
  { reference: "ELE-004", designation: "Fil H07VU 2.5mm² bleu - 100m", description: "Fil rigide H07VU 2.5mm² bleu, couronne 100m", categorie: "electricite", unite: "couronne", prixUnitaireHT: "45.00" },
  { reference: "ELE-005", designation: "Fil H07VU 2.5mm² rouge - 100m", description: "Fil rigide H07VU 2.5mm² rouge, couronne 100m", categorie: "electricite", unite: "couronne", prixUnitaireHT: "45.00" },
  { reference: "ELE-006", designation: "Fil H07VU 2.5mm² vert/jaune - 100m", description: "Fil rigide H07VU 2.5mm² vert/jaune terre, couronne 100m", categorie: "electricite", unite: "couronne", prixUnitaireHT: "45.00" },
  { reference: "ELE-007", designation: "Câble R2V 3G1.5 - 50m", description: "Câble R2V 3x1.5mm², couronne 50m", categorie: "electricite", unite: "couronne", prixUnitaireHT: "65.00" },
  { reference: "ELE-008", designation: "Câble R2V 3G2.5 - 50m", description: "Câble R2V 3x2.5mm², couronne 50m", categorie: "electricite", unite: "couronne", prixUnitaireHT: "95.00" },
  { reference: "ELE-009", designation: "Câble R2V 5G1.5 - 50m", description: "Câble R2V 5x1.5mm², couronne 50m", categorie: "electricite", unite: "couronne", prixUnitaireHT: "110.00" },
  { reference: "ELE-010", designation: "Câble R2V 5G2.5 - 50m", description: "Câble R2V 5x2.5mm², couronne 50m", categorie: "electricite", unite: "couronne", prixUnitaireHT: "165.00" },
  { reference: "ELE-011", designation: "Câble R2V 3G6 - 25m", description: "Câble R2V 3x6mm², couronne 25m", categorie: "electricite", unite: "couronne", prixUnitaireHT: "125.00" },
  { reference: "ELE-012", designation: "Câble R2V 3G10 - 25m", description: "Câble R2V 3x10mm², couronne 25m", categorie: "electricite", unite: "couronne", prixUnitaireHT: "185.00" },
  { reference: "ELE-013", designation: "Câble souple H07RNF 3G1.5 - 25m", description: "Câble souple H07RNF 3x1.5mm², couronne 25m", categorie: "electricite", unite: "couronne", prixUnitaireHT: "85.00" },
  { reference: "ELE-014", designation: "Câble souple H07RNF 3G2.5 - 25m", description: "Câble souple H07RNF 3x2.5mm², couronne 25m", categorie: "electricite", unite: "couronne", prixUnitaireHT: "125.00" },
  { reference: "ELE-015", designation: "Câble téléphone 4 paires - 100m", description: "Câble téléphone 4 paires, couronne 100m", categorie: "electricite", unite: "couronne", prixUnitaireHT: "45.00" },
  { reference: "ELE-016", designation: "Câble RJ45 Cat6 - 100m", description: "Câble réseau RJ45 catégorie 6, couronne 100m", categorie: "electricite", unite: "couronne", prixUnitaireHT: "85.00" },
  { reference: "ELE-017", designation: "Câble coaxial TV - 25m", description: "Câble coaxial 17 VATC pour TV, couronne 25m", categorie: "electricite", unite: "couronne", prixUnitaireHT: "35.00" },
  { reference: "ELE-018", designation: "Gaine ICTA 16mm - 100m", description: "Gaine ICTA diamètre 16mm, couronne 100m", categorie: "electricite", unite: "couronne", prixUnitaireHT: "25.00" },
  { reference: "ELE-019", designation: "Gaine ICTA 20mm - 100m", description: "Gaine ICTA diamètre 20mm, couronne 100m", categorie: "electricite", unite: "couronne", prixUnitaireHT: "32.00" },
  { reference: "ELE-020", designation: "Gaine ICTA 25mm - 100m", description: "Gaine ICTA diamètre 25mm, couronne 100m", categorie: "electricite", unite: "couronne", prixUnitaireHT: "42.00" },
  // Appareillage
  { reference: "ELE-021", designation: "Interrupteur simple", description: "Interrupteur va-et-vient encastrable blanc", categorie: "electricite", unite: "unité", prixUnitaireHT: "5.50" },
  { reference: "ELE-022", designation: "Interrupteur double", description: "Double interrupteur va-et-vient encastrable blanc", categorie: "electricite", unite: "unité", prixUnitaireHT: "9.80" },
  { reference: "ELE-023", designation: "Bouton poussoir", description: "Bouton poussoir encastrable blanc", categorie: "electricite", unite: "unité", prixUnitaireHT: "6.50" },
  { reference: "ELE-024", designation: "Prise 2P+T 16A", description: "Prise de courant 2P+T 16A encastrable blanc", categorie: "electricite", unite: "unité", prixUnitaireHT: "4.80" },
  { reference: "ELE-025", designation: "Prise double 2P+T 16A", description: "Double prise de courant 2P+T 16A encastrable blanc", categorie: "electricite", unite: "unité", prixUnitaireHT: "12.50" },
  { reference: "ELE-026", designation: "Prise TV", description: "Prise TV coaxiale encastrable blanc", categorie: "electricite", unite: "unité", prixUnitaireHT: "8.50" },
  { reference: "ELE-027", designation: "Prise RJ45", description: "Prise RJ45 Cat6 encastrable blanc", categorie: "electricite", unite: "unité", prixUnitaireHT: "15.00" },
  { reference: "ELE-028", designation: "Prise téléphone", description: "Prise téléphone T encastrable blanc", categorie: "electricite", unite: "unité", prixUnitaireHT: "6.50" },
  { reference: "ELE-029", designation: "Variateur de lumière", description: "Variateur rotatif 300W encastrable blanc", categorie: "electricite", unite: "unité", prixUnitaireHT: "25.00" },
  { reference: "ELE-030", designation: "Détecteur de mouvement", description: "Détecteur de mouvement encastrable", categorie: "electricite", unite: "unité", prixUnitaireHT: "35.00" },
  { reference: "ELE-031", designation: "Interrupteur horaire", description: "Interrupteur horaire programmable", categorie: "electricite", unite: "unité", prixUnitaireHT: "45.00" },
  { reference: "ELE-032", designation: "Minuterie", description: "Minuterie d'escalier modulaire", categorie: "electricite", unite: "unité", prixUnitaireHT: "28.00" },
  { reference: "ELE-033", designation: "Télérupteur", description: "Télérupteur unipolaire 16A", categorie: "electricite", unite: "unité", prixUnitaireHT: "22.00" },
  { reference: "ELE-034", designation: "Contacteur jour/nuit", description: "Contacteur heures creuses 20A", categorie: "electricite", unite: "unité", prixUnitaireHT: "35.00" },
  { reference: "ELE-035", designation: "Sonnette", description: "Carillon électrique 230V", categorie: "electricite", unite: "unité", prixUnitaireHT: "18.00" },
  // Tableaux et protection
  { reference: "ELE-036", designation: "Tableau 1 rangée", description: "Tableau électrique 1 rangée 13 modules", categorie: "electricite", unite: "unité", prixUnitaireHT: "25.00" },
  { reference: "ELE-037", designation: "Tableau 2 rangées", description: "Tableau électrique 2 rangées 26 modules", categorie: "electricite", unite: "unité", prixUnitaireHT: "45.00" },
  { reference: "ELE-038", designation: "Tableau 3 rangées", description: "Tableau électrique 3 rangées 39 modules", categorie: "electricite", unite: "unité", prixUnitaireHT: "65.00" },
  { reference: "ELE-039", designation: "Tableau 4 rangées", description: "Tableau électrique 4 rangées 52 modules", categorie: "electricite", unite: "unité", prixUnitaireHT: "85.00" },
  { reference: "ELE-040", designation: "Disjoncteur 10A", description: "Disjoncteur divisionnaire 10A courbe C", categorie: "electricite", unite: "unité", prixUnitaireHT: "8.50" },
  { reference: "ELE-041", designation: "Disjoncteur 16A", description: "Disjoncteur divisionnaire 16A courbe C", categorie: "electricite", unite: "unité", prixUnitaireHT: "8.50" },
  { reference: "ELE-042", designation: "Disjoncteur 20A", description: "Disjoncteur divisionnaire 20A courbe C", categorie: "electricite", unite: "unité", prixUnitaireHT: "9.50" },
  { reference: "ELE-043", designation: "Disjoncteur 32A", description: "Disjoncteur divisionnaire 32A courbe C", categorie: "electricite", unite: "unité", prixUnitaireHT: "12.50" },
  { reference: "ELE-044", designation: "Interrupteur diff. 40A 30mA AC", description: "Interrupteur différentiel 40A 30mA type AC", categorie: "electricite", unite: "unité", prixUnitaireHT: "45.00" },
  { reference: "ELE-045", designation: "Interrupteur diff. 40A 30mA A", description: "Interrupteur différentiel 40A 30mA type A", categorie: "electricite", unite: "unité", prixUnitaireHT: "65.00" },
  { reference: "ELE-046", designation: "Interrupteur diff. 63A 30mA AC", description: "Interrupteur différentiel 63A 30mA type AC", categorie: "electricite", unite: "unité", prixUnitaireHT: "55.00" },
  { reference: "ELE-047", designation: "Interrupteur diff. 63A 30mA A", description: "Interrupteur différentiel 63A 30mA type A", categorie: "electricite", unite: "unité", prixUnitaireHT: "75.00" },
  { reference: "ELE-048", designation: "Disj. diff. 16A 30mA", description: "Disjoncteur différentiel 16A 30mA type A", categorie: "electricite", unite: "unité", prixUnitaireHT: "85.00" },
  { reference: "ELE-049", designation: "Disj. diff. 20A 30mA", description: "Disjoncteur différentiel 20A 30mA type A", categorie: "electricite", unite: "unité", prixUnitaireHT: "95.00" },
  { reference: "ELE-050", designation: "Parafoudre", description: "Parafoudre modulaire type 2", categorie: "electricite", unite: "unité", prixUnitaireHT: "125.00" },
  { reference: "ELE-051", designation: "Peigne horizontal", description: "Peigne de raccordement horizontal 13 modules", categorie: "electricite", unite: "unité", prixUnitaireHT: "15.00" },
  { reference: "ELE-052", designation: "Peigne vertical", description: "Peigne de raccordement vertical 2 rangées", categorie: "electricite", unite: "unité", prixUnitaireHT: "18.00" },
  { reference: "ELE-053", designation: "Bornier de terre", description: "Bornier de terre 8 connexions", categorie: "electricite", unite: "unité", prixUnitaireHT: "12.00" },
  { reference: "ELE-054", designation: "Bornier de neutre", description: "Bornier de neutre 8 connexions", categorie: "electricite", unite: "unité", prixUnitaireHT: "8.00" },
  { reference: "ELE-055", designation: "Obturateur", description: "Obturateur pour tableau 1 module", categorie: "electricite", unite: "unité", prixUnitaireHT: "0.80" },
  // Boîtes et encastrement
  { reference: "ELE-056", designation: "Boîte d'encastrement simple", description: "Boîte d'encastrement simple Ø67mm", categorie: "electricite", unite: "unité", prixUnitaireHT: "0.65" },
  { reference: "ELE-057", designation: "Boîte d'encastrement double", description: "Boîte d'encastrement double", categorie: "electricite", unite: "unité", prixUnitaireHT: "1.80" },
  { reference: "ELE-058", designation: "Boîte de dérivation Ø60", description: "Boîte de dérivation ronde Ø60mm", categorie: "electricite", unite: "unité", prixUnitaireHT: "1.50" },
  { reference: "ELE-059", designation: "Boîte de dérivation Ø80", description: "Boîte de dérivation ronde Ø80mm", categorie: "electricite", unite: "unité", prixUnitaireHT: "2.20" },
  { reference: "ELE-060", designation: "Boîte de dérivation carrée", description: "Boîte de dérivation carrée 100x100mm", categorie: "electricite", unite: "unité", prixUnitaireHT: "3.50" },
  { reference: "ELE-061", designation: "Boîte DCL", description: "Boîte DCL pour point lumineux", categorie: "electricite", unite: "unité", prixUnitaireHT: "2.80" },
  { reference: "ELE-062", designation: "Domino 2.5mm²", description: "Domino de connexion 2.5mm² (lot de 10)", categorie: "electricite", unite: "lot", prixUnitaireHT: "2.50" },
  { reference: "ELE-063", designation: "Domino 6mm²", description: "Domino de connexion 6mm² (lot de 10)", categorie: "electricite", unite: "lot", prixUnitaireHT: "4.50" },
  { reference: "ELE-064", designation: "Wago 2 entrées", description: "Connecteur Wago 2 entrées (lot de 50)", categorie: "electricite", unite: "lot", prixUnitaireHT: "18.00" },
  { reference: "ELE-065", designation: "Wago 3 entrées", description: "Connecteur Wago 3 entrées (lot de 50)", categorie: "electricite", unite: "lot", prixUnitaireHT: "22.00" },
  { reference: "ELE-066", designation: "Wago 5 entrées", description: "Connecteur Wago 5 entrées (lot de 50)", categorie: "electricite", unite: "lot", prixUnitaireHT: "28.00" },
  // Éclairage
  { reference: "ELE-067", designation: "Douille E27", description: "Douille à vis E27 avec bague", categorie: "electricite", unite: "unité", prixUnitaireHT: "3.50" },
  { reference: "ELE-068", designation: "Douille E14", description: "Douille à vis E14 avec bague", categorie: "electricite", unite: "unité", prixUnitaireHT: "3.20" },
  { reference: "ELE-069", designation: "Douille DCL", description: "Douille DCL pour point lumineux", categorie: "electricite", unite: "unité", prixUnitaireHT: "4.50" },
  { reference: "ELE-070", designation: "Ampoule LED E27 9W", description: "Ampoule LED E27 9W blanc chaud", categorie: "electricite", unite: "unité", prixUnitaireHT: "5.50" },
  { reference: "ELE-071", designation: "Ampoule LED E27 12W", description: "Ampoule LED E27 12W blanc chaud", categorie: "electricite", unite: "unité", prixUnitaireHT: "7.50" },
  { reference: "ELE-072", designation: "Ampoule LED E14 5W", description: "Ampoule LED E14 5W blanc chaud", categorie: "electricite", unite: "unité", prixUnitaireHT: "4.50" },
  { reference: "ELE-073", designation: "Spot LED encastrable", description: "Spot LED encastrable 7W blanc", categorie: "electricite", unite: "unité", prixUnitaireHT: "12.00" },
  { reference: "ELE-074", designation: "Réglette LED 60cm", description: "Réglette LED 60cm 18W", categorie: "electricite", unite: "unité", prixUnitaireHT: "18.00" },
  { reference: "ELE-075", designation: "Réglette LED 120cm", description: "Réglette LED 120cm 36W", categorie: "electricite", unite: "unité", prixUnitaireHT: "28.00" },
  { reference: "ELE-076", designation: "Plafonnier LED rond", description: "Plafonnier LED rond 18W", categorie: "electricite", unite: "unité", prixUnitaireHT: "25.00" },
  { reference: "ELE-077", designation: "Plafonnier LED carré", description: "Plafonnier LED carré 24W", categorie: "electricite", unite: "unité", prixUnitaireHT: "32.00" },
  { reference: "ELE-078", designation: "Applique murale LED", description: "Applique murale LED 12W", categorie: "electricite", unite: "unité", prixUnitaireHT: "35.00" },
  { reference: "ELE-079", designation: "Projecteur LED 20W", description: "Projecteur LED extérieur 20W", categorie: "electricite", unite: "unité", prixUnitaireHT: "25.00" },
  { reference: "ELE-080", designation: "Projecteur LED 50W", description: "Projecteur LED extérieur 50W", categorie: "electricite", unite: "unité", prixUnitaireHT: "45.00" },
  { reference: "ELE-081", designation: "Hublot LED extérieur", description: "Hublot LED extérieur étanche 12W", categorie: "electricite", unite: "unité", prixUnitaireHT: "28.00" },
  { reference: "ELE-082", designation: "Détecteur crépusculaire", description: "Détecteur crépusculaire pour éclairage", categorie: "electricite", unite: "unité", prixUnitaireHT: "22.00" },
  { reference: "ELE-083", designation: "Transformateur LED 12V 30W", description: "Transformateur pour LED 12V 30W", categorie: "electricite", unite: "unité", prixUnitaireHT: "18.00" },
  { reference: "ELE-084", designation: "Bandeau LED 5m", description: "Bandeau LED 5 mètres blanc chaud", categorie: "electricite", unite: "unité", prixUnitaireHT: "35.00" },
  { reference: "ELE-085", designation: "Bandeau LED RGB 5m", description: "Bandeau LED RGB 5 mètres avec télécommande", categorie: "electricite", unite: "unité", prixUnitaireHT: "55.00" },
  // Goulottes et chemins de câbles
  { reference: "ELE-086", designation: "Goulotte 40x25 - 2m", description: "Goulotte PVC 40x25mm longueur 2m", categorie: "electricite", unite: "unité", prixUnitaireHT: "8.50" },
  { reference: "ELE-087", designation: "Goulotte 60x40 - 2m", description: "Goulotte PVC 60x40mm longueur 2m", categorie: "electricite", unite: "unité", prixUnitaireHT: "12.50" },
  { reference: "ELE-088", designation: "Moulure 20x10 - 2m", description: "Moulure PVC 20x10mm longueur 2m", categorie: "electricite", unite: "unité", prixUnitaireHT: "3.50" },
  { reference: "ELE-089", designation: "Moulure 32x12 - 2m", description: "Moulure PVC 32x12mm longueur 2m", categorie: "electricite", unite: "unité", prixUnitaireHT: "5.50" },
  { reference: "ELE-090", designation: "Plinthe électrique - 2m", description: "Plinthe électrique PVC longueur 2m", categorie: "electricite", unite: "unité", prixUnitaireHT: "15.00" },
  { reference: "ELE-091", designation: "Angle goulotte 40x25", description: "Angle intérieur/extérieur goulotte 40x25", categorie: "electricite", unite: "unité", prixUnitaireHT: "2.50" },
  { reference: "ELE-092", designation: "Angle goulotte 60x40", description: "Angle intérieur/extérieur goulotte 60x40", categorie: "electricite", unite: "unité", prixUnitaireHT: "3.50" },
  { reference: "ELE-093", designation: "Chemin de câbles 100mm - 3m", description: "Chemin de câbles perforé 100mm longueur 3m", categorie: "electricite", unite: "unité", prixUnitaireHT: "25.00" },
  { reference: "ELE-094", designation: "Chemin de câbles 200mm - 3m", description: "Chemin de câbles perforé 200mm longueur 3m", categorie: "electricite", unite: "unité", prixUnitaireHT: "35.00" },
  { reference: "ELE-095", designation: "Console chemin de câbles", description: "Console de fixation chemin de câbles", categorie: "electricite", unite: "unité", prixUnitaireHT: "8.50" },
  // Prises et interrupteurs industriels
  { reference: "ELE-096", designation: "Prise industrielle 16A 2P+T", description: "Prise industrielle 16A 2P+T IP44", categorie: "electricite", unite: "unité", prixUnitaireHT: "12.00" },
  { reference: "ELE-097", designation: "Prise industrielle 32A 3P+T", description: "Prise industrielle 32A 3P+T IP44", categorie: "electricite", unite: "unité", prixUnitaireHT: "18.00" },
  { reference: "ELE-098", designation: "Fiche industrielle 16A 2P+T", description: "Fiche industrielle 16A 2P+T IP44", categorie: "electricite", unite: "unité", prixUnitaireHT: "8.50" },
  { reference: "ELE-099", designation: "Fiche industrielle 32A 3P+T", description: "Fiche industrielle 32A 3P+T IP44", categorie: "electricite", unite: "unité", prixUnitaireHT: "15.00" },
  { reference: "ELE-100", designation: "Coffret de chantier", description: "Coffret de chantier équipé IP44", categorie: "electricite", unite: "unité", prixUnitaireHT: "185.00" },
  // Domotique et connecté
  { reference: "ELE-101", designation: "Interrupteur connecté", description: "Interrupteur WiFi connecté", categorie: "electricite", unite: "unité", prixUnitaireHT: "35.00" },
  { reference: "ELE-102", designation: "Prise connectée", description: "Prise WiFi connectée avec mesure conso", categorie: "electricite", unite: "unité", prixUnitaireHT: "28.00" },
  { reference: "ELE-103", designation: "Thermostat connecté", description: "Thermostat WiFi programmable", categorie: "electricite", unite: "unité", prixUnitaireHT: "120.00" },
  { reference: "ELE-104", designation: "Détecteur fumée connecté", description: "Détecteur de fumée WiFi", categorie: "electricite", unite: "unité", prixUnitaireHT: "45.00" },
  { reference: "ELE-105", designation: "Caméra IP intérieure", description: "Caméra IP WiFi intérieure", categorie: "electricite", unite: "unité", prixUnitaireHT: "65.00" },
  { reference: "ELE-106", designation: "Caméra IP extérieure", description: "Caméra IP WiFi extérieure étanche", categorie: "electricite", unite: "unité", prixUnitaireHT: "95.00" },
  { reference: "ELE-107", designation: "Visiophone", description: "Visiophone couleur 7 pouces", categorie: "electricite", unite: "unité", prixUnitaireHT: "185.00" },
  { reference: "ELE-108", designation: "Interphone audio", description: "Interphone audio 2 fils", categorie: "electricite", unite: "unité", prixUnitaireHT: "85.00" },
  { reference: "ELE-109", designation: "Motorisation portail", description: "Kit motorisation portail battant", categorie: "electricite", unite: "unité", prixUnitaireHT: "450.00" },
  { reference: "ELE-110", designation: "Motorisation volet", description: "Moteur volet roulant filaire", categorie: "electricite", unite: "unité", prixUnitaireHT: "85.00" },
  // Ventilation
  { reference: "ELE-111", designation: "VMC simple flux", description: "VMC simple flux autoréglable", categorie: "electricite", unite: "unité", prixUnitaireHT: "145.00" },
  { reference: "ELE-112", designation: "VMC double flux", description: "VMC double flux haut rendement", categorie: "electricite", unite: "unité", prixUnitaireHT: "850.00" },
  { reference: "ELE-113", designation: "Extracteur d'air", description: "Extracteur d'air Ø100mm", categorie: "electricite", unite: "unité", prixUnitaireHT: "25.00" },
  { reference: "ELE-114", designation: "Bouche VMC cuisine", description: "Bouche d'extraction VMC cuisine", categorie: "electricite", unite: "unité", prixUnitaireHT: "18.00" },
  { reference: "ELE-115", designation: "Bouche VMC salle de bain", description: "Bouche d'extraction VMC salle de bain", categorie: "electricite", unite: "unité", prixUnitaireHT: "15.00" },
  { reference: "ELE-116", designation: "Gaine VMC Ø80 - 6m", description: "Gaine VMC souple Ø80mm longueur 6m", categorie: "electricite", unite: "unité", prixUnitaireHT: "12.00" },
  { reference: "ELE-117", designation: "Gaine VMC Ø125 - 6m", description: "Gaine VMC souple Ø125mm longueur 6m", categorie: "electricite", unite: "unité", prixUnitaireHT: "18.00" },
  { reference: "ELE-118", designation: "Collier VMC Ø80", description: "Collier de fixation VMC Ø80mm", categorie: "electricite", unite: "unité", prixUnitaireHT: "1.50" },
  { reference: "ELE-119", designation: "Collier VMC Ø125", description: "Collier de fixation VMC Ø125mm", categorie: "electricite", unite: "unité", prixUnitaireHT: "2.20" },
  { reference: "ELE-120", designation: "Grille aération", description: "Grille d'aération réglable", categorie: "electricite", unite: "unité", prixUnitaireHT: "8.50" },
  // Chauffage électrique
  { reference: "ELE-121", designation: "Radiateur inertie 1000W", description: "Radiateur à inertie sèche 1000W", categorie: "electricite", unite: "unité", prixUnitaireHT: "280.00" },
  { reference: "ELE-122", designation: "Radiateur inertie 1500W", description: "Radiateur à inertie sèche 1500W", categorie: "electricite", unite: "unité", prixUnitaireHT: "350.00" },
  { reference: "ELE-123", designation: "Radiateur inertie 2000W", description: "Radiateur à inertie sèche 2000W", categorie: "electricite", unite: "unité", prixUnitaireHT: "420.00" },
  { reference: "ELE-124", designation: "Convecteur 1000W", description: "Convecteur électrique 1000W", categorie: "electricite", unite: "unité", prixUnitaireHT: "85.00" },
  { reference: "ELE-125", designation: "Convecteur 1500W", description: "Convecteur électrique 1500W", categorie: "electricite", unite: "unité", prixUnitaireHT: "95.00" },
  { reference: "ELE-126", designation: "Sèche-serviettes 500W", description: "Sèche-serviettes électrique 500W", categorie: "electricite", unite: "unité", prixUnitaireHT: "185.00" },
  { reference: "ELE-127", designation: "Sèche-serviettes 750W", description: "Sèche-serviettes électrique 750W", categorie: "electricite", unite: "unité", prixUnitaireHT: "220.00" },
  { reference: "ELE-128", designation: "Plancher chauffant kit", description: "Kit plancher chauffant électrique 5m²", categorie: "electricite", unite: "kit", prixUnitaireHT: "180.00" },
  { reference: "ELE-129", designation: "Thermostat plancher", description: "Thermostat pour plancher chauffant", categorie: "electricite", unite: "unité", prixUnitaireHT: "65.00" },
  { reference: "ELE-130", designation: "Cassette plafond", description: "Cassette de chauffage plafond 600W", categorie: "electricite", unite: "unité", prixUnitaireHT: "145.00" },
  // Sécurité
  { reference: "ELE-131", designation: "Détecteur fumée NF", description: "Détecteur avertisseur de fumée NF", categorie: "electricite", unite: "unité", prixUnitaireHT: "18.00" },
  { reference: "ELE-132", designation: "Détecteur CO", description: "Détecteur monoxyde de carbone", categorie: "electricite", unite: "unité", prixUnitaireHT: "35.00" },
  { reference: "ELE-133", designation: "Bloc secours", description: "Bloc autonome d'éclairage de sécurité", categorie: "electricite", unite: "unité", prixUnitaireHT: "45.00" },
  { reference: "ELE-134", designation: "Bloc secours LED", description: "BAES LED avec télécommande", categorie: "electricite", unite: "unité", prixUnitaireHT: "65.00" },
  { reference: "ELE-135", designation: "Télécommande BAES", description: "Télécommande pour blocs de secours", categorie: "electricite", unite: "unité", prixUnitaireHT: "85.00" },
  { reference: "ELE-136", designation: "Alarme incendie", description: "Centrale alarme incendie 4 zones", categorie: "electricite", unite: "unité", prixUnitaireHT: "320.00" },
  { reference: "ELE-137", designation: "Déclencheur manuel", description: "Déclencheur manuel d'alarme incendie", categorie: "electricite", unite: "unité", prixUnitaireHT: "28.00" },
  { reference: "ELE-138", designation: "Sirène incendie", description: "Sirène d'alarme incendie", categorie: "electricite", unite: "unité", prixUnitaireHT: "45.00" },
  { reference: "ELE-139", designation: "Centrale alarme intrusion", description: "Centrale alarme intrusion sans fil", categorie: "electricite", unite: "unité", prixUnitaireHT: "280.00" },
  { reference: "ELE-140", designation: "Détecteur mouvement alarme", description: "Détecteur de mouvement pour alarme", categorie: "electricite", unite: "unité", prixUnitaireHT: "35.00" },
  // Accessoires et consommables
  { reference: "ELE-141", designation: "Chevilles électricien lot", description: "Lot de 100 chevilles électricien", categorie: "electricite", unite: "lot", prixUnitaireHT: "8.50" },
  { reference: "ELE-142", designation: "Colliers rilsan lot", description: "Lot de 100 colliers rilsan 200mm", categorie: "electricite", unite: "lot", prixUnitaireHT: "5.50" },
  { reference: "ELE-143", designation: "Attaches câbles lot", description: "Lot de 100 attaches câbles adhésives", categorie: "electricite", unite: "lot", prixUnitaireHT: "12.00" },
  { reference: "ELE-144", designation: "Gaine thermorétractable", description: "Kit gaine thermorétractable assortie", categorie: "electricite", unite: "kit", prixUnitaireHT: "15.00" },
  { reference: "ELE-145", designation: "Embouts à sertir", description: "Lot embouts à sertir assortis", categorie: "electricite", unite: "lot", prixUnitaireHT: "18.00" },
  { reference: "ELE-146", designation: "Cosses à sertir", description: "Lot cosses à sertir assorties", categorie: "electricite", unite: "lot", prixUnitaireHT: "22.00" },
  { reference: "ELE-147", designation: "Ruban isolant noir", description: "Ruban isolant PVC noir 20m", categorie: "electricite", unite: "unité", prixUnitaireHT: "2.50" },
  { reference: "ELE-148", designation: "Ruban isolant couleurs", description: "Lot rubans isolants couleurs", categorie: "electricite", unite: "lot", prixUnitaireHT: "8.50" },
  { reference: "ELE-149", designation: "Étiquettes repérage", description: "Lot étiquettes de repérage câbles", categorie: "electricite", unite: "lot", prixUnitaireHT: "12.00" },
  { reference: "ELE-150", designation: "Passe-câble mural", description: "Passe-câble mural Ø60mm", categorie: "electricite", unite: "unité", prixUnitaireHT: "5.50" },
];

async function seedArticles() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  
  console.log('Connexion à la base de données...');
  
  try {
    // Vérifier si des articles existent déjà
    const [existing] = await connection.execute('SELECT COUNT(*) as count FROM bibliotheque_articles');
    if (existing[0].count > 0) {
      console.log(`${existing[0].count} articles existent déjà. Suppression...`);
      await connection.execute('DELETE FROM bibliotheque_articles');
    }
    
    console.log('Insertion des 250 articles...');
    
    for (const article of articles) {
      await connection.execute(
        `INSERT INTO bibliotheque_articles (reference, designation, description, categorie, unite, prixUnitaireHT, createdAt) 
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [article.reference, article.designation, article.description, article.categorie, article.unite, article.prixUnitaireHT]
      );
    }
    
    console.log(`✅ ${articles.length} articles insérés avec succès !`);
    
    // Vérification
    const [count] = await connection.execute('SELECT COUNT(*) as total FROM bibliotheque_articles');
    console.log(`Total d'articles dans la base : ${count[0].total}`);
    
  } catch (error) {
    console.error('Erreur lors de l\'insertion des articles:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

seedArticles().catch(console.error);
