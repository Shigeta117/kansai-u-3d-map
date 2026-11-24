import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';

/**
 * 手元だけの置き場（private.local、docs/indoor-plan.md 3 節）の中身が本番のビルドに入らないことを、実際にビルドして確かめる。
 * 置き場に目印のファイルを一時的に置き、別の出力先へビルドして、出力に目印が 0 件であることを見る。
 * 置き場にもともとあるファイルには触らない。目印のファイルと出力先は、失敗しても必ず消す（置き場を作ったときは空なら置き場も消す）
 */

const GUIDE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOCAL_DIR = path.join(GUIDE_ROOT, 'src/data/indoor/private.local');
const SENTINEL_FILE = path.join(LOCAL_DIR, 'l1-zz-sentinel.ts');
const SENTINEL = 'KUM_PRIVATE_SENTINEL_9c41';

/** 正しい形で export する（開発のときなら画面の表に足される形）。中身は公開の第1学舎の図を借りる */
const SENTINEL_SOURCE = `import { AREA1_L1, AREA1_L1_TIERS, AREA1_L1_WING_ORDER } from '../l1/area1';

export const id = 'zz-sentinel';
export const title = '${SENTINEL}';
export const graph = AREA1_L1;
export const tiers = AREA1_L1_TIERS;
export const order = AREA1_L1_WING_ORDER;
export const notes = ['${SENTINEL} note'];
`;

function readAllText(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? readAllText(full) : [fs.readFileSync(full, 'utf8')];
  });
}

describe('手元だけの置き場は本番のビルドに入らない', () => {
  it('置き場に目印のファイルを置いてビルドしても、出力に目印が出ない', { timeout: 180_000 }, async () => {
    if (fs.existsSync(SENTINEL_FILE)) throw new Error(`目印のファイルが前の実行から残っている: ${SENTINEL_FILE}`);
    const createdDir = !fs.existsSync(LOCAL_DIR);
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kum-local-only-build-'));
    try {
      fs.mkdirSync(LOCAL_DIR, { recursive: true });
      fs.writeFileSync(SENTINEL_FILE, SENTINEL_SOURCE);

      await build({
        root: GUIDE_ROOT,
        configFile: path.join(GUIDE_ROOT, 'vite.config.ts'),
        mode: 'production',
        logLevel: 'silent',
        build: { outDir, emptyOutDir: true, copyPublicDir: false, reportCompressedSize: false },
      });

      const texts = readAllText(outDir);
      // 出力が空でないこと（L1 の下書きの画面のチャンクまで作られていること）を先に確かめる
      expect(texts.some((t) => t.includes('棟と階のつながり'))).toBe(true);
      expect(texts.filter((t) => t.includes(SENTINEL))).toHaveLength(0);
      expect(texts.filter((t) => t.includes('zz-sentinel'))).toHaveLength(0);
    } finally {
      fs.rmSync(SENTINEL_FILE, { force: true });
      if (createdDir && fs.existsSync(LOCAL_DIR) && fs.readdirSync(LOCAL_DIR).length === 0) fs.rmdirSync(LOCAL_DIR);
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });
});
