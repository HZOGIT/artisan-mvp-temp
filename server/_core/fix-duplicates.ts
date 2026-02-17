/**
 * Pre-migration script: fixes duplicate devis/facture numbers
 * Runs BEFORE drizzle-kit push to ensure unique index can be created
 */
import "dotenv/config";
import mysql from "mysql2/promise";

async function fixDuplicates() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.log('[FixDuplicates] No DATABASE_URL, skipping'); process.exit(0); }

  const pool = mysql.createPool({ uri: url, charset: 'utf8mb4' });

  try {
    // Find duplicate devis numbers per artisan
    const [dups] = await pool.execute(
      `SELECT artisanId, numero, GROUP_CONCAT(id ORDER BY id) as ids, COUNT(*) as cnt
       FROM devis GROUP BY artisanId, numero HAVING cnt > 1`
    ) as any;

    for (const dup of dups) {
      const ids = dup.ids.split(',').map(Number);
      // Keep the first one, renumber the rest
      for (let i = 1; i < ids.length; i++) {
        // Find next available number for this artisan
        const [maxRows] = await pool.execute(
          `SELECT MAX(numero) as maxNum FROM devis WHERE artisanId = ?`, [dup.artisanId]
        ) as any;
        let maxN = 0;
        if (maxRows[0]?.maxNum) {
          const match = maxRows[0].maxNum.match(/-(\d+)$/);
          if (match) maxN = parseInt(match[1], 10);
        }
        const newNum = `DEV-${String(maxN + 1).padStart(5, '0')}`;
        await pool.execute(`UPDATE devis SET numero = ? WHERE id = ?`, [newNum, ids[i]]);
        console.log(`[FixDuplicates] Devis id=${ids[i]}: ${dup.numero} → ${newNum}`);
      }
    }

    // Find duplicate facture numbers per artisan
    const [dupsFact] = await pool.execute(
      `SELECT artisanId, numero, GROUP_CONCAT(id ORDER BY id) as ids, COUNT(*) as cnt
       FROM factures GROUP BY artisanId, numero HAVING cnt > 1`
    ) as any;

    for (const dup of dupsFact) {
      const ids = dup.ids.split(',').map(Number);
      for (let i = 1; i < ids.length; i++) {
        const [maxRows] = await pool.execute(
          `SELECT MAX(numero) as maxNum FROM factures WHERE artisanId = ?`, [dup.artisanId]
        ) as any;
        let maxN = 0;
        if (maxRows[0]?.maxNum) {
          const match = maxRows[0].maxNum.match(/-(\d+)$/);
          if (match) maxN = parseInt(match[1], 10);
        }
        const newNum = `FAC-${String(maxN + 1).padStart(5, '0')}`;
        await pool.execute(`UPDATE factures SET numero = ? WHERE id = ?`, [newNum, ids[i]]);
        console.log(`[FixDuplicates] Facture id=${ids[i]}: ${dup.numero} → ${newNum}`);
      }
    }

    // Sync compteurDevis in parametres_artisan
    const [artisanRows] = await pool.execute(`SELECT DISTINCT artisanId FROM devis`) as any;
    for (const row of artisanRows) {
      const [maxRows] = await pool.execute(
        `SELECT MAX(numero) as maxNum FROM devis WHERE artisanId = ?`, [row.artisanId]
      ) as any;
      if (maxRows[0]?.maxNum) {
        const match = maxRows[0].maxNum.match(/-(\d+)$/);
        if (match) {
          const maxNum = parseInt(match[1], 10);
          await pool.execute(
            `UPDATE parametres_artisan SET compteurDevis = ? WHERE artisanId = ?`,
            [maxNum, row.artisanId]
          );
          console.log(`[FixDuplicates] Synced compteurDevis=${maxNum} for artisan ${row.artisanId}`);
        }
      }
    }

    // Sync compteurFacture
    const [artisanRowsF] = await pool.execute(`SELECT DISTINCT artisanId FROM factures`) as any;
    for (const row of artisanRowsF) {
      const [maxRows] = await pool.execute(
        `SELECT MAX(numero) as maxNum FROM factures WHERE artisanId = ?`, [row.artisanId]
      ) as any;
      if (maxRows[0]?.maxNum) {
        const match = maxRows[0].maxNum.match(/-(\d+)$/);
        if (match) {
          const maxNum = parseInt(match[1], 10);
          await pool.execute(
            `UPDATE parametres_artisan SET compteurFacture = ? WHERE artisanId = ?`,
            [maxNum, row.artisanId]
          );
          console.log(`[FixDuplicates] Synced compteurFacture=${maxNum} for artisan ${row.artisanId}`);
        }
      }
    }

    // Add unique indexes if they don't exist (managed via raw SQL to avoid drizzle-kit interactive prompts)
    try {
      await pool.execute(`ALTER TABLE devis ADD UNIQUE INDEX unique_devis_artisan_numero (artisanId, numero)`);
      console.log('[FixDuplicates] Added unique index on devis(artisanId, numero)');
    } catch (e: any) {
      if (e.code === 'ER_DUP_KEYNAME' || e.message?.includes('Duplicate key name')) {
        console.log('[FixDuplicates] Unique index on devis already exists');
      } else { throw e; }
    }
    try {
      await pool.execute(`ALTER TABLE factures ADD UNIQUE INDEX unique_factures_artisan_numero (artisanId, numero)`);
      console.log('[FixDuplicates] Added unique index on factures(artisanId, numero)');
    } catch (e: any) {
      if (e.code === 'ER_DUP_KEYNAME' || e.message?.includes('Duplicate key name')) {
        console.log('[FixDuplicates] Unique index on factures already exists');
      } else { throw e; }
    }

    // --- Chat schema migration: ALTER conversations & messages tables ---
    // Modify conversations.statut enum: add 'ouverte', 'fermee' values and change default
    try {
      await pool.execute(`ALTER TABLE conversations MODIFY COLUMN statut ENUM('active','archivee','ouverte','fermee') DEFAULT 'ouverte'`);
      // Migrate existing 'active' rows to 'ouverte'
      await pool.execute(`UPDATE conversations SET statut = 'ouverte' WHERE statut = 'active'`);
      // Now remove 'active' from enum
      await pool.execute(`ALTER TABLE conversations MODIFY COLUMN statut ENUM('ouverte','fermee','archivee') DEFAULT 'ouverte'`);
      console.log('[FixDuplicates] Migrated conversations.statut enum');
    } catch (e: any) {
      // If column already has the new enum, this is fine
      if (e.message?.includes("Data truncated") || e.code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD') {
        console.log('[FixDuplicates] conversations.statut already migrated or has data issue');
      } else {
        console.log('[FixDuplicates] conversations.statut migration:', e.message || e);
      }
    }

    // Add new columns to conversations (idempotent)
    const convColumns = [
      { name: 'devisId', sql: 'ADD COLUMN devisId INT NULL' },
      { name: 'factureId', sql: 'ADD COLUMN factureId INT NULL' },
      { name: 'interventionId', sql: 'ADD COLUMN interventionId INT NULL' },
      { name: 'dernierMessage', sql: 'ADD COLUMN dernierMessage TEXT NULL' },
      { name: 'dernierMessageDate', sql: 'ADD COLUMN dernierMessageDate TIMESTAMP NULL' },
      { name: 'nonLuArtisan', sql: 'ADD COLUMN nonLuArtisan INT DEFAULT 0' },
      { name: 'nonLuClient', sql: 'ADD COLUMN nonLuClient INT DEFAULT 0' },
    ];
    for (const col of convColumns) {
      try {
        await pool.execute(`ALTER TABLE conversations ${col.sql}`);
        console.log(`[FixDuplicates] Added conversations.${col.name}`);
      } catch (e: any) {
        if (e.code === 'ER_DUP_FIELDNAME' || e.message?.includes('Duplicate column name')) {
          // Column already exists
        } else { console.log(`[FixDuplicates] conversations.${col.name}:`, e.message); }
      }
    }

    // Drop old dernierMessageAt column if exists
    try {
      await pool.execute(`ALTER TABLE conversations DROP COLUMN dernierMessageAt`);
      console.log('[FixDuplicates] Dropped conversations.dernierMessageAt');
    } catch (e: any) {
      // Column doesn't exist, fine
    }

    // Rename messages.expediteur to auteur
    try {
      await pool.execute(`ALTER TABLE messages CHANGE COLUMN expediteur auteur ENUM('artisan','client') NOT NULL`);
      console.log('[FixDuplicates] Renamed messages.expediteur -> auteur');
    } catch (e: any) {
      if (e.message?.includes("Unknown column")) {
        // Already renamed
        console.log('[FixDuplicates] messages.auteur already exists');
      } else { console.log('[FixDuplicates] messages rename:', e.message); }
    }

    // Add pieceJointe/pieceJointeUrl, drop luAt from messages
    const msgCols = [
      { name: 'pieceJointe', sql: 'ADD COLUMN pieceJointe TEXT NULL' },
      { name: 'pieceJointeUrl', sql: 'ADD COLUMN pieceJointeUrl TEXT NULL' },
    ];
    for (const col of msgCols) {
      try {
        await pool.execute(`ALTER TABLE messages ${col.sql}`);
        console.log(`[FixDuplicates] Added messages.${col.name}`);
      } catch (e: any) {
        if (e.code === 'ER_DUP_FIELDNAME' || e.message?.includes('Duplicate column name')) {
          // Already exists
        } else { console.log(`[FixDuplicates] messages.${col.name}:`, e.message); }
      }
    }
    try {
      await pool.execute(`ALTER TABLE messages DROP COLUMN luAt`);
      console.log('[FixDuplicates] Dropped messages.luAt');
    } catch (e: any) {
      // Doesn't exist, fine
    }

    // --- Fix UTF-8 encoding: ensure connection uses utf8mb4 ---
    await pool.execute(`SET NAMES utf8mb4`);

    // --- Re-insert chat demo data with correct UTF-8 encoding ---
    // Check if conversations have corrupted data (contains replacement character)
    const [convRows] = await pool.execute(
      `SELECT id, sujet FROM conversations WHERE sujet LIKE '%�%' OR sujet LIKE '%Ã%' LIMIT 1`
    ) as any;
    if (convRows.length > 0) {
      console.log('[FixDuplicates] Found corrupted chat data, re-inserting...');
      // Delete all messages then conversations (foreign key order)
      await pool.execute(`DELETE FROM messages WHERE conversationId IN (SELECT id FROM conversations WHERE artisanId = 1)`);
      await pool.execute(`DELETE FROM conversations WHERE artisanId = 1`);
      console.log('[FixDuplicates] Deleted corrupted conversations and messages');

      // Re-insert conversation 1: Hab Doudi (clientId=2)
      await pool.execute(
        `INSERT INTO conversations (artisanId, clientId, sujet, statut, dernierMessage, dernierMessageDate, nonLuArtisan, nonLuClient, createdAt, updatedAt)
         VALUES (1, 2, 'Devis rénovation SDB', 'ouverte', 'Parfait, le 80x80 m''intéresse beaucoup. On peut planifier un RDV cette semaine pour voir les échantillons ?', NOW() - INTERVAL 2 HOUR, 1, 0, NOW() - INTERVAL 3 DAY, NOW() - INTERVAL 2 HOUR)`
      );
      const [conv1Rows] = await pool.execute(`SELECT LAST_INSERT_ID() as id`) as any;
      const conv1Id = conv1Rows[0].id;

      // Messages for conversation 1
      const conv1Messages = [
        { auteur: 'artisan', contenu: 'Bonjour M. Doudi, je vous envoie le devis pour la rénovation de votre salle de bain comme convenu lors de notre visite.', offset: '3 DAY' },
        { auteur: 'client', contenu: 'Bonjour, merci pour le devis. J\'aurais une question sur le choix du carrelage, est-ce que vous proposez du grès cérame grand format ?', offset: '2 DAY 20 HOUR' },
        { auteur: 'artisan', contenu: 'Oui bien sûr, nous proposons du grès cérame en 60x60 et 80x80. Je peux vous envoyer des échantillons si vous le souhaitez. Le tarif reste le même que sur le devis.', offset: '2 DAY 18 HOUR' },
        { auteur: 'client', contenu: 'Parfait, le 80x80 m\'intéresse beaucoup. On peut planifier un RDV cette semaine pour voir les échantillons ?', offset: '2 HOUR' },
      ];
      for (const msg of conv1Messages) {
        await pool.execute(
          `INSERT INTO messages (conversationId, auteur, contenu, lu, createdAt) VALUES (?, ?, ?, ?, NOW() - INTERVAL ${msg.offset})`,
          [conv1Id, msg.auteur, msg.contenu, msg.auteur === 'artisan' ? 1 : 0]
        );
      }
      console.log(`[FixDuplicates] Inserted conversation 1 (id=${conv1Id}) with 4 messages`);

      // Re-insert conversation 2: Durand Pierre (clientId=5)
      await pool.execute(
        `INSERT INTO conversations (artisanId, clientId, sujet, statut, dernierMessage, dernierMessageDate, nonLuArtisan, nonLuClient, createdAt, updatedAt)
         VALUES (1, 5, 'Intervention chaudière — suivi', 'ouverte', 'Merci pour l''intervention. Par contre j''ai remarqué un léger bruit au démarrage, est-ce normal ?', NOW() - INTERVAL 5 HOUR, 1, 0, NOW() - INTERVAL 1 DAY, NOW() - INTERVAL 5 HOUR)`
      );
      const [conv2Rows] = await pool.execute(`SELECT LAST_INSERT_ID() as id`) as any;
      const conv2Id = conv2Rows[0].id;

      const conv2Messages = [
        { auteur: 'artisan', contenu: 'Bonjour M. Durand, suite à notre intervention sur votre chaudière ce matin, tout est en ordre. N\'hésitez pas si vous avez des questions.', offset: '1 DAY' },
        { auteur: 'client', contenu: 'Merci pour l\'intervention. Par contre j\'ai remarqué un léger bruit au démarrage, est-ce normal ?', offset: '5 HOUR' },
      ];
      for (const msg of conv2Messages) {
        await pool.execute(
          `INSERT INTO messages (conversationId, auteur, contenu, lu, createdAt) VALUES (?, ?, ?, ?, NOW() - INTERVAL ${msg.offset})`,
          [conv2Id, msg.auteur, msg.contenu, msg.auteur === 'artisan' ? 1 : 0]
        );
      }
      console.log(`[FixDuplicates] Inserted conversation 2 (id=${conv2Id}) with 2 messages`);
    } else {
      // Also check if there are NO conversations at all (first deploy)
      const [anyConvs] = await pool.execute(`SELECT COUNT(*) as cnt FROM conversations WHERE artisanId = 1`) as any;
      if (anyConvs[0].cnt === 0) {
        console.log('[FixDuplicates] No conversations found, inserting demo data...');
        // Same insert logic as above
        await pool.execute(
          `INSERT INTO conversations (artisanId, clientId, sujet, statut, dernierMessage, dernierMessageDate, nonLuArtisan, nonLuClient, createdAt, updatedAt)
           VALUES (1, 2, 'Devis rénovation SDB', 'ouverte', 'Parfait, le 80x80 m''intéresse beaucoup. On peut planifier un RDV cette semaine pour voir les échantillons ?', NOW() - INTERVAL 2 HOUR, 1, 0, NOW() - INTERVAL 3 DAY, NOW() - INTERVAL 2 HOUR)`
        );
        const [c1] = await pool.execute(`SELECT LAST_INSERT_ID() as id`) as any;
        const c1Id = c1[0].id;
        const msgs1 = [
          ['artisan', 'Bonjour M. Doudi, je vous envoie le devis pour la rénovation de votre salle de bain comme convenu lors de notre visite.', '3 DAY'],
          ['client', 'Bonjour, merci pour le devis. J\'aurais une question sur le choix du carrelage, est-ce que vous proposez du grès cérame grand format ?', '2 DAY 20 HOUR'],
          ['artisan', 'Oui bien sûr, nous proposons du grès cérame en 60x60 et 80x80. Je peux vous envoyer des échantillons si vous le souhaitez. Le tarif reste le même que sur le devis.', '2 DAY 18 HOUR'],
          ['client', 'Parfait, le 80x80 m\'intéresse beaucoup. On peut planifier un RDV cette semaine pour voir les échantillons ?', '2 HOUR'],
        ];
        for (const [auteur, contenu, offset] of msgs1) {
          await pool.execute(`INSERT INTO messages (conversationId, auteur, contenu, lu, createdAt) VALUES (?, ?, ?, ?, NOW() - INTERVAL ${offset})`, [c1Id, auteur, contenu, auteur === 'artisan' ? 1 : 0]);
        }

        await pool.execute(
          `INSERT INTO conversations (artisanId, clientId, sujet, statut, dernierMessage, dernierMessageDate, nonLuArtisan, nonLuClient, createdAt, updatedAt)
           VALUES (1, 5, 'Intervention chaudière — suivi', 'ouverte', 'Merci pour l''intervention. Par contre j''ai remarqué un léger bruit au démarrage, est-ce normal ?', NOW() - INTERVAL 5 HOUR, 1, 0, NOW() - INTERVAL 1 DAY, NOW() - INTERVAL 5 HOUR)`
        );
        const [c2] = await pool.execute(`SELECT LAST_INSERT_ID() as id`) as any;
        const c2Id = c2[0].id;
        await pool.execute(`INSERT INTO messages (conversationId, auteur, contenu, lu, createdAt) VALUES (?, 'artisan', 'Bonjour M. Durand, suite à notre intervention sur votre chaudière ce matin, tout est en ordre. N''hésitez pas si vous avez des questions.', 1, NOW() - INTERVAL 1 DAY)`, [c2Id]);
        await pool.execute(`INSERT INTO messages (conversationId, auteur, contenu, lu, createdAt) VALUES (?, 'client', 'Merci pour l''intervention. Par contre j''ai remarqué un léger bruit au démarrage, est-ce normal ?', 0, NOW() - INTERVAL 5 HOUR)`, [c2Id]);
        console.log('[FixDuplicates] Inserted 2 demo conversations with messages');
      } else {
        console.log('[FixDuplicates] Chat data looks OK, skipping re-insert');
      }
    }

    // Also fix any corrupted contrat data
    await pool.execute(`UPDATE contrats_maintenance SET titre = 'Contrat maintenance chaudière gaz' WHERE titre LIKE '%chaudi%' AND (titre LIKE '%�%' OR titre LIKE '%Ã%')`);
    await pool.execute(`UPDATE contrats_maintenance SET titre = 'Contrat entretien plomberie' WHERE titre LIKE '%plomberi%' AND (titre LIKE '%�%' OR titre LIKE '%Ã%')`);

    console.log('[FixDuplicates] Done.');
  } catch (e) {
    console.error('[FixDuplicates] Error:', e);
  } finally {
    await pool.end();
  }
}

fixDuplicates();
