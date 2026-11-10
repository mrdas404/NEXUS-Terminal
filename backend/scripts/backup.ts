import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const corePath = path.resolve(process.env.CORE_DB_PATH || path.resolve(process.cwd(), 'prisma/dev.db'));
  const researchPath = path.resolve(process.env.RESEARCH_DB_PATH || path.resolve(process.cwd(), 'prisma/dev.db'));
  const backupDir = path.resolve(process.env.BACKUP_DIR || path.resolve(process.cwd(), 'backups'));
  const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 14);
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) {
    throw new Error('BACKUP_RETENTION_DAYS must be an integer from 1 to 365');
  }
  fs.mkdirSync(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sources = [...new Set([corePath, researchPath])];
  const created: string[] = [];

  for (const [index, source] of sources.entries()) {
    if (!fs.existsSync(source)) throw new Error('Database file does not exist: ' + source);
    const database = new Database(source, { readonly: true, fileMustExist: true });
    try {
      const check = database.pragma('quick_check') as Array<{ quick_check: string }>;
      if (check[0]?.quick_check !== 'ok') throw new Error('SQLite integrity check failed for ' + source);
      const destination = path.join(backupDir, 'nexus-' + (index === 0 ? 'core' : 'research') + '-' + timestamp + '.sqlite');
      await database.backup(destination);
      const verify = new Database(destination, { readonly: true, fileMustExist: true });
      try {
        const result = verify.pragma('quick_check') as Array<{ quick_check: string }>;
        if (result[0]?.quick_check !== 'ok') throw new Error('Backup verification failed: ' + destination);
      } finally { verify.close(); }
      created.push(destination);
      console.log('[Backup] verified ' + destination);
    } finally { database.close(); }
  }

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  for (const name of fs.readdirSync(backupDir)) {
    if (!/^nexus-(core|research)-.+\.sqlite$/.test(name)) continue;
    const target = path.join(backupDir, name);
    if (fs.statSync(target).mtimeMs < cutoff) {
      fs.rmSync(target);
      console.log('[Backup] removed expired backup ' + name);
    }
  }
  console.log('[Backup] completed: ' + created.length + ' verified database backup(s)');
}

main().catch(error => {
  console.error('[Backup] failed:', error);
  process.exitCode = 1;
});
