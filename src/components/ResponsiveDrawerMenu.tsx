import React from 'react';
import { Menu, Drawer, useMediaQuery, useTheme, Box, Typography, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useScrollShadows, ScrollShadows } from '../lib/ui-utils';

interface ResponsiveDrawerMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  PaperProps?: any;
  MenuListProps?: any; // To maintain compatibility with Menu standard props
}

export function ResponsiveDrawerMenu({ anchorEl, open, onClose, children, title, PaperProps, MenuListProps }: ResponsiveDrawerMenuProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { containerRef, showTop, showBottom, checkScroll } = useScrollShadows();

  if (isMobile) {
    return (
      <Drawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        style={{ zIndex: 9999 }}
        sx={{ zIndex: 9999 }}
        PaperProps={{
          ...PaperProps,
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            pb: 2,
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 9999,
            ...PaperProps?.sx
          }
        }}
      >
        <Box display="flex" justifyContent="space-between" alignItems="center" p={2} borderBottom={title ? `1px solid ${theme.palette.divider}` : 'none'} flexShrink={0}>
          <Typography variant="h6" fontWeight="bold">{title || ''}</Typography>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
        <Box sx={{ position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, flexGrow: 1 }}>
          <ScrollShadows top={showTop} bottom={showBottom} theme={theme} />
          <Box ref={containerRef} onScroll={checkScroll} sx={{ overflowY: 'auto', p: 1, minHeight: 0, flexGrow: 1 }}>
            {children}
          </Box>
        </Box>
      </Drawer>
    );
  }

  return (
    <Menu
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      PaperProps={PaperProps}
      MenuListProps={MenuListProps}
    >
      {title && (
        <Box px={2} py={1} borderBottom={`1px solid ${theme.palette.divider}`} mb={1}>
          <Typography variant="subtitle2" fontWeight="bold">{title}</Typography>
        </Box>
      )}
      {children}
    </Menu>
  );
}
