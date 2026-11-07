import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function scan(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (file.endsWith('.ts')) {
      const source = readFileSync(file, 'utf8');
      if (/\bany\b/.test(source)) throw new Error(`${file}: any 금지`);
      if (path.includes('sim') && /\b(window|document|performance|Date)\s*\.|from\s+['"](?:three|node:)/.test(source)) {
        throw new Error(`${file}: sim의 플랫폼 의존 금지`);
      }
    }
  }
}
scan('packages/sim/src');
scan('apps/client/src');
console.log('경계 검사 통과: sim 플랫폼 의존 없음, any 없음');
