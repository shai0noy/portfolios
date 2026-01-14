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
      >
        {Object.entries(columns).map(([key, value]) => (
          <MenuItem key={key}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={value}
                  onChange={(e) => onColumnChange(key, e.target.checked)}
                />
              }
              label={columnDisplayNames[key] || key}
            />
          </MenuItem>
        ))}
      </Menu>
    </div>
  );
}
