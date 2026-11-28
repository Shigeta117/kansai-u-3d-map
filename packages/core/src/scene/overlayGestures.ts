/**
 * 地図の上に重ねた HTML（建物の札・丸いボタン）で始まった指の操作を、3D の canvas に渡す。
 *
 * 困っていたこと: 札やボタンは canvas の外の要素なので、その上で 2 本指を広げると、
 * ブラウザがページそのものを拡大し、上の帯やボタンに触れなくなっていた。
 *
 * 決まり:
 * - 渡す対象の要素には CSS で `touch-action: none` を付け、ブラウザのページの拡大・移動を止める
 * - 1 本指の軽いタップは渡さない（札の click はそのまま効く）
 * - 2 本目の指が触れたとき、または指が tapSlopPx を超えて動いたとき、その指を canvas に渡す。
 *   canvas に合成の pointerdown を送り、`setPointerCapture` でその指の後続の move / up を canvas に向ける
 *   （three r176 の OrbitControls は move / up を domElement で受け、2 本目の指は自分では捕まえないため）
 */
export interface OverlayGestureOptions {
  /** この要素の中で始まった指を渡す対象にするか */
  isPassTarget: (el: Element) => boolean;
  /** これ以上動いたらタップではないと見なす距離（CSS ピクセル） */
  tapSlopPx?: number;
}

interface HeldPointer {
  x0: number;
  y0: number;
  x: number;
  y: number;
  isPrimary: boolean;
}

export function handOverlayGesturesToCanvas(
  root: Document | HTMLElement,
  canvas: HTMLElement,
  options: OverlayGestureOptions,
): () => void {
  const tapSlop = options.tapSlopPx ?? 8;
  const held = new Map<number, HeldPointer>();
  const handed = new Set<number>();
  const onCanvas = new Set<number>();

  const hand = (id: number): void => {
    const p = held.get(id);
    if (!p || handed.has(id)) return;
    handed.add(id);
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: id,
        pointerType: 'touch',
        isPrimary: p.isPrimary,
        clientX: p.x,
        clientY: p.y,
        button: 0,
        buttons: 1,
        bubbles: true,
        cancelable: true,
      }),
    );
    try {
      canvas.setPointerCapture(id);
    } catch {
      // 指がもう離れていたら捕まえられない。そのときは渡さずに終わる
    }
  };
  const handAll = (): void => {
    for (const id of held.keys()) hand(id);
  };

  const onDown = (ev: Event): void => {
    const e = ev as PointerEvent;
    if (e.pointerType !== 'touch' || !e.isTrusted) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target === canvas) {
      onCanvas.add(e.pointerId);
      if (held.size > 0) handAll();
      return;
    }
    if (!target || !options.isPassTarget(target)) return;
    held.set(e.pointerId, { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, isPrimary: e.isPrimary });
    if (held.size + onCanvas.size >= 2) handAll();
  };
  const onMove = (ev: Event): void => {
    const e = ev as PointerEvent;
    const p = held.get(e.pointerId);
    if (!p || !e.isTrusted) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (!handed.has(e.pointerId) && Math.hypot(p.x - p.x0, p.y - p.y0) > tapSlop) hand(e.pointerId);
  };
  const onEnd = (ev: Event): void => {
    const e = ev as PointerEvent;
    held.delete(e.pointerId);
    handed.delete(e.pointerId);
    onCanvas.delete(e.pointerId);
  };

  const opts = { capture: true } as const;
  root.addEventListener('pointerdown', onDown, opts);
  root.addEventListener('pointermove', onMove, opts);
  root.addEventListener('pointerup', onEnd, opts);
  root.addEventListener('pointercancel', onEnd, opts);
  return () => {
    root.removeEventListener('pointerdown', onDown, opts);
    root.removeEventListener('pointermove', onMove, opts);
    root.removeEventListener('pointerup', onEnd, opts);
    root.removeEventListener('pointercancel', onEnd, opts);
    held.clear();
    handed.clear();
    onCanvas.clear();
  };
}
