import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InterventionResult } from '../store/interventionEngine';
import { colors, font, spacing, radius } from '../theme';

// ── Forced Pause Timer ────────────────────────────────────────────────────────
function ForcedPauseTimer({
  seconds,
  onComplete,
  color,
}: {
  seconds: number;
  onComplete: () => void;
  color: string;
}) {
  const [remaining, setRemaining] = useState(seconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: 0,
      duration: seconds * 1000,
      useNativeDriver: false,
    }).start();

    intervalRef.current = setInterval(async () => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          onComplete();
          return 0;
        }
        if (prev % 10 === 0) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={timerStyles.container}>
      <View style={timerStyles.header}>
        <Ionicons name="timer" size={16} color={color} />
        <Text style={[timerStyles.label, { color }]}>FORCED PAUSE</Text>
      </View>
      <Text style={timerStyles.desc}>
        Take this time to breathe and reconsider your decision.
      </Text>
      <View style={timerStyles.countdownRow}>
        <Text style={[timerStyles.countdown, { color }]}>{remaining}s</Text>
        <Text style={timerStyles.countdownLabel}>remaining</Text>
      </View>
      <View style={timerStyles.progressBg}>
        <Animated.View
          style={[
            timerStyles.progressFill,
            { width: progressWidth, backgroundColor: color },
          ]}
        />
      </View>
    </View>
  );
}
const timerStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.xs,
  },
  label: {
    fontFamily: font.mono,
    fontSize: 9,
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  desc: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.muted,
    lineHeight: 15,
    marginBottom: spacing.sm,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: spacing.sm,
  },
  countdown: {
    fontFamily: font.mono,
    fontSize: 36,
    fontWeight: '800',
  },
  countdownLabel: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.muted,
  },
  progressBg: {
    height: 6,
    backgroundColor: colors.surface,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
});

// ── Regret Simulator ──────────────────────────────────────────────────────────
function RegretSimulator({
  onAnswer,
}: {
  onAnswer: (willRegret: boolean) => void;
}) {
  return (
    <View style={regretStyles.container}>
      <View style={regretStyles.header}>
        <Ionicons name="help-circle" size={18} color={colors.purple} />
        <Text style={regretStyles.title}>REGRET SIMULATOR</Text>
      </View>
      <Text style={regretStyles.question}>
        If this trade fails, will you regret breaking your rules to take it?
      </Text>
      <View style={regretStyles.buttons}>
        <TouchableOpacity
          onPress={async () => {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            onAnswer(true);
          }}
          style={[regretStyles.btn, regretStyles.yesBtn]}
          activeOpacity={0.8}
        >
          <Ionicons name="alert" size={16} color={colors.red} />
          <Text style={[regretStyles.btnText, { color: colors.red }]}>
            YES — I will regret it
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={async () => {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onAnswer(false);
          }}
          style={[regretStyles.btn, regretStyles.noBtn]}
          activeOpacity={0.8}
        >
          <Ionicons name="checkmark" size={16} color={colors.green} />
          <Text style={[regretStyles.btnText, { color: colors.green }]}>
            NO — I am at peace with this
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
const regretStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.purple + '11',
    borderWidth: 0.5,
    borderColor: colors.purple + '44',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.purple,
    letterSpacing: 1.5,
  },
  question: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  buttons: { gap: spacing.sm },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  yesBtn: {
    backgroundColor: colors.red + '11',
    borderColor: colors.red + '44',
  },
  noBtn: {
    backgroundColor: colors.green + '11',
    borderColor: colors.green + '44',
  },
  btnText: {
    fontFamily: font.mono,
    fontSize: 12,
    fontWeight: '700',
  },
});

