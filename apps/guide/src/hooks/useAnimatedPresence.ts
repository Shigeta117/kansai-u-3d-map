import { useEffect, useState } from 'react';

export interface AnimatedPresenceState {
  mounted: boolean;
  visible: boolean;
}

export function useAnimatedPresence(
  open: boolean,
  exitDurationMs = 150,
): AnimatedPresenceState {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (open) {
      setMounted(true);
      if (reduced) {
        setVisible(true);
        return;
      }
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          setVisible(true);
        });
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }

    setVisible(false);
    if (!mounted) return;
    if (reduced) {
      setMounted(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setMounted(false);
    }, exitDurationMs);
    return () => window.clearTimeout(timer);
  }, [open, exitDurationMs, mounted]);

  return { mounted, visible };
}

