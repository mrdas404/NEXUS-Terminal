import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('SQLite backup utility creates integrity-checked backups for both databases',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-backup-test-'));
  const core=path.join(dir,'core.sqlite');
  const research=path.join(dir,'research.sqlite');
  const backups=path.join(dir,'backups');
  for(const file of [core,research]){const db=new Database(file);db.exec('CREATE TABLE sample(value TEXT); INSERT INTO sample VALUES (\'persisted\');');db.close();}
  try{
    const script=path.resolve(__dirname,'../scripts/backup.js');
    const result=spawnSync(process.execPath,[script],{encoding:'utf8',env:{...process.env,CORE_DB_PATH:core,RESEARCH_DB_PATH:research,BACKUP_DIR:backups,BACKUP_RETENTION_DAYS:'14'}});
    assert.equal(result.status,0,result.stderr);
    const names=fs.readdirSync(backups).sort();
    assert.equal(names.length,2);
    assert.ok(names.some(x=>x.startsWith('nexus-core-')));
    assert.ok(names.some(x=>x.startsWith('nexus-research-')));
    for(const name of names){const db=new Database(path.join(backups,name),{readonly:true});assert.equal(db.pragma('quick_check')[0].quick_check,'ok');assert.equal(db.prepare('SELECT value FROM sample').get().value,'persisted');db.close();}
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
