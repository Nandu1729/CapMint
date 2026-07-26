import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL is required to run the over-issued lot canary.');
  process.exitCode = 2;
} else {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const reportPath = path.join(
    repositoryRoot,
    'backend/verification-service/scripts/report-overfilled-lots.sql'
  );
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

  try {
    const reportSql = await fs.readFile(reportPath, 'utf8');
    const queryResult = await pool.query(reportSql);
    const statementResults = Array.isArray(queryResult) ? queryResult : [queryResult];
    const reportResult = statementResults.find(result => result.command === 'SELECT');

    if (!reportResult) {
      throw new Error('The over-issued lot report did not return a SELECT result.');
    }

    if (reportResult.rows.length === 0) {
      console.log('Capacity integrity canary passed: no over-issued lots found.');
    } else {
      console.error(`Capacity integrity canary failed: ${reportResult.rows.length} over-issued lot(s) found.`);
      console.error('lot_id\tbudget\tceiling\tissued_count');
      for (const row of reportResult.rows) {
        console.error(`${row.lot_id}\t${row.budget}\t${row.ceiling}\t${row.issued_count}`);
      }
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Capacity integrity canary could not complete: ${message}`);
    process.exitCode = 2;
  } finally {
    await pool.end();
  }
}
