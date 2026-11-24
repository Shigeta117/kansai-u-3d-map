import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, normalizePath, type Plugin } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 手元だけの置き場（`src/data/indoor/private.local/`、docs/indoor-plan.md 3 節）を本番のビルドに入れない。
 * - 置き場を読む入口（src/dev/localL1.ts）を、ビルドのときだけ空の表に差し替える（import.meta.glob を展開させない）
 * - それでも置き場のファイルを読もうとしたら、ビルドを止める（ほかの所から import した漏れを見つける）
 * 開発サーバー（vite serve）には効かない（apply: 'build'）
 */
function excludeLocalOnlyData(): Plugin {
  const entry = normalizePath(path.resolve(__dirname, 'src/dev/localL1.ts'));
  return {
    name: 'kum-exclude-local-only-data',
    apply: 'build',
    enforce: 'pre',
    load(id) {
      const file = normalizePath(id.split('?')[0] ?? id);
      if (file === entry) return 'export const LOCAL_L1_MODULES = {};\n';
      if (file.includes('/private.local/')) {
        this.error(`手元だけの置き場のファイルは本番のビルドに入れない: ${file}`);
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [excludeLocalOnlyData(), react(), tailwindcss()],
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
