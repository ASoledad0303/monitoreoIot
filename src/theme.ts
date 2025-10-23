import { createTheme, responsiveFontSizes } from '@mui/material/styles';

function buildTheme(mode: 'light' | 'dark' = 'dark') {
  const isDark = mode === 'dark';

  const theme = createTheme({
    palette: {
      mode,
      primary: { main: '#10b981' }, // verde (emerald)
      secondary: { main: '#22d3ee' }, // cian frío
      background: isDark
        ? { default: '#0b1220', paper: '#0f172a' }
        : { default: '#f7faf7', paper: '#ffffff' },
      text: isDark
        ? { primary: '#e5e7eb', secondary: '#94a3b8' }
        : { primary: '#0b1f14', secondary: '#3f4a55' },
    },
    typography: {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 15,
      h4: { fontWeight: 600 },
      h6: { fontWeight: 600 },
    },
    shape: { borderRadius: 12 },
    components: {

      MuiPaper: {
        styleOverrides: {
          root: {
            border: '1px solid #1f2937',
            backgroundImage: 'none',
            padding: '16px',
            '@media (max-width:600px)': { padding: '12px' },
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: { textTransform: 'none', borderRadius: 10 },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: { borderColor: '#1f2937' },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { backgroundColor: isDark ? '#0f172a' : '#ffffff' },
        },
      },
      MuiDialogContent: {
        styleOverrides: {
          root: {
            padding: '16px',
            '@media (max-width:600px)': { padding: '12px' },
          },
        },
      },
      MuiToolbar: {
        styleOverrides: {
          root: { minHeight: 56, '@media (max-width:600px)': { minHeight: 48 } },
        },
      },
    },
  });

  return responsiveFontSizes(theme);
}

export default function getTheme(mode: 'light' | 'dark' = 'dark') {
  return buildTheme(mode);
}