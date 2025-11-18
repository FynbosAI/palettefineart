import { createTheme, alpha as muiAlpha, darken as muiDarken, lighten as muiLighten } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';
import { AppConfigService } from './lib/supabase';

// Default theme (fallback if config not loaded)
type ThemeWithHelpers = Theme & {
  alpha: typeof muiAlpha;
  darken: typeof muiDarken;
  lighten: typeof muiLighten;
};

const ensureThemeColorHelpers = <T extends Theme>(theme: T): T => {
  const mutableTheme = theme as unknown as Partial<ThemeWithHelpers>;

  if (typeof mutableTheme.alpha !== 'function') {
    mutableTheme.alpha = muiAlpha;
  }

  if (typeof mutableTheme.darken !== 'function') {
    mutableTheme.darken = muiDarken;
  }

  if (typeof mutableTheme.lighten !== 'function') {
    mutableTheme.lighten = muiLighten;
  }

  return theme;
};

const defaultTheme = ensureThemeColorHelpers(createTheme({
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
}));

// Function to create theme with dynamic colors
export const createDynamicTheme = async () => {
  const colors = await AppConfigService.getThemeColors();
  
  if (!colors) {
    return defaultTheme;
  }
  
  return ensureThemeColorHelpers(createTheme({
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
  }));
};

export default defaultTheme; 
