import fs from 'node:fs';

const schemaPath = new URL('../../services/api/prisma/schema.prisma', import.meta.url);
const constraintsPath = new URL('../../services/api/prisma/migrations/constraints.sql', import.meta.url);
const schema = fs.readFileSync(schemaPath, 'utf8');
const constraints = fs.existsSync(constraintsPath) ? fs.readFileSync(constraintsPath, 'utf8') : '';

const enumValues = new Map();
for (const m of schema.matchAll(/enum\s+(\w+)\s*\{([\s\S]*?)\}/g)) {
  enumValues.set(m[1], m[2].split('\n').map(x => x.trim()).filter(Boolean));
}

const models = [];
for (const m of schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
  const name = m[1];
  const body = m[2];
  const fields = [];
  const uniques = [];
  const indexes = [];
  let table = name;
  for (const line of body.split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('//')) continue;
    const map = s.match(/^@@map\("([^"]+)"\)/);
    if (map) { table = map[1]; continue; }
    const u = s.match(/^@@unique\(\[([^\]]+)\]/);
    if (u) { uniques.push(u[1].split(',').map(x => x.trim())); continue; }
    const i = s.match(/^@@index\(\[([^\]]+)\]/);
    if (i) { indexes.push(i[1].split(',').map(x => x.trim())); continue; }
    if (s.startsWith('@@')) continue;
    const f = s.match(/^(\w+)\s+([\w\[\]?]+)(?:\s+(.+))?$/);
    if (!f) continue;
    const [, field, type, attrs = ''] = f;
    if (/\[/.test(type)) continue;
    fields.push({ field, type: type.replace('?', ''), optional: type.endsWith('?'), attrs });
  }
  models.push({ name, table, fields, uniques, indexes });
}

const byField = new Map(models.map(m => [m.table, new Map(m.fields.map(f => [f.field, f]))]));
const fkByTable = new Map();
for (const line of constraints.split('\n')) {
  const m = line.match(/ALTER TABLE "([^"]+)" ADD CONSTRAINT "[^"]+" FOREIGN KEY \(([^)]+)\) REFERENCES "([^"]+)" \(([^)]+)\)/);
  if (!m) continue;
  const [, table, cols, refTable, refCols] = m;
  const entry = { cols: cols.split(',').map(x => x.trim().replaceAll('"','')), refTable, refCols: refCols.split(',').map(x => x.trim().replaceAll('"','')) };
  if (!fkByTable.has(table)) fkByTable.set(table, []);
  fkByTable.get(table).push(entry);
}

function sqlType(type) {
  if (type === 'BigInt') return 'TEXT'; // exact integer semantics; parsed with BigInt in application code
  if (type === 'Decimal') return 'TEXT'; // exact monetary decimal semantics
  if (type === 'Int') return 'INTEGER';
  if (type === 'Boolean') return 'INTEGER';
  if (type === 'DateTime') return 'TEXT';
  if (type === 'Json') return 'TEXT';
  if (enumValues.has(type)) return 'TEXT';
  return 'TEXT';
}
function defaultSql(attrs, type) {
  if (/default\(uuid\(\)\)/.test(attrs)) return '';
  if (/default\(now\(\)\)/.test(attrs)) return " DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))";
  const m = attrs.match(/@default\((true|false)\)/);
  if (m) return ` DEFAULT ${m[1] === 'true' ? 1 : 0}`;
  const n = attrs.match(/@default\((-?\d+)\)/);
  if (n) return ` DEFAULT ${n[1]}`;
  return '';
}

const out = [];
out.push('-- GENERATED from Prisma schema. Do not edit manually.');
out.push('PRAGMA foreign_keys = ON;');
out.push('PRAGMA journal_mode = WAL;');
for (const model of models) {
  const pk = model.fields.find(f => /@id\b/.test(f.attrs));
  const cols = model.fields.map(f => {
    const parts = [`"${f.field}"`, sqlType(f.type)];
    if (pk?.field === f.field) parts.push('PRIMARY KEY');
    if (!f.optional && pk?.field !== f.field) parts.push('NOT NULL');
    const d = defaultSql(f.attrs, f.type); if (d) parts.push(d);
    return parts.join(' ');
  });
  for (const fk of (fkByTable.get(model.table) || [])) {
    cols.push(`FOREIGN KEY (${fk.cols.map(c => `"${c}"`).join(', ')}) REFERENCES "${fk.refTable}" (${fk.refCols.map(c => `"${c}"`).join(', ')}) ON UPDATE CASCADE ON DELETE RESTRICT`);
  }
  out.push(`CREATE TABLE IF NOT EXISTS "${model.table}" (\n  ${cols.join(',\n  ')}\n);`);
  for (const u of model.uniques) out.push(`CREATE UNIQUE INDEX IF NOT EXISTS "ux_${model.table}_${u.join('_')}" ON "${model.table}" (${u.map(c => `"${c}"`).join(', ')});`);
  for (const i of model.indexes) out.push(`CREATE INDEX IF NOT EXISTS "ix_${model.table}_${i.join('_')}" ON "${model.table}" (${i.map(c => `"${c}"`).join(', ')});`);
}
process.stdout.write(out.join('\n') + '\n');
