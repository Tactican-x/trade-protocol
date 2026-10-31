export const colors = {
  bg: '#0b0b14',
  surface: '#13131f',
  surface2: '#1c1c2e',
  border: 'rgba(255,255,255,0.08)',
  border2: 'rgba(255,255,255,0.15)',
  text: '#eeeef0',
  muted: 'rgba(238,238,240,0.45)',
  green: '#00d68f',
  blue: '#4fc3f7',
  red: '#ff6b6b',
  amber: '#ffd166',
  purple: '#a78bfa',
};

export const font = {
  mono: 'Courier' as const,
  display: 'SpaceGrotesk_700Bold' as const,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

export const radius = {
  sm: 8,
  md: 10,
  lg: 12,
  pill: 20,
};

export const cardStyle = {
  backgroundColor: colors.surface,
  borderWidth: 0.5,
  borderColor: colors.border,
  borderRadius: radius.lg,
  padding: spacing.md,
};

export const inputStyle = {
  backgroundColor: colors.surface2,
  borderWidth: 0.5,
  borderColor: colors.border,
  borderRadius: radius.sm,
  padding: 9,
  color: colors.text,
  fontSize: 13,
};