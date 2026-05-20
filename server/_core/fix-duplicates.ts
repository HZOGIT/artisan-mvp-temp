/**
 * Pre-migration script: fixes duplicate devis/facture numbers
 * Runs BEFORE drizzle-kit push to ensure unique index can be created
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

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

    // --- Add vitrine columns to parametres_artisan (before drizzle push) ---
    const vitrineColumns = [
      { name: 'vitrineActive', sql: 'ADD COLUMN vitrineActive BOOLEAN DEFAULT FALSE' },
      { name: 'vitrineDescription', sql: 'ADD COLUMN vitrineDescription TEXT NULL' },
      { name: 'vitrineZone', sql: 'ADD COLUMN vitrineZone VARCHAR(500) NULL' },
      { name: 'vitrineServices', sql: 'ADD COLUMN vitrineServices TEXT NULL' },
      { name: 'vitrineExperience', sql: 'ADD COLUMN vitrineExperience INT NULL' },
    ];
    for (const col of vitrineColumns) {
      try {
        await pool.execute(`ALTER TABLE parametres_artisan ${col.sql}`);
        console.log(`[FixDuplicates] Added parametres_artisan.${col.name}`);
      } catch (e: any) {
        if (e.code === 'ER_DUP_FIELDNAME' || e.message?.includes('Duplicate column name')) {
          // Already exists
        } else { console.log(`[FixDuplicates] parametres_artisan.${col.name}:`, e.message); }
      }
    }

    // --- Generate slugs for artisans that don't have one ---
    try {
      // Add slug column if it doesn't exist yet (without UNIQUE first)
      try {
        await pool.execute(`ALTER TABLE artisans ADD COLUMN slug VARCHAR(255) NULL`);
        console.log('[FixDuplicates] Added slug column to artisans');
      } catch (e: any) {
        if (e.code === 'ER_DUP_FIELDNAME' || e.message?.includes('Duplicate column name')) {
          // Column already exists
        } else { console.log('[FixDuplicates] slug column:', e.message); }
      }

      // Generate slugs for artisans without one
      const [artisansNoSlug] = await pool.execute(
        'SELECT id, nomEntreprise, specialite FROM artisans WHERE slug IS NULL OR slug = ""'
      ) as any;

      for (const a of artisansNoSlug) {
        const base = (a.nomEntreprise || a.specialite || `artisan-${a.id}`)
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
          .substring(0, 200);
        let slug = base || `artisan-${a.id}`;
        const [existing] = await pool.execute('SELECT id FROM artisans WHERE slug = ? AND id != ?', [slug, a.id]) as any;
        if (existing.length > 0) slug = `${slug}-${a.id}`;
        await pool.execute('UPDATE artisans SET slug = ? WHERE id = ?', [slug, a.id]);
        console.log(`[FixDuplicates] Generated slug "${slug}" for artisan ${a.id}`);
      }

      // Drop any auto-named unique index on slug (from previous deploy), then add with drizzle's expected name
      try {
        await pool.execute(`ALTER TABLE artisans DROP INDEX slug`);
        console.log('[FixDuplicates] Dropped old slug index');
      } catch (e: any) {
        // Index doesn't exist with that name, fine
      }
      try {
        await pool.execute(`ALTER TABLE artisans ADD UNIQUE INDEX artisans_slug_unique (slug)`);
        console.log('[FixDuplicates] Added artisans_slug_unique index');
      } catch (e: any) {
        if (e.code === 'ER_DUP_KEYNAME' || e.message?.includes('Duplicate key name')) {
          // Already exists
        } else { console.log('[FixDuplicates] slug index:', e.message); }
      }
    } catch (e: any) {
      console.log('[FixDuplicates] Slug generation:', e.message);
    }

    // --- Activate vitrine for artisan 1 with demo data ---
    try {
      const [pa] = await pool.execute('SELECT vitrineActive FROM parametres_artisan WHERE artisanId = 1') as any;
      if (pa.length > 0 && !pa[0].vitrineActive) {
        const services = JSON.stringify([
          'Installation plomberie',
          'D\u00e9pannage urgent 24h/24',
          'R\u00e9novation salle de bain',
          'Mise aux normes \u00e9lectriques',
          'Entretien chaudi\u00e8re',
          'Plomberie g\u00e9n\u00e9rale'
        ]);
        await pool.execute(
          `UPDATE parametres_artisan SET vitrineActive = TRUE, vitrineDescription = ?, vitrineZone = ?, vitrineServices = ?, vitrineExperience = ? WHERE artisanId = 1`,
          [
            'Entreprise sp\u00e9cialis\u00e9e en plomberie, \u00e9lectricit\u00e9 et chauffage depuis plus de 15 ans. Nous intervenons rapidement pour tous vos travaux de r\u00e9novation et d\u00e9pannage. Qualit\u00e9, ponctualit\u00e9 et transparence sont nos valeurs.',
            'Paris et \u00cele-de-France',
            services,
            15
          ]
        );
        console.log('[FixDuplicates] Activated vitrine for artisan 1 with demo data');
      } else {
        console.log('[FixDuplicates] Vitrine already active or artisan 1 not found');
      }
    } catch (e: any) {
      console.log('[FixDuplicates] Vitrine activation:', e.message);
    }

    // --- Phase 6 Task 3: Multi-user roles migration ---
    try {
      // Add prenom column
      try {
        await pool.execute(`ALTER TABLE users ADD COLUMN prenom VARCHAR(255) NULL`);
        console.log('[FixDuplicates] Added users.prenom');
      } catch (e: any) {
        if (e.code === 'ER_DUP_FIELDNAME' || e.message?.includes('Duplicate column name')) {
          // Already exists
        } else { console.log('[FixDuplicates] users.prenom:', e.message); }
      }

      // Add artisanId column
      try {
        await pool.execute(`ALTER TABLE users ADD COLUMN artisanId INT NULL`);
        console.log('[FixDuplicates] Added users.artisanId');
      } catch (e: any) {
        if (e.code === 'ER_DUP_FIELDNAME' || e.message?.includes('Duplicate column name')) {
          // Already exists
        } else { console.log('[FixDuplicates] users.artisanId:', e.message); }
      }

      // Add actif column
      try {
        await pool.execute(`ALTER TABLE users ADD COLUMN actif BOOLEAN DEFAULT TRUE NOT NULL`);
        console.log('[FixDuplicates] Added users.actif');
      } catch (e: any) {
        if (e.code === 'ER_DUP_FIELDNAME' || e.message?.includes('Duplicate column name')) {
          // Already exists
        } else { console.log('[FixDuplicates] users.actif:', e.message); }
      }

      // Step 1: Extend role enum to include all values (old + new)
      try {
        await pool.execute(`ALTER TABLE users MODIFY COLUMN role ENUM('user','admin','artisan','secretaire','technicien') DEFAULT 'artisan'`);
        console.log('[FixDuplicates] Extended role enum with all values');
      } catch (e: any) {
        console.log('[FixDuplicates] role enum extend:', e.message);
      }

      // Step 2: Promote all existing 'user' role to 'admin'
      const [promoted] = await pool.execute(`UPDATE users SET role='admin' WHERE role='user'`) as any;
      console.log(`[FixDuplicates] Promoted ${promoted.affectedRows} users from 'user' to 'admin'`);

      // Step 3: Remove 'user' from enum now that no rows use it
      try {
        await pool.execute(`ALTER TABLE users MODIFY COLUMN role ENUM('admin','artisan','secretaire','technicien') DEFAULT 'artisan'`);
        console.log('[FixDuplicates] Finalized role enum (removed user)');
      } catch (e: any) {
        console.log('[FixDuplicates] role enum finalize:', e.message);
      }

      // Step 4: Set artisanId for existing users who own an artisan profile
      const [usersNoArtisanId] = await pool.execute(
        `SELECT u.id, a.id as aId FROM users u JOIN artisans a ON a.userId = u.id WHERE u.artisanId IS NULL`
      ) as any;
      for (const row of usersNoArtisanId) {
        await pool.execute(`UPDATE users SET artisanId = ? WHERE id = ?`, [row.aId, row.id]);
        console.log(`[FixDuplicates] Set artisanId=${row.aId} for user ${row.id}`);
      }

      // Step 5: Add index on artisanId
      try {
        await pool.execute(`ALTER TABLE users ADD INDEX idx_users_artisanId (artisanId)`);
        console.log('[FixDuplicates] Added idx_users_artisanId index');
      } catch (e: any) {
        if (e.code === 'ER_DUP_KEYNAME' || e.message?.includes('Duplicate key name')) {
          // Already exists
        } else { console.log('[FixDuplicates] artisanId index:', e.message); }
      }

      console.log('[FixDuplicates] Multi-user migration complete');
    } catch (e: any) {
      console.log('[FixDuplicates] Multi-user migration error:', e.message);
    }

    // --- Parametres personnalisation columns ---
    try {
      await pool.execute(`ALTER TABLE parametres_artisan ADD COLUMN couleurPrincipale VARCHAR(20) DEFAULT '#4F46E5'`);
      console.log('[FixDuplicates] Added couleurPrincipale column');
    } catch (e: any) {
      if (!e.message.includes('Duplicate column')) console.log('[FixDuplicates] couleurPrincipale:', e.message);
    }
    try {
      await pool.execute(`ALTER TABLE parametres_artisan ADD COLUMN couleurSecondaire VARCHAR(20) DEFAULT '#6366F1'`);
      console.log('[FixDuplicates] Added couleurSecondaire column');
    } catch (e: any) {
      if (!e.message.includes('Duplicate column')) console.log('[FixDuplicates] couleurSecondaire:', e.message);
    }
    try {
      await pool.execute(`ALTER TABLE parametres_artisan ADD COLUMN conditionsPaiementDefaut TEXT`);
      console.log('[FixDuplicates] Added conditionsPaiementDefaut column');
    } catch (e: any) {
      if (!e.message.includes('Duplicate column')) console.log('[FixDuplicates] conditionsPaiementDefaut:', e.message);
    }

    // --- Per-user permissions table + seed ---
    try {
      await pool.execute(`CREATE TABLE IF NOT EXISTS permissions_utilisateur (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId INT NOT NULL,
        permission VARCHAR(50) NOT NULL,
        autorise BOOLEAN DEFAULT TRUE NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        UNIQUE KEY unique_user_permission (userId, permission),
        INDEX idx_permissions_userId (userId)
      )`);
      console.log('[FixDuplicates] Created/verified permissions_utilisateur table');

      // Permission templates (must match shared/permissions.ts ROLE_TEMPLATES)
      const allPerms = [
        'dashboard.voir','statistiques.voir',
        'devis.voir','devis.creer','devis.supprimer',
        'factures.voir','factures.creer','factures.supprimer',
        'contrats.voir','contrats.gerer','relances.voir',
        'clients.voir','clients.gerer','chat.voir','portail.gerer','rdv.gerer',
        'interventions.voir','interventions.gerer','calendrier.voir',
        'chantiers.voir','chantiers.gerer','techniciens.voir','geolocalisation.voir',
        'articles.voir','comptabilite.voir','exports.voir',
        'parametres.voir','utilisateurs.gerer','vitrine.gerer',
      ];
      const permTemplates: Record<string, string[]> = {
        admin: allPerms,
        artisan: allPerms.filter(p => p !== 'utilisateurs.gerer'),
        secretaire: [
          'dashboard.voir','statistiques.voir',
          'devis.voir','devis.creer','devis.supprimer',
          'factures.voir','factures.creer','factures.supprimer',
          'contrats.voir','relances.voir',
          'clients.voir','clients.gerer','chat.voir','portail.gerer','rdv.gerer',
        ],
        technicien: [
          'dashboard.voir',
          'interventions.voir','interventions.gerer','calendrier.voir',
          'chantiers.voir','chantiers.gerer','techniciens.voir','geolocalisation.voir',
        ],
      };

      // Seed permissions for existing users who don't have any yet
      const [allUsersForPerms] = await pool.execute('SELECT id, role FROM users WHERE actif = 1') as any;
      for (const u of allUsersForPerms) {
        const [existing] = await pool.execute(
          'SELECT COUNT(*) as cnt FROM permissions_utilisateur WHERE userId = ?', [u.id]
        ) as any;
        if (existing[0].cnt === 0) {
          const perms = permTemplates[u.role] || permTemplates.artisan;
          for (const perm of perms) {
            await pool.execute(
              'INSERT IGNORE INTO permissions_utilisateur (userId, permission, autorise) VALUES (?, ?, 1)',
              [u.id, perm]
            );
          }
          console.log(`[FixDuplicates] Seeded ${perms.length} permissions for user ${u.id} (${u.role})`);
        }
      }
      console.log('[FixDuplicates] Permissions seed complete');
    } catch (e: any) {
      console.log('[FixDuplicates] Permissions migration error:', e.message);
    }

    // --- Demo collaborators seed ---
    try {
      const demoCollabs = [
        { email: 'marie.dupont@demo.fr', name: 'Dupont', prenom: 'Marie', role: 'secretaire' },
        { email: 'lucas.martin@demo.fr', name: 'Martin', prenom: 'Lucas', role: 'technicien' },
      ];
      // Find the first artisan to attach collaborators to
      const [artisanRows] = await pool.execute('SELECT id FROM artisans ORDER BY id LIMIT 1') as any;
      if (artisanRows.length > 0) {
        const artisanId = artisanRows[0].id;
        const demoHash = await bcrypt.hash('demo1234', 10);
        for (const c of demoCollabs) {
          const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [c.email]) as any;
          if (existing.length === 0) {
            await pool.execute(
              `INSERT INTO users (email, name, prenom, password, loginMethod, role, artisanId, actif)
               VALUES (?, ?, ?, ?, 'password', ?, ?, 1)`,
              [c.email, c.name, c.prenom, demoHash, c.role, artisanId]
            );
            // Seed permissions for the new collaborator
            const [newUser] = await pool.execute('SELECT id FROM users WHERE email = ?', [c.email]) as any;
            if (newUser.length > 0) {
              const perms = permTemplates[c.role] || permTemplates.artisan;
              for (const perm of perms) {
                await pool.execute(
                  'INSERT IGNORE INTO permissions_utilisateur (userId, permission, autorise) VALUES (?, ?, 1)',
                  [newUser[0].id, perm]
                );
              }
            }
            console.log(`[FixDuplicates] Created demo collaborator: ${c.prenom} ${c.name} (${c.role})`);
          } else {
            console.log(`[FixDuplicates] Demo collaborator ${c.email} already exists, skipping`);
          }
        }
      }
    } catch (e: any) {
      console.log('[FixDuplicates] Demo collaborators seed error:', e.message);
    }

    // Add modePaiement column to factures if not exists
    try {
      const [cols] = await pool.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'factures' AND COLUMN_NAME = 'modePaiement'`
      ) as any;
      if (cols.length === 0) {
        await pool.execute(`ALTER TABLE factures ADD COLUMN modePaiement VARCHAR(50) DEFAULT NULL`);
        console.log('[FixDuplicates] Added modePaiement column to factures');
      }
    } catch (e: any) {
      console.log('[FixDuplicates] modePaiement column check:', e.message);
    }

    // Extend factures.statut enum to include 'validee' (drizzle-kit push skips
    // enum modifications in non-interactive mode, so we apply this manually).
    // Idempotent: running MODIFY with the same enum is a no-op.
    try {
      await pool.execute(
        `ALTER TABLE factures MODIFY COLUMN statut ENUM('brouillon','validee','envoyee','payee','en_retard','annulee') DEFAULT 'brouillon'`
      );
      console.log('[FixDuplicates] Ensured factures.statut enum includes validee');
    } catch (e: any) {
      console.log('[FixDuplicates] factures.statut enum migration:', e.message || e);
    }

    // Widen artisans.logo from TEXT (65 KB) to MEDIUMTEXT (16 MB). The upload
    // endpoint accepts up to 2 MB binary which becomes ~2.7 MB once base64-
    // encoded, so TEXT was hard-failing every realistic logo with ER_DATA_TOO_LONG.
    // Idempotent: MODIFY to the same type is a no-op.
    try {
      await pool.execute(`ALTER TABLE artisans MODIFY COLUMN logo MEDIUMTEXT`);
      console.log('[FixDuplicates] Widened artisans.logo to MEDIUMTEXT');
    } catch (e: any) {
      console.log('[FixDuplicates] artisans.logo widen:', e.message || e);
    }

    // T9 IA contextuelle : ajout colonne metier sur artisans. Permet de
    // selectionner le contexte IA specialise (12 metiers vs 4 specialites
    // enum existantes). Stocke en VARCHAR libre, lu par metierFromArtisan
    // cote routers. Idempotent.
    try {
      await pool.execute(`ALTER TABLE artisans ADD COLUMN metier VARCHAR(50) DEFAULT NULL`);
      console.log('[FixDuplicates] Added metier column to artisans');
    } catch (e: any) {
      if (e.code === 'ER_DUP_FIELDNAME' || e.message?.includes('Duplicate column name')) {
        // OK deja la
      } else {
        console.log('[FixDuplicates] artisans.metier add:', e.message || e);
      }
    }

    // ========================================================================
    // Migrate commandes_fournisseurs: add new columns + fix statut enum
    // ========================================================================
    try {
      // Add missing columns to commandes_fournisseurs
      const newCols = [
        { name: 'numero', sql: "VARCHAR(20) DEFAULT NULL" },
        { name: 'totalHT', sql: "DECIMAL(10,2) DEFAULT NULL" },
        { name: 'totalTVA', sql: "DECIMAL(10,2) DEFAULT NULL" },
        { name: 'totalTTC', sql: "DECIMAL(10,2) DEFAULT NULL" },
        { name: 'delaiLivraison', sql: "VARCHAR(100) DEFAULT NULL" },
        { name: 'adresseLivraison', sql: "TEXT DEFAULT NULL" },
      ];
      for (const col of newCols) {
        const [existing] = await pool.execute(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'commandes_fournisseurs' AND COLUMN_NAME = ?`,
          [col.name]
        ) as any;
        if (existing.length === 0) {
          await pool.execute(`ALTER TABLE commandes_fournisseurs ADD COLUMN ${col.name} ${col.sql}`);
          console.log(`[FixDuplicates] Added ${col.name} to commandes_fournisseurs`);
        }
      }

      // Migrate statut enum: en_attente→brouillon, expediee→envoyee
      try {
        await pool.execute(`ALTER TABLE commandes_fournisseurs MODIFY COLUMN statut ENUM('brouillon','envoyee','confirmee','livree','annulee') DEFAULT 'brouillon'`);
        // Migrate old values
        await pool.execute(`UPDATE commandes_fournisseurs SET statut = 'brouillon' WHERE statut = 'en_attente' OR statut IS NULL`);
        await pool.execute(`UPDATE commandes_fournisseurs SET statut = 'envoyee' WHERE statut = 'expediee'`);
        console.log('[FixDuplicates] Migrated commandes_fournisseurs statut enum');
      } catch (e: any) {
        // If old values still exist that prevent enum change, update them first
        if (e.message?.includes('Data truncated')) {
          await pool.execute(`UPDATE commandes_fournisseurs SET statut = 'brouillon' WHERE statut NOT IN ('brouillon','envoyee','confirmee','livree','annulee')`);
          await pool.execute(`ALTER TABLE commandes_fournisseurs MODIFY COLUMN statut ENUM('brouillon','envoyee','confirmee','livree','annulee') DEFAULT 'brouillon'`);
          console.log('[FixDuplicates] Migrated commandes_fournisseurs statut enum (retry)');
        } else {
          console.log('[FixDuplicates] statut enum migration:', e.message);
        }
      }

      // Add missing columns to lignes_commandes_fournisseurs
      const ligneNewCols = [
        { name: 'articleId', sql: "INT DEFAULT NULL" },
        { name: 'unite', sql: "VARCHAR(20) DEFAULT 'unité'" },
        { name: 'tauxTVA', sql: "DECIMAL(5,2) DEFAULT 20.00" },
      ];
      for (const col of ligneNewCols) {
        const [existing] = await pool.execute(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lignes_commandes_fournisseurs' AND COLUMN_NAME = ?`,
          [col.name]
        ) as any;
        if (existing.length === 0) {
          await pool.execute(`ALTER TABLE lignes_commandes_fournisseurs ADD COLUMN ${col.name} ${col.sql}`);
          console.log(`[FixDuplicates] Added ${col.name} to lignes_commandes_fournisseurs`);
        }
      }

      // Backfill numero for existing commandes without one
      const [noNumero] = await pool.execute(
        `SELECT id, artisanId FROM commandes_fournisseurs WHERE numero IS NULL OR numero = ''`
      ) as any;
      for (const cmd of noNumero) {
        const [maxRows] = await pool.execute(
          `SELECT COUNT(*) as cnt FROM commandes_fournisseurs WHERE artisanId = ? AND numero IS NOT NULL AND numero != ''`,
          [cmd.artisanId]
        ) as any;
        const next = (maxRows[0]?.cnt || 0) + 1;
        const numero = `CMD-${String(next).padStart(5, '0')}`;
        await pool.execute(`UPDATE commandes_fournisseurs SET numero = ? WHERE id = ?`, [numero, cmd.id]);
      }
      if (noNumero.length > 0) console.log(`[FixDuplicates] Backfilled ${noNumero.length} commande numeros`);

    } catch (e: any) {
      console.log('[FixDuplicates] commandes_fournisseurs migration:', e.message);
    }

    // ========================================================================
    // MODULES — tables modules + artisan_modules + 3 colonnes artisans + seed
    // Bloc entierement defensif : si une erreur survient, on logue et on
    // CONTINUE pour ne JAMAIS bloquer le demarrage du serveur.
    // ========================================================================
    try {
      // 1) Tables (CREATE IF NOT EXISTS = idempotent)
      await pool.execute(`CREATE TABLE IF NOT EXISTS modules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        slug VARCHAR(50) NOT NULL UNIQUE,
        label VARCHAR(100) NOT NULL,
        description TEXT,
        icon VARCHAR(50) NOT NULL,
        categorie VARCHAR(50) NOT NULL,
        plan_minimum VARCHAR(20) NOT NULL DEFAULT 'essentiel',
        actif_par_defaut BOOLEAN NOT NULL DEFAULT TRUE,
        ordre INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
      console.log('[Modules] Table modules OK');

      await pool.execute(`CREATE TABLE IF NOT EXISTS artisan_modules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        artisan_id INT NOT NULL,
        module_slug VARCHAR(50) NOT NULL,
        actif BOOLEAN NOT NULL DEFAULT TRUE,
        activated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_artisan_module (artisan_id, module_slug),
        INDEX idx_artisan_modules_artisan (artisan_id)
      )`);
      console.log('[Modules] Table artisan_modules OK');

      // 2) Colonnes artisans — ALTER ADD avec gestion ER_DUP_FIELDNAME.
      const alterCols = [
        { name: 'metier', sql: "ADD COLUMN metier VARCHAR(100) NULL" },
        { name: 'plan', sql: "ADD COLUMN plan VARCHAR(20) DEFAULT 'essentiel'" },
        { name: 'onboarding_completed', sql: "ADD COLUMN onboarding_completed BOOLEAN DEFAULT FALSE" },
      ];
      for (const col of alterCols) {
        try {
          await pool.execute(`ALTER TABLE artisans ${col.sql}`);
          console.log(`[Modules] Added artisans.${col.name}`);
        } catch (e: any) {
          const msg = e?.message || '';
          const code = e?.code || '';
          if (code === 'ER_DUP_FIELDNAME' || msg.includes('Duplicate column name')) {
            // colonne deja presente, ok
          } else {
            console.log(`[Modules] artisans.${col.name} :`, msg);
          }
        }
      }
      console.log('[Modules] Colonnes artisans OK');

      // 3) Seed catalogue 18 modules (INSERT IGNORE = idempotent)
      const seedModules: Array<[string, string, string, string, string, string, number, number]> = [
        ['devis', 'Devis', 'Créez et envoyez des devis professionnels', 'FileText', 'commercial', 'essentiel', 1, 1],
        ['factures', 'Factures', 'Facturez vos clients et suivez les paiements', 'Receipt', 'commercial', 'essentiel', 1, 2],
        ['contrats', 'Contrats', 'Gérez vos contrats de maintenance', 'FileCheck', 'commercial', 'pro', 1, 3],
        ['relances', 'Relances', 'Relancez automatiquement les impayés', 'Bell', 'commercial', 'essentiel', 1, 4],
        ['signature', 'Signature électronique', 'Faites signer vos devis en ligne', 'PenTool', 'commercial', 'pro', 1, 5],
        ['clients', 'Clients', 'Gérez votre base clients', 'Users', 'clients', 'essentiel', 1, 6],
        ['portail_client', 'Portail client', 'Espace dédié pour vos clients', 'Globe', 'clients', 'pro', 1, 7],
        ['chat', 'Chat client', 'Messagerie intégrée avec vos clients', 'MessageCircle', 'clients', 'pro', 0, 8],
        ['rdv', 'Prise de RDV', 'Permettez à vos clients de prendre RDV', 'Calendar', 'clients', 'pro', 0, 9],
        ['interventions', 'Interventions', 'Planifiez et suivez vos interventions', 'Wrench', 'terrain', 'essentiel', 1, 10],
        ['geolocalisation', 'Géolocalisation', 'Localisez vos techniciens', 'MapPin', 'terrain', 'entreprise', 0, 11],
        ['stocks', 'Stocks', 'Gérez vos articles et stocks', 'Package', 'gestion', 'pro', 1, 12],
        ['commandes', 'Commandes fournisseurs', 'Créez des bons de commande', 'ShoppingCart', 'gestion', 'pro', 1, 13],
        ['comptabilite', 'Comptabilité', 'Export FEC et rapports financiers', 'Calculator', 'gestion', 'essentiel', 1, 14],
        ['assistant_ia', 'Assistant IA', 'MonAssistant votre IA intégrée', 'Sparkles', 'ia', 'pro', 1, 15],
        ['vehicules', 'Véhicules & Flotte', 'Gérez vos véhicules, entretiens et assurances', 'Truck', 'terrain', 'pro', 0, 16],
        ['conges', 'Congés & Absences', 'Gérez les congés et absences de votre équipe', 'CalendarOff', 'gestion', 'pro', 0, 17],
        ['badges', 'Badges & Classement', 'Motivez vos techniciens avec un système de scores', 'Trophy', 'gestion', 'entreprise', 0, 18],
      ];
      for (const m of seedModules) {
        await pool.execute(
          `INSERT IGNORE INTO modules
           (slug, label, description, icon, categorie, plan_minimum, actif_par_defaut, ordre)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          m
        );
      }
      console.log(`[Modules] Seed ${seedModules.length} modules OK`);
    } catch (e: any) {
      console.error('[Modules] Migration non-bloquante :', e?.message || e);
      // NE JAMAIS throw ici : on doit laisser le serveur demarrer.
    }

    // ========================================================================
    // Index SQL pour accelerer les requetes par artisan_id (filtre present
    // sur quasi toutes les queries). MySQL ne supporte pas IF NOT EXISTS
    // sur CREATE INDEX → catch ER_DUP_KEYNAME pour idempotence.
    // ========================================================================
    const indexes: Array<{ table: string; col: string; name: string }> = [
      { table: 'clients', col: 'artisanId', name: 'idx_clients_artisanId' },
      { table: 'devis', col: 'artisanId', name: 'idx_devis_artisanId' },
      { table: 'factures', col: 'artisanId', name: 'idx_factures_artisanId' },
      { table: 'interventions', col: 'artisanId', name: 'idx_interventions_artisanId' },
      { table: 'notifications', col: 'artisanId', name: 'idx_notifications_artisanId' },
      { table: 'artisan_modules', col: 'artisan_id', name: 'idx_artisan_modules_artisan_id' },
    ];
    for (const idx of indexes) {
      try {
        await pool.execute(`ALTER TABLE ${idx.table} ADD INDEX ${idx.name} (${idx.col})`);
        console.log(`[Index] ${idx.name} cree`);
      } catch (e: any) {
        if (e?.code === 'ER_DUP_KEYNAME' || e?.message?.includes('Duplicate key name')) {
          // index deja present, ok
        } else {
          console.log(`[Index] ${idx.name} :`, e?.message);
        }
      }
    }

    // ========================================================================
    // Force l'artisan demo (id=1) en plan ENTREPRISE + active TOUS les modules.
    // Bloc separe, idempotent, non-bloquant.
    // ========================================================================
    try {
      const [planUpdate] = await pool.execute(
        "UPDATE artisans SET plan = 'entreprise' WHERE id = 1"
      ) as any;
      if (planUpdate.affectedRows > 0) {
        console.log("[Demo] Artisan 1 -> plan='entreprise'");
      } else {
        console.log("[Demo] Artisan id=1 introuvable (ou deja en entreprise) - skip");
      }

      const [modUpsert] = await pool.execute(
        `INSERT INTO artisan_modules (artisan_id, module_slug, actif)
         SELECT 1, slug, TRUE FROM modules
         ON DUPLICATE KEY UPDATE actif = TRUE`
      ) as any;
      console.log(`[Demo] artisan_modules upsert : affectedRows=${modUpsert.affectedRows}`);

      // Marque aussi onboarding_completed=TRUE pour ne pas bloquer la
      // navigation derriere /onboarding pour ce compte demo.
      await pool.execute(
        "UPDATE artisans SET onboarding_completed = TRUE WHERE id = 1"
      );

      // Reset notifications demo : passe tout en 'lu = TRUE' pour
      // l'artisan demo afin de ne pas afficher 53+ notifications de test
      // qui s'accumulent dans le badge rouge de la cloche. Idempotent.
      try {
        const [notifReset] = await pool.execute(
          "UPDATE notifications SET lu = TRUE WHERE artisanId = 1 AND lu = FALSE"
        ) as any;
        if (notifReset?.affectedRows > 0) {
          console.log(`[Demo] ${notifReset.affectedRows} notifications marquees comme lues`);
        }
      } catch (e: any) {
        console.log("[Demo] reset notifications :", e?.message);
      }

      // Elargissement colonnes TEXT susceptibles de recevoir des data
      // URLs base64 (photos JPG iPhone -> facile 2 a 3 MB). TEXT MySQL
      // est plafonne a 65 535 octets, ce qui generait des erreurs
      // 'Data too long for column' lors de l'upload, et MySQL renvoyait
      // un message 'Failed query: insert into photos_analyse ... [image]'
      // (la valeur etait tronquee dans le log driver, d'ou la confusion
      // qui faisait penser que '[image]' etait litteralement inserte).
      //
      // Fix : MEDIUMTEXT (~16 MB) ce qui couvre largement le cas iPhone
      // WhatsApp. ALTER idempotent : MySQL accepte de re-modifier une
      // colonne deja en MEDIUMTEXT (no-op).
      try {
        await pool.execute(
          "ALTER TABLE photos_analyse MODIFY COLUMN url MEDIUMTEXT NOT NULL"
        );
        console.log("[Schema] photos_analyse.url -> MEDIUMTEXT");
      } catch (e: any) {
        console.log("[Schema] photos_analyse.url ALTER :", e?.message);
      }
      try {
        await pool.execute(
          "ALTER TABLE interventions_mobile MODIFY COLUMN signatureClient MEDIUMTEXT NULL"
        );
        console.log("[Schema] interventions_mobile.signatureClient -> MEDIUMTEXT");
      } catch (e: any) {
        console.log("[Schema] interventions_mobile.signatureClient ALTER :", e?.message);
      }

      // ========================================================================
      // Module DEPENSES & Notes de frais (T1 mission Expensya-like)
      // 7 tables custom + seed categories par defaut + 2 modules dans le
      // catalogue. Tout dans un try local qui catch en silence pour ne
      // jamais bloquer le boot.
      // ========================================================================
      try {
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS depenses (
          id INT PRIMARY KEY AUTO_INCREMENT,
          artisan_id INT NOT NULL,
          user_id INT NOT NULL,
          numero VARCHAR(20) NOT NULL,
          date_depense DATE NOT NULL,
          fournisseur VARCHAR(255),
          categorie VARCHAR(50) NOT NULL,
          sous_categorie VARCHAR(100),
          description TEXT,
          montant_ht DECIMAL(10,2) NOT NULL DEFAULT 0,
          taux_tva DECIMAL(5,2) DEFAULT 20,
          montant_tva DECIMAL(10,2) DEFAULT 0,
          montant_ttc DECIMAL(10,2) NOT NULL DEFAULT 0,
          mode_paiement ENUM('carte','especes','virement','cheque','prelevement') DEFAULT 'carte',
          statut ENUM('brouillon','soumise','approuvee','rejetee','remboursee') DEFAULT 'brouillon',
          remboursable BOOLEAN DEFAULT TRUE,
          rembourse BOOLEAN DEFAULT FALSE,
          date_remboursement DATE,
          chantier_id INT,
          intervention_id INT,
          client_id INT,
          notes TEXT,
          justificatif_url MEDIUMTEXT,
          justificatif_nom VARCHAR(255),
          ocr_brut TEXT,
          ocr_traite BOOLEAN DEFAULT FALSE,
          recurrente BOOLEAN DEFAULT FALSE,
          frequence_recurrence ENUM('mensuelle','trimestrielle','annuelle'),
          prochaine_occurrence DATE,
          tva_deductible BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_depenses_artisan (artisan_id),
          INDEX idx_depenses_date (date_depense),
          INDEX idx_depenses_statut (statut)
        )
      `);
      console.log('[Depenses] Table depenses OK');

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS categories_depenses (
          id INT PRIMARY KEY AUTO_INCREMENT,
          artisan_id INT NOT NULL,
          nom VARCHAR(100) NOT NULL,
          couleur VARCHAR(20) DEFAULT '#6366f1',
          icone VARCHAR(50) DEFAULT 'Receipt',
          compte_comptable VARCHAR(10),
          deductible_tva BOOLEAN DEFAULT TRUE,
          deductible_ir BOOLEAN DEFAULT TRUE,
          plafond_mensuel DECIMAL(10,2),
          actif BOOLEAN DEFAULT TRUE,
          ordre INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_cat_artisan_nom (artisan_id, nom),
          INDEX idx_cat_depenses_artisan (artisan_id)
        )
      `);
      console.log('[Depenses] Table categories_depenses OK');

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS notes_de_frais (
          id INT PRIMARY KEY AUTO_INCREMENT,
          artisan_id INT NOT NULL,
          user_id INT NOT NULL,
          numero VARCHAR(20) NOT NULL,
          titre VARCHAR(255) NOT NULL,
          periode_debut DATE NOT NULL,
          periode_fin DATE NOT NULL,
          statut ENUM('brouillon','soumise','approuvee','rejetee','payee') DEFAULT 'brouillon',
          montant_total DECIMAL(10,2) DEFAULT 0,
          montant_rembourse DECIMAL(10,2) DEFAULT 0,
          date_soumission DATE,
          date_approbation DATE,
          date_paiement DATE,
          commentaire_approbateur TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_ndf_artisan (artisan_id),
          INDEX idx_ndf_user (user_id),
          INDEX idx_ndf_statut (statut)
        )
      `);
      console.log('[Depenses] Table notes_de_frais OK');

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS notes_frais_depenses (
          id INT PRIMARY KEY AUTO_INCREMENT,
          note_id INT NOT NULL,
          depense_id INT NOT NULL,
          UNIQUE KEY uq_note_depense (note_id, depense_id),
          INDEX idx_nfd_note (note_id),
          INDEX idx_nfd_depense (depense_id)
        )
      `);
      console.log('[Depenses] Table notes_frais_depenses OK');

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS budgets_categories (
          id INT PRIMARY KEY AUTO_INCREMENT,
          artisan_id INT NOT NULL,
          categorie VARCHAR(50) NOT NULL,
          mois VARCHAR(7) NOT NULL,
          budget DECIMAL(10,2) DEFAULT 0,
          depense_reelle DECIMAL(10,2) DEFAULT 0,
          UNIQUE KEY uq_budget_mois (artisan_id, categorie, mois)
        )
      `);
      console.log('[Depenses] Table budgets_categories OK');

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS releves_bancaires (
          id INT PRIMARY KEY AUTO_INCREMENT,
          artisan_id INT NOT NULL,
          nom_fichier VARCHAR(255) NOT NULL,
          date_import TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          nb_transactions INT DEFAULT 0,
          nb_importees INT DEFAULT 0,
          statut ENUM('en_cours','termine','erreur') DEFAULT 'en_cours'
        )
      `);
      console.log('[Depenses] Table releves_bancaires OK');

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS transactions_bancaires (
          id INT PRIMARY KEY AUTO_INCREMENT,
          artisan_id INT NOT NULL,
          releve_id INT,
          date_transaction DATE NOT NULL,
          libelle TEXT NOT NULL,
          montant DECIMAL(10,2) NOT NULL,
          type_transaction ENUM('debit','credit') NOT NULL,
          categorie_suggeree VARCHAR(50),
          depense_id INT,
          ignoree BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_trx_artisan (artisan_id),
          INDEX idx_trx_releve (releve_id)
        )
      `);
      console.log('[Depenses] Table transactions_bancaires OK');

      // Regles de categorisation auto (T10C)
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS regles_categorisation (
          id INT PRIMARY KEY AUTO_INCREMENT,
          artisan_id INT NOT NULL,
          motif_libelle VARCHAR(255) NOT NULL,
          categorie VARCHAR(50) NOT NULL,
          actif BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_regles_artisan (artisan_id)
        )
      `);
      console.log('[Depenses] Table regles_categorisation OK');

      // Seed catégories par defaut pour l'artisan demo id=1.
      // INSERT IGNORE evite les doublons en cas de redeploiement.
      const categoriesDefaut: Array<[number, string, string, string, string, number]> = [
        [1, 'Matériaux & Fournitures', '#ef4444', 'Package', '601000', 1],
        [1, 'Carburant', '#f97316', 'Fuel', '606100', 2],
        [1, 'Outillage & Équipement', '#eab308', 'Wrench', '615000', 3],
        [1, 'Repas & Restauration', '#22c55e', 'UtensilsCrossed', '625100', 4],
        [1, 'Déplacement & Transport', '#3b82f6', 'Car', '625000', 5],
        [1, 'Téléphone & Internet', '#8b5cf6', 'Smartphone', '626000', 6],
        [1, 'Sous-traitance', '#ec4899', 'Users', '604000', 7],
        [1, 'Assurances', '#14b8a6', 'Shield', '616000', 8],
        [1, 'Loyer & Charges', '#f59e0b', 'Building', '613000', 9],
        [1, 'Formation & Documentation', '#6366f1', 'BookOpen', '623000', 10],
        [1, 'Frais bancaires', '#64748b', 'CreditCard', '627000', 11],
        [1, 'Autres frais', '#94a3b8', 'MoreHorizontal', '628000', 12],
      ];
      for (const c of categoriesDefaut) {
        await pool.execute(
          `INSERT IGNORE INTO categories_depenses
             (artisan_id, nom, couleur, icone, compte_comptable, ordre)
           VALUES (?, ?, ?, ?, ?, ?)`,
          c
        );
      }
      console.log(`[Depenses] Seed ${categoriesDefaut.length} categories defaut artisan 1`);

      // 2 nouveaux modules dans le catalogue (depenses + budgets).
      // INSERT IGNORE idempotent + auto-activation pour l'artisan 1.
      await pool.execute(
        `INSERT IGNORE INTO modules (slug, label, description, icon, categorie, plan_minimum, actif_par_defaut, ordre) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['depenses', 'Dépenses & Notes de frais', 'Gérez vos dépenses, notes de frais et budgets', 'Receipt', 'gestion', 'essentiel', 1, 19]
      );
      await pool.execute(
        `INSERT IGNORE INTO modules (slug, label, description, icon, categorie, plan_minimum, actif_par_defaut, ordre) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['budgets', 'Budgets', 'Contrôlez vos dépenses par catégorie', 'PiggyBank', 'gestion', 'pro', 0, 20]
      );
      await pool.execute(
        `INSERT INTO artisan_modules (artisan_id, module_slug, actif)
         VALUES (1, 'depenses', TRUE), (1, 'budgets', TRUE)
         ON DUPLICATE KEY UPDATE actif = TRUE`
      );
      console.log('[Depenses] Modules depenses + budgets actives pour artisan 1');
      } catch (e: any) {
        console.log('[Depenses] Migration non-bloquante :', e?.message || e);
      }

      const [pRows] = await pool.execute("SELECT plan FROM artisans WHERE id = 1") as any;
      const [cRows] = await pool.execute(
        "SELECT COUNT(*) AS cnt FROM artisan_modules WHERE artisan_id = 1 AND actif = TRUE"
      ) as any;
      console.log(`[Demo] Verification : plan=${pRows[0]?.plan ?? '(null)'}, modules actifs=${cRows[0]?.cnt ?? 0}`);
    } catch (e: any) {
      console.log("[Demo] Force entreprise :", e?.message || e);
    }

    // ========================================================================
    // T1 — Migrations abonnements / appareils / sessions
    // Idempotent : tout passe par CREATE IF NOT EXISTS / try-catch, donc
    // sans risque sur redeploiement.
    // ========================================================================
    try {
      // --- 1A. Table subscriptions ---
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS subscriptions (
          id INT PRIMARY KEY AUTO_INCREMENT,
          artisan_id INT NOT NULL UNIQUE,
          stripe_customer_id VARCHAR(100),
          stripe_subscription_id VARCHAR(100),
          stripe_price_id VARCHAR(100),
          plan VARCHAR(20) NOT NULL DEFAULT 'trial',
          status VARCHAR(20) NOT NULL DEFAULT 'trialing',
          trial_ends_at TIMESTAMP NULL,
          current_period_start TIMESTAMP NULL,
          current_period_end TIMESTAMP NULL,
          cancel_at_period_end BOOLEAN DEFAULT FALSE,
          max_users INT NOT NULL DEFAULT 1,
          max_devices_per_user INT NOT NULL DEFAULT 3,
          max_concurrent_sessions INT NOT NULL DEFAULT 2,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_subscriptions_artisan_id (artisan_id),
          INDEX idx_subscriptions_status (status),
          INDEX idx_subscriptions_trial_ends_at (trial_ends_at)
        )
      `);
      console.log('[Subscriptions] Table OK');

      // --- 1B. Table devices ---
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS devices (
          id INT PRIMARY KEY AUTO_INCREMENT,
          user_id INT NOT NULL,
          artisan_id INT NOT NULL,
          device_fingerprint VARCHAR(255) NOT NULL,
          device_type ENUM('desktop','mobile','tablet') DEFAULT 'desktop',
          browser VARCHAR(100),
          os VARCHAR(100),
          last_ip VARCHAR(45),
          last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_user_device (user_id, device_fingerprint),
          INDEX idx_devices_user_id (user_id),
          INDEX idx_devices_artisan_id (artisan_id)
        )
      `);
      console.log('[Devices] Table OK');

      // --- 1C. Table active_sessions ---
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS active_sessions (
          id INT PRIMARY KEY AUTO_INCREMENT,
          user_id INT NOT NULL,
          artisan_id INT NOT NULL,
          session_token VARCHAR(255) NOT NULL UNIQUE,
          device_fingerprint VARCHAR(255),
          ip VARCHAR(45),
          started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          expires_at TIMESTAMP NOT NULL,
          INDEX idx_sessions_user_id (user_id),
          INDEX idx_sessions_artisan_id (artisan_id),
          INDEX idx_sessions_expires_at (expires_at)
        )
      `);
      console.log('[Sessions] Table OK');

      // --- 1D. Colonnes additionnelles sur artisans ---
      // MySQL < 8.0.29 ne supporte pas ADD COLUMN IF NOT EXISTS. On utilise
      // un try/catch defensif sur chaque colonne pour rester compatible.
      for (const col of [
        { name: 'trial_ends_at', ddl: 'ADD COLUMN trial_ends_at TIMESTAMP NULL DEFAULT NULL' },
        { name: 'subscription_status', ddl: "ADD COLUMN subscription_status VARCHAR(20) DEFAULT 'trial'" },
      ]) {
        try {
          await pool.execute(`ALTER TABLE artisans ${col.ddl}`);
          console.log(`[Artisans] Colonne ${col.name} ajoutee`);
        } catch (e: any) {
          if (e?.code === 'ER_DUP_FIELDNAME' || e?.message?.includes('Duplicate column')) {
            // deja la, ok
          } else {
            console.log(`[Artisans] ${col.name} :`, e?.message);
          }
        }
      }

      // --- 1E. Seed initial subscriptions ---
      // Artisan 1 (demo) : plan entreprise actif, essai 30j, max 10 users.
      await pool.execute(
        `INSERT IGNORE INTO subscriptions
           (artisan_id, plan, status, trial_ends_at,
            max_users, max_devices_per_user, max_concurrent_sessions)
         SELECT id, 'entreprise', 'active',
                DATE_ADD(NOW(), INTERVAL 30 DAY),
                10, 3, 4
         FROM artisans
         WHERE id = 1`
      );

      // Tous les autres artisans : essai gratuit 30j, plan trial.
      const [seedOthers] = await pool.execute(
        `INSERT IGNORE INTO subscriptions
           (artisan_id, plan, status, trial_ends_at,
            max_users, max_devices_per_user, max_concurrent_sessions)
         SELECT id, 'trial', 'trialing',
                DATE_ADD(NOW(), INTERVAL 30 DAY),
                1, 3, 2
         FROM artisans
         WHERE id != 1`
      ) as any;
      console.log(`[Subscriptions] Seed initial : ${seedOthers.affectedRows} artisan(s) ajoute(s)`);
    } catch (e: any) {
      console.log('[Subscriptions] Migration :', e?.message || e);
    }

    // ========================================================================
    // Tables custom hors schema.ts (raw SQL idempotent)
    // ========================================================================
    try {
      // couleurs_interventions : custom couleur par intervention pour
      // le calendrier (consommee par getCouleursCalendrier &
      // setCouleur/setCouleursMultiples/deleteCouleurIntervention).
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS couleurs_interventions (
          artisanId INT NOT NULL,
          interventionId INT NOT NULL,
          couleur VARCHAR(20) NOT NULL,
          createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (artisanId, interventionId),
          INDEX idx_couleurs_artisan (artisanId)
        )
      `);
      console.log('[CouleursInterventions] Table OK');

      // interventions_mobile + photos_interventions : declares dans
      // drizzle/schema.ts mais comme on n'utilise pas drizzle-kit push en
      // prod, on cree defensivement via CREATE IF NOT EXISTS pour eviter
      // que les endpoints mobile crashent au premier appel.
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS interventions_mobile (
          id INT AUTO_INCREMENT PRIMARY KEY,
          interventionId INT NOT NULL,
          artisanId INT NOT NULL,
          latitude DECIMAL(10,7) NULL,
          longitude DECIMAL(10,7) NULL,
          heureArrivee TIMESTAMP NULL,
          heureDepart TIMESTAMP NULL,
          notesIntervention TEXT NULL,
          signatureClient TEXT NULL,
          signatureDate TIMESTAMP NULL,
          syncStatus ENUM('synced','pending','error') DEFAULT 'synced',
          lastSyncAt TIMESTAMP NULL,
          createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_intervention_mobile (interventionId),
          INDEX idx_intervention_mobile_artisan (artisanId)
        )
      `);
      console.log('[InterventionsMobile] Table OK');

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS photos_interventions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          interventionMobileId INT NOT NULL,
          url VARCHAR(500) NOT NULL,
          description VARCHAR(255) NULL,
          type ENUM('avant','pendant','apres') DEFAULT 'pendant',
          takenAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_photos_intervention_mobile (interventionMobileId)
        )
      `);
      console.log('[PhotosInterventions] Table OK');

      // Alignement : commandes_fournisseurs.numero etait declaree
      // VARCHAR(20) alors que devis/factures.numero = VARCHAR(50). Un
      // generateur de numero un peu plus long (CMD-{prefix}-{ts}) peut
      // alors fail silencieusement avec ER_DATA_TOO_LONG. Aligne sur 50.
      try {
        await pool.execute(
          `ALTER TABLE commandes_fournisseurs MODIFY COLUMN numero VARCHAR(50) NULL`
        );
        console.log('[CommandesFournisseurs] numero widened to VARCHAR(50)');
      } catch (e: any) {
        // Si la colonne fait deja 50+ ou si l'ALTER echoue pour autre
        // raison non-bloquante, on ignore.
        if (!/already|same/i.test(e?.message || '')) {
          console.log('[CommandesFournisseurs] ALTER numero :', e?.message);
        }
      }
    } catch (e: any) {
      console.log('[CustomTables] Migration :', e?.message || e);
    }

    console.log('[FixDuplicates] Done.');
  } catch (e) {
    console.error('[FixDuplicates] Error:', e);
  } finally {
    await pool.end();
  }
}

fixDuplicates();
