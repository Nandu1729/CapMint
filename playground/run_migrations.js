const fs = require('fs');
const path = require('path');

async function run() {
  const pg = await import('pg');
  const pgPool = new pg.default.Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://capmint_admin:capmint_secure_password@localhost:5432/capmint_dev'
  });
  
  const migrationsDir = path.join(__dirname, '../database/migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort(); // Run them sequentially
  
  console.log(`Found ${files.length} migration file(s).`);
  const client = await pgPool.connect();
  
  try {
    // Ensure migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations_log (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Retrieve already applied migrations
    const appliedRes = await client.query('SELECT filename FROM migrations_log');
    const appliedFiles = new Set(appliedRes.rows.map(row => row.filename));

    for (const file of files) {
      if (appliedFiles.has(file)) {
        console.log(`Migration ${file} has already been applied. Skipping.`);
        continue;
      }

      console.log(`Running migration: ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO migrations_log (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`Migration ${file} completed successfully!`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
    console.log('All migrations processed successfully!');
  } catch (err) {
    console.error('Migration execution failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pgPool.end();
  }
}

run();
