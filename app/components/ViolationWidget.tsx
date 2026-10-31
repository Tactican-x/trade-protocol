import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RuleViolation } from '../store/interventionEngine';
import { colors, font, spacing, radius } from '../theme';

interface ViolationWidgetProps {
  violations: RuleViolation[];
  onPress?: () => void;
}

export function ViolationWidget({ violations, onPress }: ViolationWidgetProps) {
  if (violations.length === 0) return null;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.8 : 1}
      style={vStyles.card}
    >
      {/* Header */}
      <View style={vStyles.header}>
        <View style={vStyles.iconBg}>
          <Ionicons name="alert-circle" size={16} color={colors.red} />
        </View>
        <View style={vStyles.headerText}>
          <Text style={vStyles.title}>RULE VIOLATION PATTERNS</Text>
          <Text style={vStyles.subtitle}>
            Rules you keep skipping (last 20 trades)
          </Text>
        </View>
        {onPress && (
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        )}
      </View>

      {/* Violations */}
      {violations.map((v, i) => {
        const barW = Math.max(4, v.missRate);
        const violationColor =
          v.missRate >= 80
            ? colors.red
            : v.missRate >= 60
            ? colors.amber
            : colors.muted;

        return (
          <View key={i} style={vStyles.row}>
            <View style={vStyles.ruleInfo}>
              <Text style={vStyles.ruleText} numberOfLines={1}>
                {v.rule}
              </Text>
              <Text style={[vStyles.missLabel, { color: violationColor }]}>
                Skipped {v.missCount}/{v.totalTrades} times
              </Text>
            </View>
            <View style={vStyles.barArea}>
              <View style={vStyles.barBg}>
                <View
                  style={[
                    vStyles.barFill,
                    {
                      width: `${barW}%`,
                      backgroundColor: violationColor,
                    },
                  ]}
                />
              </View>
              <Text style={[vStyles.pct, { color: violationColor }]}>
                {v.missRate}%
              </Text>
            </View>
          </View>
        );
      })}

      {/* Footer message */}
      <View style={vStyles.footer}>
        <Ionicons name="bulb" size={12} color={colors.amber} />
        <Text style={vStyles.footerText}>
          Focus on these rules in your next trade checklist
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const vStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.red + '44',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  iconBg: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.red + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  title: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.red,
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  subtitle: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.muted,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  ruleInfo: { width: 140 },
  ruleText: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.text,
    fontWeight: '600',
    marginBottom: 2,
  },
  missLabel: {
    fontFamily: font.mono,
    fontSize: 8,
    letterSpacing: 0.3,
  },
  barArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  barBg: {
    flex: 1,
    height: 6,
    backgroundColor: colors.surface2,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  pct: {
    fontFamily: font.mono,
    fontSize: 10,
    fontWeight: '800',
    width: 32,
    textAlign: 'right',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  footerText: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.muted,
  },
});