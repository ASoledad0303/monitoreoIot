import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#2563eb' }, // azul moderno
    secondary: { main: '#7c3aed' }, // violeta acento
    background: {
      default: '#f7f8fb',
      paper: '#ffffff',
    },
    text: {
      primary: '#0f172a',
      secondary: '#475569',
    },
  },
  typography: {
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  shape: { borderRadius: 12 },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: { border: '1px solid #e5e7eb' },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', borderRadius: 10 },
      },
    },
  },
});

export default theme;