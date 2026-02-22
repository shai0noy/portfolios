import {
  Button,
  Menu,
  MenuItem,
  Checkbox,
  FormControlLabel,
} from "@mui/material";

interface ColumnSelectorProps {
  columns: Record<string, boolean>;
  columnDisplayNames: Record<string, string>;
  onColumnChange: (key: string, value: boolean) => void;
  anchorEl: null | HTMLElement;
  open: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onClose: () => void;
  label: string;
  disabled?: boolean;
}

export function ColumnSelector({
  columns,
  columnDisplayNames,
  onColumnChange,
  anchorEl,
  open,
  onClick,
  onClose,
  label,
  disabled,
}: ColumnSelectorProps) {
  return (
    <div>
      <Button
        id="basic-button"
        aria-controls={open ? "basic-menu" : undefined}
        aria-haspopup="true"
        aria-expanded={open ? "true" : undefined}
        onClick={onClick}
      >
        {label}
      </Button>
      <Menu
        id="basic-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={onClose}
        MenuListProps={{
          "aria-labelledby": "basic-button",
        }}
        sx={{
          '.MuiMenuItem-root': {
            opacity: disabled ? 0.7 : 1
          }
        }}
      >
        {Object.entries(columns).map(([key, value]) => (
          <MenuItem key={key} disabled={disabled} sx={{ py: 0, minHeight: 32 }}>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={value}
                  onChange={(e) => onColumnChange(key, e.target.checked)}
                  disabled={disabled}
                  sx={{ p: 0.5, mr: 0.5 }}
                />
              }
              label={columnDisplayNames[key] || key}
              sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.85rem' }, m: 0 }}
            />
          </MenuItem>
        ))}
      </Menu>
    </div>
  );
}
