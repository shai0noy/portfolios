
import type { Theme } from '@mui/material/styles';

/**
 * Hook to track scroll position and determine if shadows should be shown.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Box } from '@mui/material';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';

export function useResponsiveDialogProps() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  return {
    fullScreen: isMobile,
    maxWidth: "lg" as const,
    fullWidth: true,
    sx: { '& .MuiDialog-container': { alignItems: { xs: 'center', md: 'center' }, pt: 0 } },
    PaperProps: {
      sx: {
        width: isMobile ? '100%' : 'min(900px, 96%)',
        m: isMobile ? 0 : 1,
        maxHeight: isMobile ? '100%' : '90vh',
        minHeight: { xs: 'auto', md: '600px' },
        display: 'flex',
        flexDirection: 'column',
        height: isMobile ? '100%' : 'auto'
      }
    }
  };
}

export function useScrollShadows(orientation: 'vertical' | 'horizontal' | 'both' = 'vertical') {
  const [showTop, setShowTop] = useState(false);
  const [showBottom, setShowBottom] = useState(false);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const checkScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    if (orientation === 'vertical' || orientation === 'both') {
      const { scrollTop, scrollHeight, clientHeight } = el;
      setShowTop(scrollTop > 0);
      const atBottom = Math.ceil(scrollTop + clientHeight) >= scrollHeight;
      const hasOverflow = scrollHeight > clientHeight;
      setShowBottom(hasOverflow && !atBottom);
    }

    if (orientation === 'horizontal' || orientation === 'both') {
      const { scrollLeft, scrollWidth, clientWidth } = el;
      const isRtl = window.getComputedStyle(el).direction === 'rtl';

      if (isRtl) {
        // In RTL:
        // - scrollLeft starts at 0 (far right) and decreases to negative values as we scroll left.
        // - At the far left (end), scrollLeft is approximately clientWidth - scrollWidth.
        
        // Content is hidden on the right (start) if we have scrolled left from the start (0)
        setShowRight(scrollLeft < -1);
        
        // Content is hidden on the left (end) if we haven't scrolled all the way to the left
        const atLeft = Math.abs(scrollLeft) + clientWidth >= scrollWidth - 1;
        const hasOverflow = scrollWidth > clientWidth;
        setShowLeft(hasOverflow && !atLeft);
      } else {
        // In LTR:
        // - scrollLeft starts at 0 (far left) and increases to positive values as we scroll right.
        setShowLeft(scrollLeft > 1);
        const atRight = scrollLeft + clientWidth >= scrollWidth - 1;
        const hasOverflow = scrollWidth > clientWidth;
        setShowRight(hasOverflow && !atRight);
      }
    }
  }, [orientation]);

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      checkScroll();
      el.addEventListener('scroll', checkScroll);
      window.addEventListener('resize', checkScroll);
      const interval = setInterval(checkScroll, 1000);
      return () => {
        el.removeEventListener('scroll', checkScroll);
        window.removeEventListener('resize', checkScroll);
        clearInterval(interval);
      };
    }
  }, [checkScroll]);

  return { containerRef, showTop, showBottom, showLeft, showRight, checkScroll };
}

interface ScrollShadowsProps {
  top?: boolean;
  bottom?: boolean;
  left?: boolean;
  right?: boolean;
  theme: Theme;
}

export const ScrollShadows = ({ top, bottom, left, right, theme }: ScrollShadowsProps) => {
  const shadowColor = theme.palette.mode === 'light' ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.8)';

  return (
    <>
      {/* Top Shadow */}
      <Box sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '24px',
        background: `radial-gradient(farthest-side at 50% 0, ${shadowColor}, transparent)`,
        opacity: top ? 1 : 0,
        transition: 'opacity 0.2s',
        pointerEvents: 'none',
        zIndex: 10,
        borderTopLeftRadius: 'inherit',
        borderTopRightRadius: 'inherit'
      }} />

      {/* Bottom Shadow */}
      <Box sx={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '24px',
        background: `radial-gradient(farthest-side at 50% 100%, ${shadowColor}, transparent)`,
        opacity: bottom ? 1 : 0,
        transition: 'opacity 0.2s',
        pointerEvents: 'none',
        zIndex: 10,
        borderBottomLeftRadius: 'inherit',
        borderBottomRightRadius: 'inherit'
      }} />

      {/* Left Shadow */}
      <Box sx={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        width: '24px',
        background: `radial-gradient(farthest-side at 0 50%, ${shadowColor}, transparent)`,
        opacity: left ? 1 : 0,
        transition: 'opacity 0.2s',
        pointerEvents: 'none',
        zIndex: 10,
        borderTopLeftRadius: 'inherit',
        borderBottomLeftRadius: 'inherit'
      }} />

      {/* Right Shadow */}
      <Box sx={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        right: 0,
        width: '24px',
        background: `radial-gradient(farthest-side at 100% 50%, ${shadowColor}, transparent)`,
        opacity: right ? 1 : 0,
        transition: 'opacity 0.2s',
        pointerEvents: 'none',
        zIndex: 10,
        borderTopRightRadius: 'inherit',
        borderBottomRightRadius: 'inherit'
      }} />
    </>
  );
};
