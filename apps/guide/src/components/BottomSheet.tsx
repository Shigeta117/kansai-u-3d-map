import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { useIsSheetLayout } from '../hooks/useMediaQuery';
import {
  computeSnapHeights,
  cycleSnap,
  dragFrame,
  releaseVelocity,
  resolveRelease,
  stepSnap,
  toggleSnap,
  type SheetSnap,
  type SnapHeights,
} from './bottomSheetSnap';

/** これ以上動いたらタップではなくドラッグとみなす */
const DRAG_SLOP_PX = 6;
/** ドラッグを離した直後のクリック（マウスでは離した所で click が出る）を捨てる時間 */
const CLICK_SUPPRESS_MS = 400;

const SNAP_LABEL: Record<SheetSnap, string> = {
  peek: '低い段',
  half: '中の段',
  full: '高い段',
};

interface DragState {
  source: 'pointer' | 'touch';
  id: number;
  startY: number;
  startHeight: number;
  active: boolean;
  samples: { y: number; t: number }[];
  frame: { height: number; offset: number };
}

interface BottomSheetProps {
  /** 開閉のアニメーションの状態（useAnimatedPresence の visible） */
  state: 'open' | 'closed';
  ariaLabel: string;
  /** sm 以上（横に浮くパネル）での aside のクラス。スマホの幅では使わない */
  desktopClassName: string;
  /** sm 以上での中身のスクロール枠のクラス */
  desktopContentClassName: string;
  /** スマホの幅での中身のスクロール枠に足すクラス */
  sheetContentClassName?: string;
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  onClose: () => void;
  /** スマホの幅で、落ち着いた（ドラッグ中でない）シートの高さを知らせる。閉じると 0。安定した関数を渡す */
  onSheetHeightChange?: (height: number) => void;
  /** つまみの下に固定する見出し。ここもドラッグできる */
  header: ReactNode;
  /** 下に固定する部分（ボタンなど） */
  footer?: ReactNode;
  children: ReactNode;
  contentRef?: RefObject<HTMLDivElement | null>;
}

function isInteractive(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest('button, a, input, select, textarea, [role="tab"]'))
  );
}

