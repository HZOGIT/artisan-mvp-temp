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

    // --- Fix UTF-8: force utf8mb4 on connection ---
    await pool.execute(`SET NAMES utf8mb4`);

    // --- One-time chat demo data cleanup & re-insert with correct UTF-8 ---
    // Use HEX check: correct UTF-8 'é' = C3A9, corrupted = 3F or EF BF BD or C383
    const [hexCheck] = await pool.execute(
      `SELECT id, HEX(sujet) as h FROM conversations WHERE artisanId = 1 AND sujet IS NOT NULL LIMIT 1`
    ) as any;
    // If data exists and contains C383 (double-encoded) or EFBFBD (replacement char) or 3F (question mark), it's corrupted
    const needsReinsert = hexCheck.length > 0 && (
      hexCheck[0].h.includes('C383') || hexCheck[0].h.includes('EFBFBD') || hexCheck[0].h.includes('3F')
    );

    if (needsReinsert) {
      console.log('[FixDuplicates] Corrupted UTF-8 detected in chat data (HEX check), cleaning up...');
      await pool.execute(`DELETE FROM messages WHERE conversationId IN (SELECT id FROM conversations WHERE artisanId = 1)`);
      await pool.execute(`DELETE FROM conversations WHERE artisanId = 1`);

      // Conversation 1: Hab Doudi (clientId=2)
      const [r1] = await pool.execute(
        `INSERT INTO conversations (artisanId, clientId, sujet, statut, dernierMessage, dernierMessageDate, nonLuArtisan, nonLuClient, createdAt, updatedAt)
         VALUES (1, 2, ?, 'ouverte', ?, NOW() - INTERVAL 2 HOUR, 1, 0, NOW() - INTERVAL 3 DAY, NOW() - INTERVAL 2 HOUR)`,
        ['Devis rénovation SDB', 'Parfait, le 80x80 m\'intéresse beaucoup. On peut planifier un RDV cette semaine pour voir les échantillons ?']
      ) as any;
      const c1 = r1.insertId;
      const m1 = [
        ['artisan', 'Bonjour M. Doudi, je vous envoie le devis pour la rénovation de votre salle de bain comme convenu lors de notre visite.', '3 DAY'],
        ['client', 'Bonjour, merci pour le devis. J\'aurais une question sur le choix du carrelage, est-ce que vous proposez du grès cérame grand format ?', '2 DAY 20 HOUR'],
        ['artisan', 'Oui bien sûr, nous proposons du grès cérame en 60x60 et 80x80. Je peux vous envoyer des échantillons si vous le souhaitez. Le tarif reste le même que sur le devis.', '2 DAY 18 HOUR'],
        ['client', 'Parfait, le 80x80 m\'intéresse beaucoup. On peut planifier un RDV cette semaine pour voir les échantillons ?', '2 HOUR'],
      ];
      for (const [auteur, contenu, offset] of m1) {
        await pool.execute(`INSERT INTO messages (conversationId, auteur, contenu, lu, createdAt) VALUES (?, ?, ?, ?, NOW() - INTERVAL ${offset})`, [c1, auteur, contenu, auteur === 'artisan' ? 1 : 0]);
      }

      // Conversation 2: Durand Pierre (clientId=5)
      const [r2] = await pool.execute(
        `INSERT INTO conversations (artisanId, clientId, sujet, statut, dernierMessage, dernierMessageDate, nonLuArtisan, nonLuClient, createdAt, updatedAt)
         VALUES (1, 5, ?, 'ouverte', ?, NOW() - INTERVAL 5 HOUR, 1, 0, NOW() - INTERVAL 1 DAY, NOW() - INTERVAL 5 HOUR)`,
        ['Intervention chaudière \u2014 suivi', 'Merci pour l\'intervention. Par contre j\'ai remarqué un léger bruit au démarrage, est-ce normal ?']
      ) as any;
      const c2 = r2.insertId;
      await pool.execute(`INSERT INTO messages (conversationId, auteur, contenu, lu, createdAt) VALUES (?, 'artisan', ?, 1, NOW() - INTERVAL 1 DAY)`, [c2, 'Bonjour M. Durand, suite à notre intervention sur votre chaudière ce matin, tout est en ordre. N\'hésitez pas si vous avez des questions.']);
      await pool.execute(`INSERT INTO messages (conversationId, auteur, contenu, lu, createdAt) VALUES (?, 'client', ?, 0, NOW() - INTERVAL 5 HOUR)`, [c2, 'Merci pour l\'intervention. Par contre j\'ai remarqué un léger bruit au démarrage, est-ce normal ?']);

      console.log(`[FixDuplicates] Re-inserted 2 conversations (ids ${c1}, ${c2}) with 6 messages`);
    } else if (hexCheck.length === 0) {
      // No conversations exist at all — check if table is empty for this artisan
      const [cnt] = await pool.execute(`SELECT COUNT(*) as c FROM conversations WHERE artisanId = 1`) as any;
      if (cnt[0].c === 0) {
        console.log('[FixDuplicates] No conversations, inserting demo data...');
        const [r1] = await pool.execute(
          `INSERT INTO conversations (artisanId, clientId, sujet, statut, dernierMessage, dernierMessageDate, nonLuArtisan, nonLuClient, createdAt, updatedAt)
           VALUES (1, 2, ?, 'ouverte', ?, NOW() - INTERVAL 2 HOUR, 1, 0, NOW() - INTERVAL 3 DAY, NOW() - INTERVAL 2 HOUR)`,
          ['Devis rénovation SDB', 'Parfait, le 80x80 m\'intéresse beaucoup. On peut planifier un RDV cette semaine pour voir les échantillons ?']
        ) as any;
        const c1 = r1.insertId;
        for (const [auteur, contenu, offset] of [
          ['artisan', 'Bonjour M. Doudi, je vous envoie le devis pour la rénovation de votre salle de bain comme convenu lors de notre visite.', '3 DAY'],
          ['client', 'Bonjour, merci pour le devis. J\'aurais une question sur le choix du carrelage, est-ce que vous proposez du grès cérame grand format ?', '2 DAY 20 HOUR'],
          ['artisan', 'Oui bien sûr, nous proposons du grès cérame en 60x60 et 80x80. Je peux vous envoyer des échantillons si vous le souhaitez.', '2 DAY 18 HOUR'],
          ['client', 'Parfait, le 80x80 m\'intéresse beaucoup. On peut planifier un RDV cette semaine pour voir les échantillons ?', '2 HOUR'],
        ]) { await pool.execute(`INSERT INTO messages (conversationId, auteur, contenu, lu, createdAt) VALUES (?, ?, ?, ?, NOW() - INTERVAL ${offset})`, [c1, auteur, contenu, auteur === 'artisan' ? 1 : 0]); }
        const [r2] = await pool.execute(
          `INSERT INTO conversations (artisanId, clientId, sujet, statut, dernierMessage, dernierMessageDate, nonLuArtisan, nonLuClient, createdAt, updatedAt)
           VALUES (1, 5, ?, 'ouverte', ?, NOW() - INTERVAL 5 HOUR, 1, 0, NOW() - INTERVAL 1 DAY, NOW() - INTERVAL 5 HOUR)`,
          ['Intervention chaudière \u2014 suivi', 'Merci pour l\'intervention. Par contre j\'ai remarqué un léger bruit au démarrage, est-ce normal ?']
        ) as any;
        const c2 = r2.insertId;
        await pool.execute(`INSERT INTO messages (conversationId, auteur, contenu, lu, createdAt) VALUES (?, 'artisan', ?, 1, NOW() - INTERVAL 1 DAY)`, [c2, 'Bonjour M. Durand, suite à notre intervention sur votre chaudière ce matin, tout est en ordre. N\'hésitez pas si vous avez des questions.']);
        await pool.execute(`INSERT INTO messages (conversationId, auteur, contenu, lu, createdAt) VALUES (?, 'client', ?, 0, NOW() - INTERVAL 5 HOUR)`, [c2, 'Merci pour l\'intervention. Par contre j\'ai remarqué un léger bruit au démarrage, est-ce normal ?']);
        console.log('[FixDuplicates] Inserted 2 demo conversations with messages');
      }
    } else {
      console.log('[FixDuplicates] Chat data UTF-8 looks correct, skipping');
    }

    console.log('[FixDuplicates] Done.');
  } catch (e) {
    console.error('[FixDuplicates] Error:', e);
  } finally {
    await pool.end();
  }
}

fixDuplicates();
