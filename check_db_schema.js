const mysql = require('mysql2/promise');

async function checkDatabase() {
  const connection = await mysql.createConnection({
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
  });

  try {
    // Récupérer la liste des tables
    const [tables] = await connection.execute(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME"
    );

    console.log("\n📋 TABLES EXISTANTES DANS LA BASE DE DONNÉES :\n");
    console.log("=".repeat(60));
    
    const tableNames = tables.map(t => t.TABLE_NAME);
    tableNames.forEach((name, idx) => {
      console.log(`${idx + 1}. ${name}`);
    });

    console.log("\n" + "=".repeat(60));
    console.log(`\n✅ Total : ${tableNames.length} tables\n`);

    // Pour chaque table, afficher sa structure
    console.log("\n📊 STRUCTURE DE CHAQUE TABLE :\n");
    console.log("=".repeat(60));

    for (const tableName of tableNames) {
      const [columns] = await connection.execute(`DESCRIBE ${tableName}`);
      console.log(`\n📌 Table: ${tableName}`);
      console.log("-".repeat(60));
      columns.forEach(col => {
        console.log(`  - ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'} ${col.Key ? `[${col.Key}]` : ''}`);
      });
    }

    console.log("\n" + "=".repeat(60));

  } finally {
    await connection.end();
  }
}

checkDatabase().catch(console.error);
