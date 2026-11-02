import { loadEnvFiles, environmentReport } from '../lib/config';
loadEnvFiles();
const { getDb } = await import('../lib/db');
const { getBudgetSettings } = await import('../lib/budget/service');
getDb();
getBudgetSettings();
console.log('Database initialized and migrated.');
console.log(JSON.stringify(environmentReport(), null, 2));
