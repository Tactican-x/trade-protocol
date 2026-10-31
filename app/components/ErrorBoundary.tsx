import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { colors, font, spacing, radius } from '../theme';

interface State {
  hasError: boolean;
  error: Error | null;
}

interface Props {
  children: React.ReactNode;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.iconBg}>
              <Text style={styles.icon}>⚠️</Text>
            </View>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.subtitle}>
              An unexpected error occurred. Your trade data is safe.
            </Text>
            {this.state.error && (
              <View style={styles.errorCard}>
                <Text style={styles.errorLabel}>ERROR DETAILS</Text>
                <Text style={styles.errorText}>
                  {this.state.error.message}
                </Text>
              </View>
            )}
            <TouchableOpacity
              onPress={this.handleReset}
              style={styles.retryBtn}
              activeOpacity={0.8}
            >
              <Text style={styles.retryBtnText}>Try Again</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  iconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.red + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  icon: { fontSize: 36 },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: spacing.lg,
  },
  errorCard: {
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.red + '44',
    borderRadius: radius.lg,
    padding: spacing.md,
    width: '100%',
    marginBottom: spacing.lg,
  },
  errorLabel: {
    fontFamily: font.mono,
    fontSize: 8,
    color: colors.red,
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
  },
  errorText: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.muted,
    lineHeight: 17,
  },
  retryBtn: {
    backgroundColor: colors.green,
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
  },
  retryBtnText: {
    fontFamily: font.mono,
    fontSize: 14,
    fontWeight: '800',
    color: colors.bg,
  },
});