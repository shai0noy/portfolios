import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Box, Typography,
  CircularProgress, Stack, FormControl, Select, MenuItem, InputAdornment
} from '@mui/material';
import CakeIcon from '@mui/icons-material/Cake';
import EventIcon from '@mui/icons-material/Event';
import ChildCareIcon from '@mui/icons-material/ChildCare';
import HomeIcon from '@mui/icons-material/Home';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import { useLanguage } from '../lib/i18n';

export interface UserFinancialProfile {
  age?: number;
  retirementAge?: number;
  numChildren?: number;
  netYearlyEarnings?: number;
  yearlySpending?: number;
  ownsHome?: boolean;
}

interface ProfileFormProps {
  open: boolean;
  initialProfile: UserFinancialProfile;
  loadingProfile: boolean;
  displayCurrency: string;
  onSave: (p: UserFinancialProfile) => void;
  onCancel: () => void;
  savingProfile: boolean;
}

export const ProfileForm: React.FC<ProfileFormProps> = ({ 
  open, initialProfile, loadingProfile, displayCurrency, onSave, onCancel, savingProfile 
}) => {
  const { t } = useLanguage();
  const [draftProfile, setDraftProfile] = useState<UserFinancialProfile>(initialProfile);

  useEffect(() => {
    setDraftProfile(initialProfile);
  }, [initialProfile]);

  const handleSave = () => onSave(draftProfile);

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>{t('User Financial Profile', 'פרופיל פיננסי אישי')}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={3} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            {t('Providing this information helps the AI give more personalized advice.', 'מסירת מידע זה תעזור ל-AI לתת עצות מותאמות אישית יותר.')}
          </Typography>

          {loadingProfile && <CircularProgress size={24} sx={{ alignSelf: 'center' }} />}

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3 }}>
            <TextField
              label={t('Age', 'גיל')}
              type="number"
              disabled={loadingProfile}
              value={draftProfile.age ?? ''}
              onChange={(e) => setDraftProfile({ ...draftProfile, age: e.target.value === '' ? undefined : parseInt(e.target.value) })}
              fullWidth
              size="small"
              placeholder={t('Not provided', 'לא צוין')}
              InputProps={{
                startAdornment: <InputAdornment position="start"><CakeIcon fontSize="small" color="primary" /></InputAdornment>,
              }}
            />
            <TextField
              label={t('Desired Retirement Age', 'גיל פרישה רצוי')}
              type="number"
              disabled={loadingProfile}
              value={draftProfile.retirementAge ?? ''}
              onChange={(e) => setDraftProfile({ ...draftProfile, retirementAge: e.target.value === '' ? undefined : parseInt(e.target.value) })}
              fullWidth
              size="small"
              placeholder={t('Not provided', 'לא צוין')}
              InputProps={{
                startAdornment: <InputAdornment position="start"><EventIcon fontSize="small" color="primary" /></InputAdornment>,
              }}
            />
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3 }}>
            <TextField
              label={t('Number of Children', 'מספר ילדים')}
              type="number"
              disabled={loadingProfile}
              value={draftProfile.numChildren ?? ''}
              onChange={(e) => setDraftProfile({ ...draftProfile, numChildren: e.target.value === '' ? undefined : parseInt(e.target.value) })}
              fullWidth
              size="small"
              placeholder={t('Not provided', 'לא צוין')}
              InputProps={{
                startAdornment: <InputAdornment position="start"><ChildCareIcon fontSize="small" color="primary" /></InputAdornment>,
              }}
            />
            <FormControl size="small" fullWidth>
              <Select
                value={draftProfile.ownsHome === undefined ? 'unknown' : (draftProfile.ownsHome ? 'yes' : 'no')}
                onChange={(e) => {
                  const val = e.target.value;
                  setDraftProfile({
                    ...draftProfile,
                    ownsHome: val === 'unknown' ? undefined : (val === 'yes')
                  });
                }}
                size="small"
                disabled={loadingProfile}
                sx={{ mt: 0 }}
                startAdornment={
                  <InputAdornment position="start">
                    <HomeIcon fontSize="small" color="primary" />
                  </InputAdornment>
                }
              >
                <MenuItem value="unknown">{t('Home Ownership: Unknown', 'בעלות על דירה: לא ידוע')}</MenuItem>
                <MenuItem value="yes">{t('Yes, owns home', 'כן, בעל דירה')}</MenuItem>
                <MenuItem value="no">{t('No, does not own', 'לא, אינו בעל דירה')}</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3 }}>
            <TextField
              label={t('Avg. Yearly Net Earnings', 'הכנסה שנתית נטו ממוצעת')}
              type="number"
              disabled={loadingProfile}
              value={draftProfile.netYearlyEarnings ?? ''}
              onChange={(e) => setDraftProfile({ ...draftProfile, netYearlyEarnings: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
              fullWidth
              size="small"
              placeholder={t('Not provided', 'לא צוין')}
              InputProps={{
                startAdornment: <InputAdornment position="start"><AccountBalanceWalletIcon fontSize="small" color="primary" /></InputAdornment>,
                endAdornment: <InputAdornment position="end"><Typography variant="caption" sx={{ fontWeight: 600 }}>{displayCurrency}</Typography></InputAdornment>
              }}
            />
            <TextField
              label={t('Avg. Yearly Spending', 'הוצאה שנתית ממוצעת')}
              type="number"
              disabled={loadingProfile}
              value={draftProfile.yearlySpending ?? ''}
              onChange={(e) => setDraftProfile({ ...draftProfile, yearlySpending: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
              fullWidth
              size="small"
              placeholder={t('Not provided', 'לא צוין')}
              InputProps={{
                startAdornment: <InputAdornment position="start"><ShoppingCartIcon fontSize="small" color="primary" /></InputAdornment>,
                endAdornment: <InputAdornment position="end"><Typography variant="caption" sx={{ fontWeight: 600 }}>{displayCurrency}</Typography></InputAdornment>
              }}
            />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{t('Cancel', 'ביטול')}</Button>
        <Button onClick={handleSave} variant="contained" disabled={savingProfile}>
          {savingProfile ? <CircularProgress size={24} /> : t('Save', 'שמור')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
