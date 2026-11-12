import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Toda clase @Entity debe estar en `entities` de app.module.ts: si falta,
 * TypeORM responde "No metadata for X" (500) al usar su repositorio, aunque
 * esté en el forFeature del módulo (pasó con ReceivableVoucher en /pago/:token).
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
  });
}

describe('Entidades registradas en TypeORM', () => {
  it('cada @Entity está en la lista de entities de app.module.ts', () => {
    const app = readFileSync(join(__dirname, 'app.module.ts'), 'utf8');
    const list = new Set((/entities:\s*\[([^\]]*)\]/.exec(app)?.[1] || '').split(',').map((s) => s.trim()));
    const missing: string[] = [];
    for (const f of files(__dirname)) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/@Entity\([^)]*\)\s*(?:@\w+\([^)]*\)\s*)*export class (\w+)/g)) {
        if (!list.has(m[1])) missing.push(`${m[1]} (${f})`);
      }
    }
    expect(missing).toEqual([]);
  });
});
