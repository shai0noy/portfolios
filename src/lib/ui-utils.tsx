
import type { Theme } from '@mui/material/styles';

/**
 * Hook to track scroll position and determine if shadows should be shown.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Box } from '@mui/material';

export function useScrollShadows(orientation: 'vertical' | 'horizontal' = 'vertical') {
  const [showTop, setShowTop] = useState(false);
  const [showBottom, setShowBottom] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const checkScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    if (orientation === 'vertical') {
      const { scrollTop, scrollHeight, clientHeight } = el;
      // Show top if we've scrolled down at all
      setShowTop(scrollTop > 0);
      // Show bottom if we're not at the very bottom
      // Use a small buffer (1px) for float math
      const atBottom = Math.ceil(scrollTop + clientHeight) >= scrollHeight;
      // Also ensure there IS content to scroll
      const hasOverflow = scrollHeight > clientHeight;
      setShowBottom(hasOverflow && !atBottom);
    } else {
      const { scrollLeft, scrollWidth, clientWidth } = el;
      setShowTop(scrollLeft > 0); // "Top" corresponds to "Left" here (start)
      const atEnd = Math.ceil(scrollLeft + clientWidth) >= scrollWidth;
      const hasOverflow = scrollWidth > clientWidth;
      setShowBottom(hasOverflow && !atEnd); // "Bottom" corresponds to "Right" here (end)
    }
  }, [orientation]);

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      checkScroll();
      el.addEventListener('scroll', checkScroll);
      window.addEventListener('resize', checkScroll);
      // Also check periodically in case content changes size (simple mutation workaround)
      const interval = setInterval(checkScroll, 1000);
      return () => {
        el.removeEventListener('scroll', checkScroll);
        window.removeEventListener('resize', checkScroll);
        clearInterval(interval);
      };
    }
  }, [checkScroll]);

  return { containerRef, showTop, showBottom, checkScroll };
}

interface ScrollShadowsProps {
  top: boolean;
  bottom: boolean;
  orientation?: 'vertical' | 'horizontal';
  theme: Theme;
}

export const ScrollShadows = ({ top, bottom, orientation = 'vertical', theme }: ScrollShadowsProps) => {
  const shadowColor = theme.palette.mode === 'light' ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.5)';

  return (
    <>
      <Box sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: orientation === 'vertical' ? 0 : 'auto',
        bottom: orientation === 'horizontal' ? 0 : 'auto',
        width: orientation === 'horizontal' ? '24px' : '100%',
        height: orientation === 'vertical' ? '24px' : '100%',
        background: orientation === 'vertical'
          ? `radial-gradient(farthest-side at 50% 0, ${shadowColor}, transparent)`
          : `radial-gradient(farthest-side at 0 50%, ${shadowColor}, transparent)`,
        opacity: top ? 1 : 0,
        transition: 'opacity 0.2s',
        pointerEvents: 'none',
        zIndex: 10,
        borderTopLeftRadius: 'inherit',
        borderTopRightRadius: 'inherit',
        borderBottomLeftRadius: 'inherit' // For horizontal mode left shadow
      }} />
      <Box sx={{
        position: 'absolute',
        bottom: 0,
        right: 0,
        left: orientation === 'vertical' ? 0 : 'auto',
        top: orientation === 'horizontal' ? 0 : 'auto',
        width: orientation === 'horizontal' ? '24px' : '100%',
        height: orientation === 'vertical' ? '24px' : '100%',
        background: orientation === 'vertical'
          ? `radial-gradient(farthest-side at 50% 100%, ${shadowColor}, transparent)`
          : `radial-gradient(farthest-side at 100% 50%, ${shadowColor}, transparent)`,
        opacity: bottom ? 1 : 0,
        transition: 'opacity 0.2s',
        pointerEvents: 'none',
        zIndex: 10,
        borderBottomLeftRadius: 'inherit',
        borderBottomRightRadius: 'inherit',
        borderTopRightRadius: 'inherit' // For horizontal mode right shadow
      }} />
    </>
  );
};
