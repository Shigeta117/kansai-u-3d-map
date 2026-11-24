import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, normalizePath, type Plugin } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 手元だけの置き場のパスか（大文字小文字を区別しない。macOS・Windows のファイルシステムは区別しないため） */
const LOCAL_ONLY_DIR = /\/private\.local(\/|$)/i;

/**
 * 手元だけの置き場（`src/data/indoor/private.local/`、docs/indoor-plan.md 3 節）を本番のビルドに入れない。
 * - 置き場を読む入口（src/dev/localL1.ts）を、ビルドのときだけ空の表に差し替える（import.meta.glob を展開させない）
 * - それでも置き場のファイルを読もうとしたら、ビルドを止める（ほかの所から import した漏れを見つける）
 * - 最後に、出力のチャンクの元のモジュールとアセットの元のファイルに置き場のパスがあれば、ビルドを止める（load を通らない読み込みの保険）
 * 開発サーバー（vite serve）には効かない（apply: 'build'）。Worker のビルドにも同じ物を入れる（worker.plugins）
 * 確かめ: apps/guide/src/dev/localL1.build.test.ts（置き場に目印を置いて実際にビルドし、出力に 0 件）
 */
function excludeLocalOnlyData(): Plugin {
  const entry = normalizePath(path.resolve(__dirname, 'src/dev/localL1.ts'));
  const stop = (ctx: { error: (message: string) => never }, where: string): never =>
    ctx.error(`手元だけの置き場のファイルは本番のビルドに入れない: ${where}`);
  return {
    name: 'kum-exclude-local-only-data',
    apply: 'build',
    enforce: 'pre',
    load(id) {
      const normalized = normalizePath(id);
      const file = normalized.replace(/[?#].*$/, '');
      if (file === entry) return 'export const LOCAL_L1_MODULES = {};\n';
      if (LOCAL_ONLY_DIR.test(normalized)) stop(this, normalized);
      return null;
    },
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        const sources =
          output.type === 'chunk'
            ? output.moduleIds
            : (output.originalFileNames ?? (output.originalFileName ? [output.originalFileName] : []));
        for (const source of sources) {
          if (LOCAL_ONLY_DIR.test(normalizePath(source))) stop(this, `${output.fileName} ← ${source}`);
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [excludeLocalOnlyData(), react(), tailwindcss()],
  worker: {
    plugins: () => [excludeLocalOnlyData()],
  },
  publicDir: path.resolve(__dirname, '../../public'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@kansai-u-3d/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
  server: {
    port: 3240,
    strictPort: true,
    host: true,
  },
  preview: {
    port: 3241,
    strictPort: true,
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
});
