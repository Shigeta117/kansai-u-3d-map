import type { L1AreaDef } from './l1Areas';

/**
 * 手元だけの L1 の置き場（docs/indoor-plan.md 3 節）。公開の可否が決まっていない資料から作った物は
 * `apps/guide/src/data/indoor/private.local/` に置く（.gitignore の `*.local` で git に入らない。正本はリポジトリの外）。
 * 置き場が無い・空のときは空の表になる。
 * 本番のビルドでは、vite.config.ts がこのモジュールを空の表に差し替え、置き場のファイルを読もうとしたらビルドを止める
 */
export const LOCAL_L1_MODULES: Readonly<Record<string, Partial<L1AreaDef>>> = import.meta.glob<Partial<L1AreaDef>>(
  '../data/indoor/private.local/l1-*.ts',
  { eager: true },
);
