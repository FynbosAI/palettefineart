import { createTheme } from '@mui/material/styles';
import { AppConfigService } from './lib/supabase';

// Default theme (fallback if config not loaded)
const defaultTheme = createTheme({
  typography: {
    fontFamily: '"Fractul", "Helvetica Neue", Arial, sans-serif',
  },
  palette: {
    primary: {
      main: '#8412ff',
      light: '#b587e8',
      dark: '#730add',
    },
    secondary: {
      main: '#00aaab',
      light: '#00aaab',
      dark: '#008a8b',
    },
    background: {
      default: '#ead9f9',
      paper: '#ffffff',
    },
  },
});

// Function to create theme with dynamic colors
export const createDynamicTheme = async () => {
  const colors = await AppConfigService.getThemeColors();
  
  if (!colors) {
    return defaultTheme;
  }
  
  return createTheme({
    typography: {
      fontFamily: '"Fractul", "Helvetica Neue", Arial, sans-serif',
    },
    palette: {
      primary: {
        main: colors.primary || '#8412ff',
        light: colors.primaryLight || '#b587e8',
        dark: colors.primaryDark || '#730add',
      },
      secondary: {
        main: colors.secondary || '#00aaab',
        light: colors.secondaryLight || '#00aaab',
        dark: colors.secondaryDark || '#008a8b',
      },
      background: {
        default: colors.background || '#ead9f9',
        paper: colors.paper || '#ffffff',
      },
    },
  });
};

export default defaultTheme; 