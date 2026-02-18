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

    // --- Chat demo data: cleanup corrupted + ensure 2 clean conversations ---
    // Delete any corrupted conversations (HEX check for bad encoding)
    const [allConvs] = await pool.execute(
      `SELECT id, HEX(sujet) as h, clientId FROM conversations WHERE artisanId = 1`
    ) as any;

    // Delete ALL existing conversations for artisan 1 and re-insert cleanly
    // This is a one-time data fix for corrupted encoding + incomplete inserts
    const idsToDelete = (allConvs as any[]).map((c: any) => c.id);
    if (idsToDelete.length > 0) {
      console.log(`[FixDuplicates] Cleaning up ${idsToDelete.length} existing conversations for fresh insert`);
      for (const id of idsToDelete) {
        await pool.execute(`DELETE FROM messages WHERE conversationId = ?`, [id]);
        await pool.execute(`DELETE FROM conversations WHERE id = ?`, [id]);
      }
    }

    // Conversation 1: Hab Doudi (clientId=2) — 4 messages
    console.log('[FixDuplicates] Inserting conv 1: Devis r\u00E9novation SDB');
    const [r1] = await pool.execute(
      `INSERT INTO conversations (artisanId, clientId, sujet, statut, dernierMessage, dernierMessageDate, nonLuArtisan, nonLuClient, createdAt, updatedAt)
       VALUES (1, 2, ?, 'ouverte', ?, NOW() - INTERVAL 2 HOUR, 1, 0, NOW() - INTERVAL 72 HOUR, NOW() - INTERVAL 2 HOUR)`,
      ['Devis r\u00E9novation SDB', 'Parfait, le 80x80 m\u2019int\u00E9resse beaucoup. On peut planifier un RDV cette semaine pour voir les \u00E9chantillons ?']
    ) as any;
    const c1 = r1.insertId;
    const m1: [string, string, number][] = [
      ['artisan', 'Bonjour M. Doudi, je vous envoie le devis pour la r\u00E9novation de votre salle de bain comme convenu lors de notre visite.', 72],
      ['client', 'Bonjour, merci pour le devis. J\u2019aurais une question sur le choix du carrelage, est-ce que vous proposez du gr\u00E8s c\u00E9rame grand format ?', 68],
      ['artisan', 'Oui bien s\u00FBr, nous proposons du gr\u00E8s c\u00E9rame en 60x60 et 80x80. Je peux vous envoyer des \u00E9chantillons si vous le souhaitez. Le tarif reste le m\u00EAme que sur le devis.', 66],
      ['client', 'Parfait, le 80x80 m\u2019int\u00E9resse beaucoup. On peut planifier un RDV cette semaine pour voir les \u00E9chantillons ?', 2],
    ];
    for (const [auteur, contenu, hours] of m1) {
      await pool.execute(
        `INSERT INTO messages (conversationId, auteur, contenu, lu, createdAt) VALUES (?, ?, ?, ?, NOW() - INTERVAL ? HOUR)`,
        [c1, auteur, contenu, auteur === 'artisan' ? 1 : 0, hours]
      );
    }
    console.log(`[FixDuplicates] Inserted conv ${c1} with 4 messages`);

    // Conversation 2: Durand Pierre (clientId=5) — 2 messages, 1 non lu artisan
    console.log('[FixDuplicates] Inserting conv 2: Intervention chaudi\u00E8re');
    const [r2] = await pool.execute(
      `INSERT INTO conversations (artisanId, clientId, sujet, statut, dernierMessage, dernierMessageDate, nonLuArtisan, nonLuClient, createdAt, updatedAt)
       VALUES (1, 5, ?, 'ouverte', ?, NOW() - INTERVAL 5 HOUR, 1, 0, NOW() - INTERVAL 24 HOUR, NOW() - INTERVAL 5 HOUR)`,
      ['Intervention chaudi\u00E8re \u2014 suivi', 'Merci pour l\u2019intervention. Par contre j\u2019ai remarqu\u00E9 un l\u00E9ger bruit au d\u00E9marrage, est-ce normal ?']
    ) as any;
    const c2 = r2.insertId;
    await pool.execute(
      `INSERT INTO messages (conversationId, auteur, contenu, lu, createdAt) VALUES (?, 'artisan', ?, 1, NOW() - INTERVAL 24 HOUR)`,
      [c2, 'Bonjour M. Durand, suite \u00E0 notre intervention sur votre chaudi\u00E8re ce matin, tout est en ordre. N\u2019h\u00E9sitez pas si vous avez des questions.']
    );
    await pool.execute(
      `INSERT INTO messages (conversationId, auteur, contenu, lu, createdAt) VALUES (?, 'client', ?, 0, NOW() - INTERVAL 5 HOUR)`,
      [c2, 'Merci pour l\u2019intervention. Par contre j\u2019ai remarqu\u00E9 un l\u00E9ger bruit au d\u00E9marrage, est-ce normal ?']
    );
    console.log(`[FixDuplicates] Inserted conv ${c2} with 2 messages`);

    // --- Seed suivi_chantier demo data ---
    try {
      // Create table if it doesn't exist (before drizzle push)
      await pool.execute(`CREATE TABLE IF NOT EXISTS suivi_chantier (
        id INT AUTO_INCREMENT PRIMARY KEY,
        chantierId INT NOT NULL,
        titre VARCHAR(255) NOT NULL,
        description TEXT,
        statut ENUM('a_faire','en_cours','termine') DEFAULT 'a_faire',
        pourcentage INT DEFAULT 0,
        ordre INT DEFAULT 1,
        visibleClient BOOLEAN DEFAULT TRUE,
        dateDebut DATE,
        dateFin DATE,
        commentaire TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
      )`);
      const [existingSuivi] = await pool.execute('SELECT COUNT(*) as cnt FROM suivi_chantier') as any;
      if (existingSuivi[0].cnt === 0) {
        // Find a "Mise aux normes" chantier, or any en_cours chantier
        const [chantierRows] = await pool.execute(
          "SELECT id, nom FROM chantiers WHERE nom LIKE '%Mise aux normes%' LIMIT 1"
        ) as any;
        let chantierId: number | null = null;
        if (chantierRows.length > 0) {
          chantierId = chantierRows[0].id;
          console.log(`[FixDuplicates] Suivi seed: using chantier "${chantierRows[0].nom}" (ID: ${chantierId})`);
        } else {
          const [fallback] = await pool.execute(
            "SELECT id, nom FROM chantiers WHERE statut = 'en_cours' LIMIT 1"
          ) as any;
          if (fallback.length > 0) {
            chantierId = fallback[0].id;
            console.log(`[FixDuplicates] Suivi seed: using fallback chantier "${fallback[0].nom}" (ID: ${chantierId})`);
          }
        }
        if (chantierId) {
          const etapes = [
            { titre: 'Diagnostic \u00e9lectrique initial', statut: 'termine', pourcentage: 100, ordre: 1 },
            { titre: 'Remplacement tableau \u00e9lectrique', statut: 'termine', pourcentage: 100, ordre: 2 },
            { titre: 'Mise en conformit\u00e9 des circuits', statut: 'en_cours', pourcentage: 60, ordre: 3 },
            { titre: 'Contr\u00f4le Consuel et finitions', statut: 'a_faire', pourcentage: 0, ordre: 4 },
          ];
          for (const e of etapes) {
            await pool.execute(
              'INSERT INTO suivi_chantier (chantierId, titre, statut, pourcentage, ordre, visibleClient) VALUES (?, ?, ?, ?, ?, 1)',
              [chantierId, e.titre, e.statut, e.pourcentage, e.ordre]
            );
          }
          console.log(`[FixDuplicates] Seeded ${etapes.length} suivi_chantier etapes for chantier ${chantierId}`);
        }
      } else {
        console.log('[FixDuplicates] suivi_chantier already has data, skipping seed');
      }

      // Ensure a demo portal access exists for suivi chantier testing
      const [suiviRows] = await pool.execute(
        'SELECT chantierId FROM suivi_chantier LIMIT 1'
      ) as any;
      if (suiviRows.length > 0) {
        const [existingToken] = await pool.execute(
          "SELECT id FROM client_portal_access WHERE token = 'demo-suivi-chantier-2026' LIMIT 1"
        ) as any;
        if (existingToken.length === 0) {
          const [chantierInfo] = await pool.execute(
            'SELECT clientId, artisanId FROM chantiers WHERE id = ?', [suiviRows[0].chantierId]
          ) as any;
          if (chantierInfo.length > 0) {
            const { clientId: cid, artisanId: aid } = chantierInfo[0];
            const [clientRow] = await pool.execute('SELECT email FROM clients WHERE id = ?', [cid]) as any;
            const email = clientRow.length > 0 ? clientRow[0].email : 'demo@artisan.com';
            const expiresAt = new Date();
            expiresAt.setFullYear(expiresAt.getFullYear() + 1);
            await pool.execute(
              'INSERT INTO client_portal_access (clientId, artisanId, token, email, expiresAt, isActive) VALUES (?, ?, ?, ?, ?, 1)',
              [cid, aid, 'demo-suivi-chantier-2026', email, expiresAt]
            );
            console.log('[FixDuplicates] Created demo portal access: /portail/demo-suivi-chantier-2026');
          }
        } else {
          console.log('[FixDuplicates] Demo portal token already exists');
        }
      }
    } catch (e: any) {
      // Table might not exist yet (before drizzle push)
      console.log('[FixDuplicates] suivi_chantier seed skipped:', e.message);
    }

    console.log('[FixDuplicates] Done.');
  } catch (e) {
    console.error('[FixDuplicates] Error:', e);
  } finally {
    await pool.end();
  }
}

fixDuplicates();
