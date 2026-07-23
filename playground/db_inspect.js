const pg = require('pg');

async function run() {
  const connectionString = process.env.DATABASE_URL || 'postgres://capmint_admin:capmint_secure_password@localhost:5432/capmint_dev';
  const pool = new pg.Pool({ connectionString });
  const client = await pool.connect();
  
  try {
    console.log('====================================================');
    console.log('            CapMint Database Explorer               ');
    console.log('====================================================');
    console.log(`Connecting to: ${connectionString.replace(/:[^:@]+@/, ':****@')}\n`);
    
    // 1. Get list of tables
    const tableRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name != 'spatial_ref_sys'
      ORDER BY table_name;
    `);
    
    const tables = tableRes.rows.map(r => r.table_name);
    console.log(`Found ${tables.length} tables in database.\n`);
    
    for (const table of tables) {
      // Get row count
      const countRes = await client.query(`SELECT COUNT(*) FROM "${table}"`);
      const rowCount = countRes.rows[0].count;
      
      console.log(`Table: ${table} (${rowCount} rows)`);
      console.log('----------------------------------------------------');
      
      if (parseInt(rowCount, 10) > 0) {
        // Fetch up to 3 sample rows
        const dataRes = await client.query(`SELECT * FROM "${table}" LIMIT 3`);
        
        // Print clean visual tabular representation
        console.table(dataRes.rows);
      } else {
        console.log('(Empty table)\n');
      }
      console.log();
    }
  } catch (err) {
    console.error('Error querying database:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
