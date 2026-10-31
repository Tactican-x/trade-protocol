import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { colors, font, spacing, radius, cardStyle } from '../theme';

// ─── ResultBadge ──────────────────────────────────────────────────────────────
interface ResultBadgeProps {
  result: 'win' | 'loss' | 'be' | 'open';
}
export function ResultBadge({ result }: ResultBadgeProps) {
  const map = {
    win: { label: 'WIN', color: colors.green },
    loss: { label: 'LOSS', color: colors.red },
    be: { label: 'B/E', color: colors.amber },
    open: { label: 'OPEN', color: colors.blue },
  };
  const { label, color } = map[result] ?? map.open;
  return (
    <View style={[styles.badge, { borderColor: color, backgroundColor: color + '22' }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
}
export function Card({ children, style }: CardProps) {
  return <View style={[cardStyle, style]}>{children}</View>;
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────
interface SectionLabelProps {
  children: React.ReactNode;
  style?: TextStyle;
}
export function SectionLabel({ children, style }: SectionLabelProps) {
  return <Text style={[styles.sectionLabel, style]}>{children}</Text>;
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string | number;
  color: string;
}
export function StatCard({ label, value, color }: StatCardProps) {
  return (
    <View style={[cardStyle, styles.statCard]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

// ─── CheckItem ────────────────────────────────────────────────────────────────
interface CheckItemProps {
  label: string;
  ticked: boolean;
  color: 'g' | 'b' | 'r';
  onPress: () => void;
}
const checkColorMap = { g: colors.green, b: colors.blue, r: colors.red };

export function CheckItem({ label, ticked, color, onPress }: CheckItemProps) {
  const accent = checkColorMap[color];
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.checkItem,
        ticked && {
          backgroundColor: accent + '18',
          borderColor: accent + '55',
          borderWidth: 0.5,
        },
      ]}
    >
      <View
        style={[
          styles.checkbox,
          ticked
            ? { backgroundColor: accent, borderColor: accent }
            : { backgroundColor: 'transparent', borderColor: accent + '88' },
        ]}
      >
        {ticked && <Text style={styles.checkMark}>✓</Text>}
      </View>
      <Text
        style={[
          styles.checkLabel,
          ticked && { color: colors.muted, textDecorationLine: 'line-through' },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── GroupLabel ───────────────────────────────────────────────────────────────
interface GroupLabelProps {
  children: React.ReactNode;
  color?: string;
}
export function GroupLabel({ children, color }: GroupLabelProps) {
  return (
    <Text style={[styles.groupLabel, color ? { color } : {}]}>{children}</Text>
  );
}

// ─── PhaseHeader ──────────────────────────────────────────────────────────────
interface PhaseHeaderProps {
  title: string;
  desc: string;
  color: string;
}
export function PhaseHeader({ title, desc, color }: PhaseHeaderProps) {
  return (
    <View style={styles.phaseHeader}>
      <Text style={[styles.phaseTitle, { color }]}>{title}</Text>
      <Text style={styles.phaseDesc}>{desc}</Text>
    </View>
  );
}

// ─── QuoteBlock ───────────────────────────────────────────────────────────────
interface QuoteBlockProps {
  text: string;
}
export function QuoteBlock({ text }: QuoteBlockProps) {
  return (
    <View style={styles.quoteBlock}>
      <Text style={styles.quoteText}>"{text}"</Text>
    </View>
  );
}

// ─── IdentityBlock ────────────────────────────────────────────────────────────
interface IdentityBlockProps {
  label: string;
  quote: string;
}
export function IdentityBlock({ label, quote }: IdentityBlockProps) {
  return (
    <View style={styles.identityBlock}>
      <Text style={styles.identityLabel}>{label}</Text>
      <Text style={styles.identityQuote}>{quote}</Text>
    </View>
  );
}

// ─── WarnBlock ────────────────────────────────────────────────────────────────
interface WarnBlockProps {
  visible: boolean;
}
export function WarnBlock({ visible }: WarnBlockProps) {
  if (!visible) return null;
  return (
    <View style={styles.warnBlock}>
      <Text style={styles.warnText}>
        ⚠ NOT ALL CONDITIONS MET — reconsider before trading
      </Text>
    </View>
  );
}

// ─── RuleTag ──────────────────────────────────────────────────────────────────
interface RuleTagProps {
  label: string;
  done: boolean;
}
export function RuleTag({ label, done }: RuleTagProps) {
  return (
    <View
      style={[
        styles.ruleTag,
        {
          backgroundColor: done ? colors.green + '22' : colors.red + '22',
          borderColor: done ? colors.green + '55' : colors.red + '55',
        },
      ]}
    >
      <Text style={[styles.ruleTagText, { color: done ? colors.green : colors.red }]}>
        {done ? '✓ ' : '✗ '}
        {label}
      </Text>
    </View>
  );
}

// ─── PrimaryButton ────────────────────────────────────────────────────────────
interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}
export function PrimaryButton({ label, onPress, disabled }: PrimaryButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      disabled={disabled}
      style={[styles.primaryBtn, disabled && { opacity: 0.5 }]}
    >
      <Text style={styles.primaryBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── GhostButton ─────────────────────────────────────────────────────────────
interface GhostButtonProps {
  label: string;
  onPress: () => void;
  danger?: boolean;
}
export function GhostButton({ label, onPress, danger }: GhostButtonProps) {
  const borderColor = danger ? colors.red : colors.border2;
  const textColor = danger ? colors.red : colors.text;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.ghostBtn, { borderColor }]}
    >
      <Text style={[styles.ghostBtnText, { color: textColor }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
interface ToastProps {
  message: string;
  visible: boolean;
}
export function Toast({ message, visible }: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(1800),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, message]);

  return (
    <Animated.View style={[styles.toast, { opacity }]} pointerEvents="none">
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  badgeText: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '700',
  },
  sectionLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.muted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 80,
  },
  statLabel: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.muted,
    letterSpacing: 1,
    marginBottom: 6,
    textAlign: 'center',
  },
  statValue: {
    fontFamily: font.mono,
    fontSize: 24,
    fontWeight: '700',
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: 4,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkMark: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  checkLabel: {
    color: colors.text,
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  groupLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.muted,
    letterSpacing: 1.5,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  phaseHeader: {
    marginBottom: spacing.lg,
  },
  phaseTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  phaseDesc: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.muted,
  },
  quoteBlock: {
    borderLeftWidth: 3,
    borderLeftColor: colors.blue,
    paddingLeft: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.lg,
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
  },
  quoteText: {
    color: colors.text,
    fontStyle: 'italic',
    fontSize: 13,
    lineHeight: 20,
  },
  identityBlock: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(79,195,247,0.3)',
    borderRadius: radius.lg,
    backgroundColor: 'rgba(79,195,247,0.06)',
    padding: spacing.lg,
    alignItems: 'center',
  },
  identityLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.blue,
    letterSpacing: 2,
    marginBottom: spacing.sm,
  },
  identityQuote: {
    color: colors.text,
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 22,
  },
  warnBlock: {
    borderWidth: 1,
    borderColor: colors.red + '66',
    borderRadius: radius.sm,
    backgroundColor: colors.red + '11',
    padding: spacing.md,
    marginVertical: spacing.sm,
  },
  warnText: {
    color: colors.red,
    fontSize: 12,
    fontFamily: font.mono,
    textAlign: 'center',
  },
  ruleTag: {
    borderWidth: 0.5,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 4,
    marginBottom: 4,
  },
  ruleTagText: {
    fontFamily: font.mono,
    fontSize: 9,
    letterSpacing: 0.3,
  },
  primaryBtn: {
    backgroundColor: colors.green,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    width: '100%',
  },
  primaryBtnText: {
    color: '#0b0b14',
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 0.5,
    fontFamily: font.mono,
  },
  ghostBtn: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    width: '100%',
  },
  ghostBtnText: {
    fontSize: 13,
    fontFamily: font.mono,
    letterSpacing: 0.5,
  },
  toast: {
    position: 'absolute',
    bottom: 90,
    left: 24,
    right: 24,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.border2,
    alignItems: 'center',
    zIndex: 999,
  },
  toastText: {
    color: colors.text,
    fontFamily: font.mono,
    fontSize: 12,
    letterSpacing: 0.5,
  },
});