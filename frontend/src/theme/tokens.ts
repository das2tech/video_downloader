// Design tokens for Video Downloader (Light theme, "iOS-Native Clean" personality)
// Derived from /app/design_guidelines.json

export const colors = {
  surface: '#F9F8F6',
  onSurface: '#1A1918',
  surfaceSecondary: '#FFFFFF',
  onSurfaceSecondary: '#1A1918',
  surfaceTertiary: '#EAE7E0',
  onSurfaceTertiary: '#4A4846',
  surfaceInverse: '#1A1918',
  onSurfaceInverse: '#F9F8F6',
  brand: '#D9534F',
  brandPrimary: '#D9534F',
  onBrandPrimary: '#FFFFFF',
  brandSecondary: '#F2A8A5',
  onBrandSecondary: '#1A1918',
  brandTertiary: '#F9D5D3',
  onBrandTertiary: '#8B302D',
  success: '#3A824A',
  onSuccess: '#FFFFFF',
  warning: '#D99736',
  onWarning: '#FFFFFF',
  error: '#B83A3A',
  onError: '#FFFFFF',
  info: '#4A4846',
  onInfo: '#FFFFFF',
  border: '#EAE7E0',
  borderStrong: '#D1CDC5',
  divider: '#EAE7E0',
  overlay: 'rgba(26,25,24,0.55)',
  muted: '#8A8783',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

// System-safe font stacks. We treat "display" as slightly heavier / tabular.
export const fonts = {
  text: undefined as string | undefined, // system default (San Francisco / Roboto)
  display: undefined as string | undefined,
} as const;

export const fontSize = {
  xs: 11,
  sm: 12,
  base: 14,
  md: 15,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 30,
} as const;

export const shadow = {
  tier1: {
    shadowColor: '#1A1918',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tier2: {
    shadowColor: '#1A1918',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} as const;