// ── Severity config ───────────────────────────────────────────────────────────
const severityConfig = {
  warning: {
    color: colors.amber,
    icon: 'information-circle',
    bgColor: colors.amber + '11',
    borderColor: colors.amber + '44',
  },
  danger: {
    color: colors.red,
    icon: 'warning',
    bgColor: colors.red + '11',
    borderColor: colors.red + '44',
  },
  critical: {
    color: colors.red,
    icon: 'alert-circle',
    bgColor: colors.red + '18',
    borderColor: colors.red + '66',
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// ── MAIN INTERVENTION MODAL ───────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
interface InterventionModalProps {
  visible: boolean;
  intervention: InterventionResult;
  onProceed: () => void;
  onReview: () => void;
}

export function InterventionModal({
  visible,
  intervention,
  onProceed,
  onReview,
}: InterventionModalProps) {
  const [pauseComplete, setPauseComplete] = useState(false);
  const [regretAnswered, setRegretAnswered] = useState(false);
  const [willRegret, setWillRegret] = useState(false);
  const [showPause, setShowPause] = useState(false);
  const slideAnim = useRef(new Animated.Value(100)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  // ── Safe area insets ───────────────────────────────────────────────────
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) {
      setPauseComplete(intervention.pauseSeconds === 0);
      setRegretAnswered(false);
      setWillRegret(false);
      setShowPause(intervention.pauseSeconds > 0);

      if (intervention.severity === 'critical') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else if (intervention.severity === 'danger') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      slideAnim.setValue(100);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  const cfg = severityConfig[intervention.severity];

  const canProceed =
    pauseComplete &&
    (!intervention.showRegretSimulator ||
      (regretAnswered && !willRegret));

  const handleRegretAnswer = (answer: boolean) => {
    setRegretAnswered(true);
    setWillRegret(answer);
    if (answer) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
    >
      <View style={modalStyles.overlay}>
        <Animated.View
          style={[
            modalStyles.sheet,
            {
              transform: [{ translateY: slideAnim }],
              opacity: opacityAnim,
              // ✅ Safe area fix — pushes content above system nav bar
              paddingBottom: Math.max(insets.bottom, spacing.lg),
            },
          ]}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={{ flexGrow: 1 }}
          >
            {/* ── Header ────────────────────────────────────────────── */}
            <View
              style={[
                modalStyles.header,
                {
                  backgroundColor: cfg.bgColor,
                  borderBottomColor: cfg.borderColor,
                },
              ]}
            >
              <View
                style={[
                  modalStyles.iconBg,
                  { backgroundColor: cfg.color + '22' },
                ]}
              >
                <Ionicons
                  name={cfg.icon as any}
                  size={28}
                  color={cfg.color}
                />
              </View>
              <View style={modalStyles.headerText}>
                <Text style={[modalStyles.title, { color: cfg.color }]}>
                  {intervention.title}
                </Text>
                <Text style={modalStyles.message}>
                  {intervention.message}
                </Text>
              </View>
            </View>

            <View style={modalStyles.body}>
              {/* ── Warning Reasons ───────────────────────────────── */}
              <View style={modalStyles.reasonsCard}>
                <Text style={modalStyles.reasonsLabel}>
                  RISK FACTORS DETECTED
                </Text>
                {intervention.reasons.map((reason, i) => (
                  <View key={i} style={modalStyles.reasonRow}>
                    <View
                      style={[
                        modalStyles.reasonDot,
                        { backgroundColor: cfg.color },
                      ]}
                    />
                    <Text style={modalStyles.reasonText}>{reason}</Text>
                  </View>
                ))}
              </View>

              {/* ── Forced Pause Timer ────────────────────────────── */}
              {showPause && !pauseComplete && (
                <ForcedPauseTimer
                  seconds={intervention.pauseSeconds}
                  onComplete={() => {
                    setPauseComplete(true);
                    setShowPause(false);
                  }}
                  color={cfg.color}
                />
              )}

              {/* ── Regret Simulator ──────────────────────────────── */}
              {intervention.showRegretSimulator &&
                pauseComplete &&
                !regretAnswered && (
                  <RegretSimulator onAnswer={handleRegretAnswer} />
                )}

              {/* ── Regret Response — Will Regret ─────────────────── */}
              {regretAnswered && willRegret && (
                <View style={modalStyles.regretWarning}>
                  <Ionicons name="alert" size={16} color={colors.red} />
                  <Text style={modalStyles.regretWarningText}>
                    You said you would regret this trade. This is a strong
                    signal to step back. Review your rules before proceeding.
                  </Text>
                </View>
              )}

              {/* ── Regret Response — Won't Regret ────────────────── */}
              {regretAnswered && !willRegret && (
                <View style={modalStyles.regretOk}>
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color={colors.green}
                  />
                  <Text style={modalStyles.regretOkText}>
                    Good. You are at peace with the outcome either way. You
                    may proceed.
                  </Text>
                </View>
              )}

              {/* ── Action Buttons ────────────────────────────────── */}
              <View style={modalStyles.actions}>
                {/* Review Rules */}
                <TouchableOpacity
                  onPress={onReview}
                  style={modalStyles.reviewBtn}
                  activeOpacity={0.8}
                >
                  <Ionicons name="list" size={16} color={colors.text} />
                  <Text style={modalStyles.reviewBtnText}>
                    Review My Rules
                  </Text>
                </TouchableOpacity>

                {/* Proceed — enabled only when conditions met */}
                <TouchableOpacity
                  onPress={canProceed ? onProceed : undefined}
                  style={[
                    modalStyles.proceedBtn,
                    {
                      backgroundColor: canProceed
                        ? cfg.color + '22'
                        : colors.surface2,
                      borderColor: canProceed
                        ? cfg.color
                        : colors.border,
                      opacity: canProceed ? 1 : 0.5,
                    },
                  ]}
                  activeOpacity={canProceed ? 0.8 : 1}
                >
                  <Text
                    style={[
                      modalStyles.proceedBtnText,
                      { color: canProceed ? cfg.color : colors.muted },
                    ]}
                  >
                    {!pauseComplete
                      ? 'Wait for pause to complete...'
                      : intervention.showRegretSimulator && !regretAnswered
                      ? 'Answer the question above first'
                      : willRegret
                      ? 'You said you will regret this'
                      : 'Save Anyway — I Accept the Risk'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* ── Skip option ───────────────────────────────────── */}
              <TouchableOpacity
                onPress={onProceed}
                style={modalStyles.skipBtn}
                activeOpacity={0.7}
              >
                <Text style={modalStyles.skipText}>
                  Skip intervention and save
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: 0.5,
  },
  iconBg: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerText: { flex: 1 },
  title: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
    lineHeight: 22,
  },
  message: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.muted,
    lineHeight: 17,
  },
  body: { padding: spacing.lg },
  reasonsCard: {
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  reasonsLabel: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.muted,
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: 8,
  },
  reasonDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 5,
    flexShrink: 0,
  },
  reasonText: {
    flex: 1,
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.text,
    lineHeight: 17,
  },
  regretWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.red + '11',
    borderWidth: 0.5,
    borderColor: colors.red + '44',
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  regretWarningText: {
    flex: 1,
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.red,
    lineHeight: 17,
  },
  regretOk: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.green + '11',
    borderWidth: 0.5,
    borderColor: colors.green + '44',
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  regretOkText: {
    flex: 1,
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.green,
    lineHeight: 17,
  },
  actions: { gap: spacing.sm, marginBottom: spacing.sm },
  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border2,
    borderRadius: radius.md,
    paddingVertical: 13,
  },
  reviewBtnText: {
    fontFamily: font.mono,
    fontSize: 13,
    color: colors.text,
    fontWeight: '700',
  },
  proceedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: spacing.md,
  },
  proceedBtnText: {
    fontFamily: font.mono,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  skipText: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.muted,
    textDecorationLine: 'underline',
  },
});