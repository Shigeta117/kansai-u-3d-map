// 描画命令の内訳を数える（開発用。docs/quality-plan.md 4 節）。
//
// 使い方: 開発サーバーを立ててから
//   node scripts/draw-calls.mjs http://localhost:3240 [--json out.json] [--top 25] [--views overview,yukyu] [--mobile]
//
// - three の開発者向けの口（window.__THREE_DEVTOOLS__）で Scene と WebGLRenderer を受け取り、
//   renderer.renderBufferDirect を包んで、1 回の描画で何がどれだけ描画命令を出したかを数える
// - 影の地図も同じ回に描き直させて（shadowMap.needsUpdate）、影の描画命令も数える
// - 視点はプリセット（config.ts の cameraPresets）。--mobile で 393×852、無ければ 1280×900
// - 持ち主: 建物は buildingId、それ以外はシーン直下の group の名前。材質は名前か「型#色」
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const args = process.argv.slice(2);
const baseUrl = args.find((a) => a.startsWith('http')) ?? 'http://localhost:3240';
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const jsonOut = opt('--json', null);
const top = Number(opt('--top', '20'));
const mobile = args.includes('--mobile');
const viewport = mobile ? { width: 393, height: 852 } : { width: 1280, height: 900 };

// プリセットの視点を config.ts から読む（ts を import せずに、数値だけ拾う）
const configSrc = fs.readFileSync(path.join(root, 'packages/core/src/data/campuses/senriyama/config.ts'), 'utf8');
const presets = [];
for (const m of configSrc.matchAll(
  /id: '([\w-]+)',\s*label:[\s\S]*?position: \[([^\]]+)\],\s*target: \[([^\]]+)\]/g,
)) {
  presets.push({ id: m[1], cam: `${m[2]},${m[3]}`.replace(/\s+/g, '') });
}
const heroSrc = fs.readFileSync(path.join(root, 'packages/core/src/scene/heroes/index.ts'), 'utf8');
const heroIds = [...heroSrc.matchAll(/^\s+'?([\w-]+)'?: build\w+,$/gm)].map((m) => m[1]);

const extraViews = (opt('--cams', '') || '')
  .split(';')
  .filter(Boolean)
  .map((s) => {
    const [id, cam] = s.split('=');
    return { id, cam };
  });
const wanted = opt('--views', null)?.split(',');
const views = [...presets.filter((p) => !wanted || wanted.includes(p.id)), ...extraViews];

const probeInit = () => {
  const probe = { scene: null, renderer: null, camera: null, record: null };
  window.__probe = probe;
  const devtools = new EventTarget();
  devtools.addEventListener('observe', (ev) => {
    const obj = ev.detail;
    if (obj && obj.isScene) probe.scene = obj;
    // 開発時は React の StrictMode で 2 回組まれる（1 回目は捨てられる）ので、最後に作られた物を使う
    if (obj && typeof obj.renderBufferDirect === 'function') {
      probe.renderer = obj;
      probe.camera = null;
      const direct = obj.renderBufferDirect;
      obj.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
        if (probe.record) probe.record.push({ shadow: scene === null, object, material, group });
        return direct.call(this, camera, scene, geometry, material, object, group);
      };
      const render = obj.render.bind(obj);
      obj.render = (scene, camera) => {
        if (probe.renderer === obj) probe.camera = camera;
        return render(scene, camera);
      };
    }
  });
  window.__THREE_DEVTOOLS__ = devtools;
};

const measureInPage = (heroIdList) => {
  const probe = window.__probe;
  const heroes = new Set(heroIdList);
  const ownerOf = (obj) => {
    for (let cur = obj; cur; cur = cur.parent) {
      const id = cur.userData && cur.userData.buildingId;
      if (typeof id === 'string') return heroes.has(id) ? `hero:${id}` : `bld:${id}`;
      if (cur.parent && cur.parent.isScene) return cur.name || cur.type;
    }
    return '?';
  };
  const matName = (m) => {
    if (!m) return '?';
    const color = m.color ? `#${m.color.getHexString()}` : '';
    return m.name || `${m.type}${color}`;
  };
  probe.renderer.shadowMap.needsUpdate = true;
  probe.record = [];
  probe.renderer.render(probe.scene, probe.camera);
  const info = { calls: probe.renderer.info.render.calls, triangles: probe.renderer.info.render.triangles };
  const rec = probe.record;
  probe.record = null;
  const main = {};
  const shadow = {};
  const mainMat = {};
  const shadowMat = {};
  let mainTotal = 0;
  let shadowTotal = 0;
  for (const r of rec) {
    const owner = ownerOf(r.object);
    let mat = r.material;
    if (r.shadow) {
      const om = r.object.material;
      mat = Array.isArray(om) ? om[r.group ? r.group.materialIndex : 0] : om;
    }
    const key = `${owner} | ${matName(mat)}${r.object.isInstancedMesh ? ' (inst)' : ''}`;
    if (r.shadow) {
      shadowTotal += 1;
      shadow[owner] = (shadow[owner] ?? 0) + 1;
      shadowMat[key] = (shadowMat[key] ?? 0) + 1;
    } else {
      mainTotal += 1;
      main[owner] = (main[owner] ?? 0) + 1;
      mainMat[key] = (mainMat[key] ?? 0) + 1;
    }
  }
  return { info, mainTotal, shadowTotal, main, shadow, mainMat, shadowMat };
};

const groupOf = (owner) => {
  if (owner.startsWith('hero:')) return 'heroes';
  if (owner.startsWith('bld:')) return 'buildings';
  return owner;
};

const sortDesc = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);

const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome', headless: true });
const results = [];
try {
  for (const view of views) {
    const page = await browser.newPage({ viewport });
    await page.addInitScript(probeInit);
    await page.goto(`${baseUrl}/?ui=0&stats=1&free=1&cam=${view.cam}`);
    await page.waitForFunction(() => Number(document.body.dataset.kumRenders ?? 0) >= 1 && window.__probe?.camera, null, {
      timeout: 120_000,
    });
    const shownCalls = await page.evaluate(() => Number(document.body.dataset.kumCalls));
    const r = await page.evaluate(measureInPage, heroIds);
    const byGroup = {};
    for (const [owner, n] of Object.entries(r.main)) byGroup[groupOf(owner)] = (byGroup[groupOf(owner)] ?? 0) + n;
    const byGroupShadow = {};
    for (const [owner, n] of Object.entries(r.shadow))
      byGroupShadow[groupOf(owner)] = (byGroupShadow[groupOf(owner)] ?? 0) + n;
    results.push({ view: view.id, viewport, shownCalls, ...r, byGroup, byGroupShadow });
    console.log(
      `\n## ${view.id} (${viewport.width}x${viewport.height}) calls=${r.mainTotal} (info ${r.info.calls}, data-kum-calls ${shownCalls}) shadow=${r.shadowTotal} tris=${r.info.triangles}`,
    );
    console.log('  group:', sortDesc(byGroup).map(([k, n]) => `${k} ${n}`).join(' / '));
    console.log('  shadow group:', sortDesc(byGroupShadow).map(([k, n]) => `${k} ${n}`).join(' / '));
    console.log('  top owners:', sortDesc(r.main).slice(0, top).map(([k, n]) => `${k} ${n}`).join(' / '));
    await page.close();
  }
} finally {
  await browser.close();
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 1));