/** 指の下に、中身の枠とは別の縦にスクロールできる箱（ピッカーの一覧など）があるか */
function isInsideNestedScroller(target: EventTarget | null, root: HTMLElement): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== root) {
    if (el instanceof HTMLElement && el.scrollHeight > el.clientHeight + 1) {
      const overflowY = getComputedStyle(el).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') return true;
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * スマホの幅では下から出るシート（低い・中・高いの 3 段、つまみと見出しのドラッグ、
 * 中身が一番上のときの下へのドラッグ、下へ払って閉じる）。sm 以上では従来の横のパネルをそのまま描く。
 */
export function BottomSheet({
  state,
  ariaLabel,
  desktopClassName,
  desktopContentClassName,
  sheetContentClassName = '',
  snap,
  onSnapChange,
  onClose,
  onSheetHeightChange,
  header,
  footer,
  children,
  contentRef: externalContentRef,
}: BottomSheetProps) {
  const isSheet = useIsSheetLayout();
  const sheetRef = useRef<HTMLElement>(null);
  const grabRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const ownContentRef = useRef<HTMLDivElement>(null);
  const contentRef = externalContentRef ?? ownContentRef;

  const [heights, setHeights] = useState<SnapHeights | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickUntilRef = useRef(0);

  // ネイティブのリスナーから最新の値を読むための控え
  const latestRef = useRef({ snap, heights, onSnapChange, onClose, onSheetHeightChange });
  useLayoutEffect(() => {
    latestRef.current = { snap, heights, onSnapChange, onClose, onSheetHeightChange };
  });

  const measure = useCallback(() => {
    const sheet = sheetRef.current;
    const grab = grabRef.current;
    const probe = probeRef.current;
    if (!sheet || !grab || !probe) return;
    const cs = getComputedStyle(sheet);
    const chrome =
      parseFloat(cs.paddingTop) +
      parseFloat(cs.paddingBottom) +
      parseFloat(cs.borderTopWidth) +
      parseFloat(cs.borderBottomWidth);
    const peek = grab.offsetHeight + (footerRef.current?.offsetHeight ?? 0) + chrome;
    const next = computeSnapHeights(window.innerHeight, probe.offsetHeight, peek);
    setHeights((prev) =>
      prev && prev.peek === next.peek && prev.half === next.half && prev.full === next.full
        ? prev
        : next,
    );
  }, []);

  useLayoutEffect(() => {
    if (!isSheet) return;
    measure();
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null;
    if (grabRef.current) observer?.observe(grabRef.current);
    if (footerRef.current) observer?.observe(footerRef.current);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [isSheet, measure]);

  // 段の高さを当てる（ドラッグ中は指に任せる）
  useLayoutEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    if (!isSheet) {
      el.style.height = '';
      el.style.transform = '';
      return;
    }
    if (!heights || dragRef.current?.active) return;
    el.style.height = `${heights[snap]}px`;
  }, [isSheet, heights, snap]);

  // 下へ払って閉じかけたあと、閉じきる前にまた開いたとき
  useLayoutEffect(() => {
    const el = sheetRef.current;
    if (el && state === 'open') delete el.dataset.dismissing;
  }, [state]);

  useEffect(() => {
    onSheetHeightChange?.(isSheet && state === 'open' && heights ? heights[snap] : 0);
  }, [isSheet, state, heights, snap, onSheetHeightChange]);

  useEffect(
    () => () => {
      latestRef.current.onSheetHeightChange?.(0);
    },
    [],
  );

  const beginDrag = useCallback(
    (source: DragState['source'], id: number, clientY: number, t: number): boolean => {
      const el = sheetRef.current;
      if (!el || !latestRef.current.heights || dragRef.current) return false;
      const startHeight = el.getBoundingClientRect().height;
      dragRef.current = {
        source,
        id,
        startY: clientY,
        startHeight,
        active: false,
        samples: [{ y: clientY, t }],
        frame: { height: startHeight, offset: 0 },
      };
      return true;
    },
    [],
  );

  const activateDrag = useCallback(() => {
    const el = sheetRef.current;
    const drag = dragRef.current;
    if (!el || !drag) return;
    drag.active = true;
    el.dataset.dragging = 'true';
  }, []);

  const moveDrag = useCallback((clientY: number, t: number) => {
    const el = sheetRef.current;
    const drag = dragRef.current;
    const h = latestRef.current.heights;
    if (!el || !drag?.active || !h) return;
    const frame = dragFrame(drag.startHeight, clientY - drag.startY, h);
    el.style.height = `${frame.height}px`;
    el.style.transform = frame.offset > 0 ? `translateY(${frame.offset}px)` : '';
    drag.frame = frame;
    drag.samples.push({ y: clientY, t });
    if (drag.samples.length > 16) drag.samples.shift();
  }, []);

  const endDrag = useCallback((t: number, cancelled: boolean) => {
    const el = sheetRef.current;
    const drag = dragRef.current;
    dragRef.current = null;
    const latest = latestRef.current;
    if (!el || !drag?.active || !latest.heights) return;
    suppressClickUntilRef.current = performance.now() + CLICK_SUPPRESS_MS;
    delete el.dataset.dragging;
    const target = resolveRelease({
      visibleHeight: drag.frame.height - drag.frame.offset,
      velocity: cancelled ? 0 : releaseVelocity(drag.samples, t),
      heights: latest.heights,
      dismissible: true,
    });
    el.style.transform = '';
    if (target === 'dismiss') {
      el.dataset.dismissing = 'true';
      latest.onClose();
      return;
    }
    el.style.height = `${latest.heights[target]}px`;
    if (target !== latest.snap) latest.onSnapChange(target);
  }, []);

  // 中身: 一番上で下へ引く・高い段でないときに上へ押す、の 2 つだけシートの移動に回す。
  // iOS の WebKit は touch-action の向き指定（pan-down など）に対応していないので、
  // ネイティブのスクロールを止めるには passive でない touchmove で preventDefault するしかない。
  useEffect(() => {
    const content = contentRef.current;
    if (!isSheet || !content) return;
    let start: { id: number; x: number; y: number } | null = null;
    let mode: 'undecided' | 'sheet' | 'native' = 'native';

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (e.touches.length !== 1 || !touch || dragRef.current) {
        start = null;
        return;
      }
      start = { id: touch.identifier, x: touch.clientX, y: touch.clientY };
      mode = 'undecided';
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!start) return;
      const touch = e.touches[0];
      if (e.touches.length !== 1 || !touch) {
        if (mode === 'sheet') endDrag(e.timeStamp, true);
        start = null;
        mode = 'native';
        return;
      }
      if (mode === 'undecided') {
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (Math.abs(dx) < DRAG_SLOP_PX && Math.abs(dy) < DRAG_SLOP_PX) return;
        if (Math.abs(dx) > Math.abs(dy) || isInsideNestedScroller(e.target, content)) {
          mode = 'native';
          return;
        }
        const pullDownAtTop = dy > 0 && content.scrollTop <= 0;
        const pushUpBelowFull = dy < 0 && latestRef.current.snap !== 'full';
        if ((pullDownAtTop || pushUpBelowFull) && beginDrag('touch', start.id, start.y, e.timeStamp)) {
          activateDrag();
          mode = 'sheet';
        } else {
          mode = 'native';
          return;
        }
      }
      if (mode === 'sheet') {
        e.preventDefault();
        moveDrag(touch.clientY, e.timeStamp);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (mode === 'sheet') endDrag(e.timeStamp, e.type === 'touchcancel');
      start = null;
      mode = 'native';
    };

    content.addEventListener('touchstart', onTouchStart, { passive: true });
    content.addEventListener('touchmove', onTouchMove, { passive: false });
    content.addEventListener('touchend', onTouchEnd);
    content.addEventListener('touchcancel', onTouchEnd);
    return () => {
      content.removeEventListener('touchstart', onTouchStart);
      content.removeEventListener('touchmove', onTouchMove);
      content.removeEventListener('touchend', onTouchEnd);
      content.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [isSheet, contentRef, beginDrag, activateDrag, moveDrag, endDrag]);

  // つまみと見出し: Pointer Events（指・マウス・ペン）。touch-action: none で常にシートの移動。
  // 押した後の動きは window で受ける（マウスは最初の数 px でつまみの外へ出るので、要素のリスナーだと取りこぼす。
  // setPointerCapture を押した瞬間に掛けると、つまみ・閉じるボタンのクリックの宛先が変わるので使わない）
  const stopPointerTrackingRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopPointerTrackingRef.current?.(), []);

  const handleGrabPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // 新しい押し始め。前のドラッグの直後でも、このタップのクリックは捨てない
    suppressClickUntilRef.current = 0;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!beginDrag('pointer', e.pointerId, e.clientY, e.timeStamp)) return;
    const pointerId = e.pointerId;

    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (ev.pointerId !== pointerId || !drag || drag.source !== 'pointer') return;
      if (!drag.active) {
        if (Math.abs(ev.clientY - drag.startY) < DRAG_SLOP_PX) return;
        activateDrag();
      }
      moveDrag(ev.clientY, ev.timeStamp);
    };
    const onEnd = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      stop();
      const drag = dragRef.current;
      if (!drag || drag.source !== 'pointer') return;
      if (!drag.active) {
        dragRef.current = null;
        return;
      }
      endDrag(ev.timeStamp, ev.type === 'pointercancel');
    };
    const stop = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      stopPointerTrackingRef.current = null;
    };
    stopPointerTrackingRef.current?.();
    stopPointerTrackingRef.current = stop;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  };

  const handleGrabClickCapture = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (performance.now() < suppressClickUntilRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handleGrabClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (isInteractive(e.target)) return;
    onSnapChange(toggleSnap(snap));
  };

  const handleHandleKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      onSnapChange(stepSnap(snap, 1));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onSnapChange(stepSnap(snap, -1));
    }
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    // 入力欄の Esc は、まず中の文字を消す（ブラウザの既定）に使う
    if (e.target instanceof HTMLInputElement && e.target.value !== '') return;
    e.preventDefault();
    onClose();
  };

  if (!isSheet) {
    return (
      <aside
        ref={sheetRef}
        data-state={state}
        className={desktopClassName}
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
      >
        {header}
        <div ref={contentRef} className={desktopContentClassName}>
          {children}
        </div>
        {footer}
      </aside>
    );
  }

  return (
    <aside
      ref={sheetRef}
      data-state={state}
      data-snap={snap}
      // 地は不透明（高さが動くシートに backdrop-filter を掛けると iOS で毎フレームぼかしを計算し直すうえ、貼り付くタブとの継ぎ目が出る）
      // z-[26]: 右上の丸ボタン（z-25）より上、検索バー（z-30）より下。高い段では丸ボタンがシートの下に隠れる
      className="t-sheet pointer-events-auto fixed inset-x-0 bottom-0 z-[26] mx-auto flex w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-b-0 border-[#DDD6C8] bg-[#FAF7F2] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      {/* 高い段の上端（検索バーの下）を測るための見えない物差し */}
      <div
        ref={probeRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0 h-[calc(max(0.75rem,env(safe-area-inset-top))_+_3.5rem)] w-px"
      />

      <div
        ref={grabRef}
        className="shrink-0 touch-none select-none"
        onPointerDown={handleGrabPointerDown}
        onClickCapture={handleGrabClickCapture}
        onClick={handleGrabClick}
      >
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => onSnapChange(cycleSnap(snap))}
            onKeyDown={handleHandleKeyDown}
            aria-label={`シートの高さを変える（いま${SNAP_LABEL[snap]}）`}
            className="flex h-7 w-16 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B365D]"
          >
            <span aria-hidden="true" className="h-1 w-10 rounded-full bg-[#CFC6B5]" />
          </button>
        </div>
        {header}
      </div>

      <div
        ref={contentRef}
        inert={snap === 'peek' ? true : undefined}
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${sheetContentClassName}`}
      >
        {children}
      </div>

      {footer && (
        <div ref={footerRef} className="shrink-0">
          {footer}
        </div>
      )}
    </aside>
  );
}
