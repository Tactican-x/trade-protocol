import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, spacing, radius } from '../theme';

interface LiveDisciplineMeterProps {
  score: number;
  checkedCount: number;
  totalRules: number;
}

export function LiveDisciplineMeter({
  score,
  checkedCount,
  totalRules,
}: LiveDisciplineMeterProps) {
  const animWidth = useRef(new Animated.Value(0)).current;
  const animScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Animate bar width
    Animated.spring(animWidth, {
      toValue: score,
      useNativeDriver: false,
      tension: 60,
      friction: 8,
    }).start();

    // Pulse on change
    Animated.sequence([
      Animated.timing(animScale, {
        toValue: 1.02,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(animScale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, [score]);

  // Determine zone
  const getZone = () => {
    if (score >= 80) return { label: 'HIGH DISCIPLINE', color: colors.green, icon: 'shield-checkmark' };
    if (score >= 60) return { label: 'MODERATE', color: colors.amber, icon: 'shield-half' };
    if (score >= 40) return { label: 'LOW DISCIPLINE', color: colors.red, icon: 'warning' };
    return { label: 'CRITICAL', color: colors.red, icon: 'alert-circle' };
  };

  const zone = getZone();

  const barWidth = animWidth.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      style={[
        meterStyles.container,
        {
          borderColor: zone.color + '44',
          transform: [{ scale: animScale }],
        },
      ]}
    >
      {/* Header */}
      <View style={meterStyles.header}>
        <View style={meterStyles.left}>
          <View style={[meterStyles.iconBg, { backgroundColor: zone.color + '18' }]}>
            <Ionicons name={zone.icon as any} size={14} color={zone.color} />
          </View>
          <View>
            <Text style={meterStyles.title}>LIVE DISCIPLINE METER</Text>
            <Text style={[meterStyles.zone, { color: zone.color }]}>
              {zone.label}
            </Text>
          </View>
        </View>
        <View style={meterStyles.scoreBox}>
          <Text style={[meterStyles.score, { color: zone.color }]}>
            {Math.round(score)}%
          </Text>
          <Text style={meterStyles.scoreLabel}>
            {checkedCount}/{totalRules}
          </Text>
        </View>
      </View>

      {/* Bar */}
      <View style={meterStyles.barBg}>
        {/* Zone markers */}
        <View style={[meterStyles.marker, { left: '60%' }]} />
        <View style={[meterStyles.marker, { left: '80%' }]} />
        {/* Fill */}
        <Animated.View
          style={[
            meterStyles.barFill,
            {
              width: barWidth,
              backgroundColor: zone.color,
            },
          ]}
        />
      </View>

      {/* Zone labels */}
      <View style={meterStyles.zoneLabels}>
        <Text style={[meterStyles.zoneLabel, { color: colors.red }]}>
          0 — Critical
        </Text>
        <Text style={[meterStyles.zoneLabel, { color: colors.amber }]}>
          60 — Good
        </Text>
        <Text style={[meterStyles.zoneLabel, { color: colors.green }]}>
          80 — Excellent
        </Text>
      </View>

      {/* Context message */}
      <Text style={[meterStyles.contextMsg, { color: zone.color }]}>
        {score >= 80
          ? '✦ Excellent — you are following your system perfectly'
          : score >= 60
          ? '◈ Good — keep completing the checklist before saving'
          : score >= 40
          ? '⚠ Low — review your rules before proceeding'
          : '🚨 Critical — do not trade in this state'}
      </Text>
    </Animated.View>
  );
}

const meterStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconBg: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: font.mono,
    fontSize: 8,
    color: colors.muted,
    letterSpacing: 1.5,
  },
  zone: {
    fontFamily: font.mono,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  scoreBox: { alignItems: 'flex-end' },
  score: {
    fontFamily: font.mono,
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 32,
  },
  scoreLabel: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.muted,
  },
  barBg: {
    height: 10,
    backgroundColor: colors.surface2,
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 6,
    position: 'relative',
  },
  marker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: colors.bg,
    zIndex: 1,
  },
  barFill: {
    height: 10,
    borderRadius: 5,
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  zoneLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  zoneLabel: {
    fontFamily: font.mono,
    fontSize: 8,
    opacity: 0.7,
  },
  contextMsg: {
    fontFamily: font.mono,
    fontSize: 10,
    lineHeight: 15,
  },
});