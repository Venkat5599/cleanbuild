import { db } from '../packages/db/src/client.js';
const sql = db();
const t = await sql`select table_name from information_schema.tables where table_schema='public' order by 1`;
console.log(t.map((r: any) => r.table_name).join(', '));
const e = await sql`select extname from pg_extension order by 1`;
console.log('extensions:', e.map((r: any) => r.extname).join(', '));
