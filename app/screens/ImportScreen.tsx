import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { File } from 'expo-file-system';
import {
  parseMT4File,
  convertDealsToTrades,
  buildImportPreview,
  ImportPreview,
} from '../store/mt4parser';
import {
  loadTrades,
  saveTrades,
  importTrades,
  Trade,
} from '../store/trades';
import { colors, font, spacing, radius } from '../theme';
import { Toast } from '../components/UI';
import { useAppContext } from '../context/AppContext';

// ─────────────────────────────────────────────────────────────────────────────
// Section Divider
// ─────────────────────────────────────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <View style={divStyles.row}>
      <View style={divStyles.line} />
      <Text style={divStyles.label}>{label}</Text>
      <View style={divStyles.line} />
    </View>
  );
}
const divStyles = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.md },
  line:  { flex: 1, height: 0.5, backgroundColor: colors.border },
  label: { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5, marginHorizontal: spacing.sm },
});

// ─────────────────────────────────────────────────────────────────────────────
// Restore Backup Card — uses File API (no corruption)
// ─────────────────────────────────────────────────────────────────────────────

type RestoreStep = 'idle' | 'paste' | 'loading' | 'preview' | 'success' | 'error';

function RestoreBackupCard({ onRestoreComplete }: { onRestoreComplete: () => void }) {
  const [restoreStep, setRestoreStep]   = useState<RestoreStep>('idle');
  const [pastedJson, setPastedJson]     = useState('');
  const [previewCount, setPreviewCount] = useState(0);
  const [newCount, setNewCount]         = useState(0);
  const [errorMsg, setErrorMsg]         = useState('');
  const [jsonString, setJsonString]     = useState('');
  const [expanded, setExpanded]         = useState(false);

  // ── Pick JSON file using File API ──────────────────────────────────────
  const handlePickJsonFile = async () => {
    try {
      setRestoreStep('loading');

      const result = await DocumentPicker.getDocumentAsync({
        type:                 '*/*',
        copyToCacheDirectory: true,
        multiple:             false,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        setRestoreStep('idle');
        return;
      }

      const asset = result.assets[0];

      // ✅ Use expo-file-system File API (same as rest of the app)
      const file = new File(asset.uri);
      if (!file.exists) throw new Error('File not found after picking.');

      const content = file.text();
      if (!content || content.trim().length === 0) {
        throw new Error('The selected file is empty.');
      }

      await handlePreview(content);
    } catch (e: any) {
      setRestoreStep('error');
      setErrorMsg(e.message ?? 'Failed to read file.');
    }
  };

  // ── Preview / validate the JSON ────────────────────────────────────────
  const handlePreview = async (json: string) => {
    try {
      setRestoreStep('loading');
      setJsonString(json);

      // Clean BOM and garbage before parsing
      const cleaned = json
        .trim()
        .replace(/^\uFEFF/, '')
        .replace(/^[^\[{]+/, '')
        .replace(/[^\]}\s]+$/, '')
        .trim();

      if (!cleaned) {
        setRestoreStep('error');
        setErrorMsg('Backup file is empty or unreadable.');
        return;
      }

      if (!cleaned.startsWith('[')) {
        setRestoreStep('error');
        setErrorMsg(
          'This does not look like a Trade Protocol backup file. Make sure you selected the correct .json file.'
        );
        return;
      }

      let parsed: any[];
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        setRestoreStep('error');
        setErrorMsg(
          'Backup file is corrupted or was modified. Try exporting again from the Reset Journey screen.'
        );
        return;
      }

      if (!Array.isArray(parsed)) {
        setRestoreStep('error');
        setErrorMsg('Invalid backup — expected an array of trades.');
        return;
      }

      if (parsed.length === 0) {
        setRestoreStep('error');
        setErrorMsg('Backup file contains no trades.');
        return;
      }

      // Validate first trade
      const first = parsed[0];
      if (!first.id || !first.pair) {
        setRestoreStep('error');
        setErrorMsg('Backup file format is invalid — missing required fields.');
        return;
      }

      const existing    = await loadTrades();
      const existingIds = new Set(existing.map((t) => t.id));
      const newTrades   = parsed.filter((t: any) => !existingIds.has(t.id));

      setPreviewCount(parsed.length);
      setNewCount(newTrades.length);
      setJsonString(cleaned); // store cleaned version
      setRestoreStep('preview');
    } catch (e: any) {
      setRestoreStep('error');
      setErrorMsg(e.message ?? 'Could not process backup file.');
    }
  };

  // ── Execute restore ────────────────────────────────────────────────────
  const handleRestore = async () => {
    try {
      setRestoreStep('loading');
      await importTrades(jsonString);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRestoreStep('success');
      onRestoreComplete();
    } catch (e: any) {
      setRestoreStep('error');
      setErrorMsg(e.message ?? 'Restore failed.');
    }
  };

  const handleReset = () => {
    setRestoreStep('idle');
    setPastedJson('');
    setPreviewCount(0);
    setNewCount(0);
    setErrorMsg('');
    setJsonString('');
  };

  // ── Collapsed ──────────────────────────────────────────────────────────
  if (!expanded && restoreStep === 'idle') {
    return (
      <TouchableOpacity
        onPress={() => setExpanded(true)}
        style={rbStyles.collapsedCard}
        activeOpacity={0.8}
      >
        <View style={rbStyles.collapsedLeft}>
          <View style={rbStyles.collapsedIcon}>
            <Ionicons name="cloud-download-outline" size={20} color={colors.green} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={rbStyles.collapsedTitle}>Restore JSON Backup</Text>
            <Text style={rbStyles.collapsedDesc}>
              Restoring after a journey reset? Import here.
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-down" size={16} color={colors.muted} />
      </TouchableOpacity>
    );
  }

  // ── Success ────────────────────────────────────────────────────────────
  if (restoreStep === 'success') {
    return (
      <View style={rbStyles.card}>
        <View style={rbStyles.successRow}>
          <View style={[rbStyles.iconBg, { backgroundColor: colors.green + '18' }]}>
            <Ionicons name="checkmark-circle" size={28} color={colors.green} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={rbStyles.successTitle}>
              {newCount} trade{newCount !== 1 ? 's' : ''} restored ✓
            </Text>
            <Text style={rbStyles.successDesc}>
              Your backup has been successfully imported.
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={handleReset} style={rbStyles.resetBtn} activeOpacity={0.7}>
          <Text style={rbStyles.resetBtnText}>Import Another Backup</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────
  if (restoreStep === 'error') {
    return (
      <View style={rbStyles.card}>
        <View style={rbStyles.errorRow}>
          <Ionicons name="alert-circle" size={20} color={colors.red} />
          <Text style={rbStyles.errorText}>{errorMsg}</Text>
        </View>
        <TouchableOpacity onPress={handleReset} style={rbStyles.resetBtn} activeOpacity={0.7}>
          <Text style={rbStyles.resetBtnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────
  if (restoreStep === 'loading') {
    return (
      <View style={rbStyles.card}>
        <View style={rbStyles.loadingRow}>
          <ActivityIndicator size="small" color={colors.green} />
          <Text style={rbStyles.loadingText}>Processing backup...</Text>
        </View>
      </View>
    );
  }

  // ── Preview ────────────────────────────────────────────────────────────
  if (restoreStep === 'preview') {
    return (
      <View style={rbStyles.card}>
        <View style={rbStyles.previewHeader}>
          <View style={[rbStyles.iconBg, { backgroundColor: colors.green + '18' }]}>
            <Ionicons name="checkmark-circle" size={24} color={colors.green} />
          </View>
          <Text style={rbStyles.previewTitle}>Backup Validated</Text>
        </View>

        <View style={rbStyles.previewStats}>
          <View style={rbStyles.previewStat}>
            <Text style={[rbStyles.previewStatValue, { color: colors.blue }]}>{previewCount}</Text>
            <Text style={rbStyles.previewStatLabel}>IN BACKUP</Text>
          </View>
          <View style={rbStyles.previewStatDivider} />
          <View style={rbStyles.previewStat}>
            <Text style={[rbStyles.previewStatValue, { color: colors.green }]}>{newCount}</Text>
            <Text style={rbStyles.previewStatLabel}>NEW TRADES</Text>
          </View>
          <View style={rbStyles.previewStatDivider} />
          <View style={rbStyles.previewStat}>
            <Text style={[rbStyles.previewStatValue, { color: colors.muted }]}>
              {previewCount - newCount}
            </Text>
            <Text style={rbStyles.previewStatLabel}>EXIST</Text>
          </View>
        </View>

        {previewCount - newCount > 0 && (
          <View style={rbStyles.duplicateNote}>
            <Ionicons name="information-circle-outline" size={12} color={colors.amber} />
            <Text style={rbStyles.duplicateNoteText}>
              {previewCount - newCount} trade{previewCount - newCount !== 1 ? 's' : ''} already exist and will be skipped.
            </Text>
          </View>
        )}

        {newCount === 0 && (
          <View style={[rbStyles.duplicateNote, { backgroundColor: colors.amber + '11', borderColor: colors.amber + '44' }]}>
            <Ionicons name="warning-outline" size={12} color={colors.amber} />
            <Text style={[rbStyles.duplicateNoteText, { color: colors.amber }]}>
              All trades already exist. Nothing new to restore.
            </Text>
          </View>
        )}

        {newCount > 0 && (
          <TouchableOpacity
            onPress={handleRestore}
            style={rbStyles.restoreBtn}
            activeOpacity={0.8}
          >
            <Ionicons name="cloud-download" size={16} color={colors.bg} />
            <Text style={rbStyles.restoreBtnText}>
              Restore {newCount} Trade{newCount !== 1 ? 's' : ''}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={handleReset} style={rbStyles.resetBtn} activeOpacity={0.7}>
          <Text style={rbStyles.resetBtnText}>
            {newCount === 0 ? 'Go Back' : 'Cancel'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Expanded: Pick method ──────────────────────────────────────────────
  return (
    <View style={rbStyles.card}>
      {/* Header */}
      <View style={rbStyles.cardHeader}>
        <View style={rbStyles.iconBg}>
          <Ionicons name="cloud-download-outline" size={20} color={colors.green} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={rbStyles.cardTitle}>Restore JSON Backup</Text>
          <Text style={rbStyles.cardDesc}>
            Import trades from a backup exported during journey reset
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => { setExpanded(false); handleReset(); }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-up" size={16} color={colors.muted} />
        </TouchableOpacity>
      </View>

      {/* Safety note */}
      <View style={rbStyles.safetyNote}>
        <Ionicons name="shield-checkmark" size={12} color={colors.green} />
        <Text style={rbStyles.safetyText}>
          Non-destructive — only adds trades that don't already exist.
        </Text>
      </View>

      {/* Method 1 — Pick file (recommended) */}
      <TouchableOpacity
        onPress={handlePickJsonFile}
        style={rbStyles.methodBtn}
        activeOpacity={0.8}
      >
        <View style={[rbStyles.methodIcon, { backgroundColor: colors.blue + '18' }]}>
          <Ionicons name="folder-open" size={18} color={colors.blue} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={rbStyles.methodTitle}>Pick JSON File</Text>
          <Text style={rbStyles.methodDesc}>
            Browse and select the .json backup file (recommended)
          </Text>
        </View>
        <View style={rbStyles.recommendedBadge}>
          <Text style={rbStyles.recommendedText}>BEST</Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color={colors.muted} />
      </TouchableOpacity>

      {/* Method 2 — Paste JSON (fallback) */}
      <TouchableOpacity
        onPress={() => setRestoreStep('paste')}
        style={rbStyles.methodBtn}
        activeOpacity={0.8}
      >
        <View style={[rbStyles.methodIcon, { backgroundColor: colors.purple + '18' }]}>
          <Ionicons name="clipboard-outline" size={18} color={colors.purple} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={rbStyles.methodTitle}>Paste JSON</Text>
          <Text style={rbStyles.methodDesc}>
            Copy and paste the backup content directly (may be unreliable)
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color={colors.muted} />
      </TouchableOpacity>

      {/* Paste input — inline when paste selected */}
      {restoreStep === 'paste' && (
        <>
          <View style={rbStyles.pasteWarning}>
            <Ionicons name="warning-outline" size={12} color={colors.amber} />
            <Text style={rbStyles.pasteWarningText}>
              Paste may corrupt data if copied from WhatsApp or SMS. Use "Pick JSON File" if possible.
            </Text>
          </View>
          <TextInput
            value={pastedJson}
            onChangeText={setPastedJson}
            placeholder={'[\n  { "id": 123, "pair": "XAUUSD", ... }\n]'}
            placeholderTextColor={colors.muted}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            style={rbStyles.pasteInput}
          />
          <View style={rbStyles.pasteActions}>
            <TouchableOpacity
              onPress={() => pastedJson.trim() ? handlePreview(pastedJson) : null}
              style={[rbStyles.restoreBtn, !pastedJson.trim() && { opacity: 0.4 }]}
              activeOpacity={pastedJson.trim() ? 0.8 : 1}
            >
              <Ionicons name="eye" size={14} color={colors.bg} />
              <Text style={rbStyles.restoreBtnText}>Preview</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setPastedJson(''); setRestoreStep('idle'); }}
              style={rbStyles.clearBtn}
              activeOpacity={0.7}
            >
              <Text style={rbStyles.clearBtnText}>Clear</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const rbStyles = StyleSheet.create({
  collapsedCard: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.green + '44',
    borderRadius:    radius.lg,
    padding:         spacing.md,
    marginBottom:    spacing.md,
  },
  collapsedLeft: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.md,
    flex:          1,
  },
  collapsedIcon: {
    width:           40,
    height:          40,
    borderRadius:    12,
    backgroundColor: colors.green + '18',
    alignItems:      'center',
    justifyContent:  'center',
  },
  collapsedTitle: {
    color:        colors.text,
    fontSize:     13,
    fontWeight:   '700',
    marginBottom: 2,
  },
  collapsedDesc: {
    fontFamily: font.mono,
    fontSize:   10,
    color:      colors.muted,
  },

  card: {
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.green + '44',
    borderRadius:    radius.lg,
    padding:         spacing.md,
    marginBottom:    spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
    marginBottom:  spacing.sm,
  },
  iconBg: {
    width:           36,
    height:          36,
    borderRadius:    10,
    backgroundColor: colors.green + '18',
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  cardTitle: {
    color:        colors.text,
    fontSize:     13,
    fontWeight:   '700',
    marginBottom: 2,
  },
  cardDesc: {
    fontFamily: font.mono,
    fontSize:   10,
    color:      colors.muted,
    lineHeight: 14,
  },

  safetyNote: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             spacing.xs,
    backgroundColor: colors.green + '11',
    borderRadius:    radius.sm,
    padding:         spacing.sm,
    marginBottom:    spacing.sm,
  },
  safetyText: {
    fontFamily: font.mono,
    fontSize:   9,
    color:      colors.green,
    flex:       1,
  },

  methodBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             spacing.sm,
    backgroundColor: colors.surface2,
    borderRadius:    radius.md,
    padding:         spacing.sm,
    marginBottom:    spacing.xs,
  },
  methodIcon: {
    width:          34,
    height:         34,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  methodTitle: {
    color:        colors.text,
    fontSize:     12,
    fontWeight:   '700',
    marginBottom: 1,
  },
  methodDesc: {
    fontFamily: font.mono,
    fontSize:   9,
    color:      colors.muted,
  },

  // Recommended badge
  recommendedBadge: {
    backgroundColor:   colors.green + '22',
    borderRadius:      radius.pill,
    paddingHorizontal: 6,
    paddingVertical:   2,
    marginRight:       4,
  },
  recommendedText: {
    fontFamily: font.mono,
    fontSize:   8,
    fontWeight: '800',
    color:      colors.green,
  },

  // Paste warning
  pasteWarning: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    gap:             spacing.xs,
    backgroundColor: colors.amber + '11',
    borderWidth:     0.5,
    borderColor:     colors.amber + '33',
    borderRadius:    radius.sm,
    padding:         spacing.sm,
    marginTop:       spacing.sm,
    marginBottom:    spacing.xs,
  },
  pasteWarningText: {
    flex:       1,
    fontFamily: font.mono,
    fontSize:   9,
    color:      colors.amber,
    lineHeight: 14,
  },

  pasteInput: {
    backgroundColor:   colors.surface2,
    borderWidth:       0.5,
    borderColor:       colors.border,
    borderRadius:      radius.md,
    padding:           spacing.md,
    fontFamily:        font.mono,
    fontSize:          10,
    color:             colors.text,
    minHeight:         120,
    textAlignVertical: 'top',
    marginTop:         spacing.sm,
    marginBottom:      spacing.sm,
    lineHeight:        16,
  },
  pasteActions: {
    flexDirection: 'row',
    gap:           spacing.sm,
  },

  restoreBtn: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             spacing.xs,
    backgroundColor: colors.green,
    borderRadius:    radius.md,
    paddingVertical: 11,
  },
  restoreBtnText: {
    fontFamily: font.mono,
    fontSize:   12,
    fontWeight: '800',
    color:      colors.bg,
  },

  clearBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical:   11,
    borderRadius:      radius.md,
    borderWidth:       0.5,
    borderColor:       colors.border,
    backgroundColor:   colors.surface2,
    alignItems:        'center',
    justifyContent:    'center',
  },
  clearBtnText: {
    fontFamily: font.mono,
    fontSize:   12,
    color:      colors.muted,
  },
  resetBtn: {
    paddingVertical: 10,
    alignItems:      'center',
    marginTop:       spacing.xs,
  },
  resetBtnText: {
    fontFamily: font.mono,
    fontSize:   11,
    color:      colors.muted,
  },

  previewHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
    marginBottom:  spacing.md,
  },
  previewTitle: {
    color:      colors.text,
    fontSize:   15,
    fontWeight: '700',
  },
  previewStats: {
    flexDirection:   'row',
    backgroundColor: colors.surface2,
    borderRadius:    radius.sm,
    padding:         spacing.md,
    marginBottom:    spacing.sm,
  },
  previewStat:          { flex: 1, alignItems: 'center' },
  previewStatValue:     { fontFamily: font.mono, fontSize: 20, fontWeight: '800', marginBottom: 3 },
  previewStatLabel:     { fontFamily: font.mono, fontSize: 8, color: colors.muted, letterSpacing: 1 },
  previewStatDivider:   { width: 0.5, backgroundColor: colors.border, alignSelf: 'stretch', marginHorizontal: spacing.sm },
  duplicateNote: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    gap:             spacing.xs,
    backgroundColor: colors.amber + '11',
    borderWidth:     0.5,
    borderColor:     colors.amber + '33',
    borderRadius:    radius.sm,
    padding:         spacing.sm,
    marginBottom:    spacing.sm,
  },
  duplicateNoteText: {
    flex:       1,
    fontFamily: font.mono,
    fontSize:   9,
    color:      colors.amber,
    lineHeight: 14,
  },

  successRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
    marginBottom:  spacing.sm,
  },
  successTitle: {
    color:        colors.green,
    fontSize:     14,
    fontWeight:   '800',
    marginBottom: 2,
  },
  successDesc: {
    fontFamily: font.mono,
    fontSize:   10,
    color:      colors.muted,
  },

  errorRow: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    gap:             spacing.sm,
    backgroundColor: colors.red + '11',
    borderRadius:    radius.sm,
    padding:         spacing.sm,
    marginBottom:    spacing.sm,
  },
  errorText: {
    flex:       1,
    fontFamily: font.mono,
    fontSize:   11,
    color:      colors.red,
    lineHeight: 16,
  },

  loadingRow: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             spacing.sm,
    paddingVertical: spacing.md,
  },
  loadingText: {
    fontFamily: font.mono,
    fontSize:   12,
    color:      colors.muted,
  },
});

// ── Step Indicator ────────────────────────────────────────────────────────────
function StepBadge({ step, current, label }: { step: number; current: number; label: string }) {
  const done   = current > step;
  const active = current === step;
  return (
    <View style={stepStyles.container}>
      <View style={[
        stepStyles.circle,
        done   && { backgroundColor: colors.green, borderColor: colors.green },
        active && { borderColor: colors.amber },
      ]}>
        {done ? (
          <Ionicons name="checkmark" size={12} color={colors.bg} />
        ) : (
          <Text style={[stepStyles.num, active && { color: colors.amber }]}>{step}</Text>
        )}
      </View>
      <Text style={[
        stepStyles.label,
        active && { color: colors.text },
        done   && { color: colors.green },
      ]}>
        {label}
      </Text>
    </View>
  );
}
const stepStyles = StyleSheet.create({
  container: { alignItems: 'center', gap: 4 },
  circle: {
    width:           28,
    height:          28,
    borderRadius:    14,
    borderWidth:     1.5,
    borderColor:     colors.border,
    backgroundColor: colors.surface2,
    alignItems:      'center',
    justifyContent:  'center',
  },
  num:   { fontFamily: font.mono, fontSize: 11, color: colors.muted, fontWeight: '700' },
  label: { fontFamily: font.mono, fontSize: 8, color: colors.muted, letterSpacing: 0.5 },
});

// ── Stat Box ──────────────────────────────────────────────────────────────────
function StatBox({ value, label, color }: { value: string | number; label: string; color: string }) {
  return (
    <View style={sbStyles.box}>
      <Text style={[sbStyles.value, { color }]}>{value}</Text>
      <Text style={sbStyles.label}>{label}</Text>
    </View>
  );
}
const sbStyles = StyleSheet.create({
  box: {
    flex:            1,
    backgroundColor: colors.surface2,
    borderRadius:    radius.sm,
    padding:         spacing.sm,
    alignItems:      'center',
  },
  value: { fontFamily: font.mono, fontSize: 20, fontWeight: '800', marginBottom: 2 },
  label: { fontFamily: font.mono, fontSize: 8, color: colors.muted, letterSpacing: 1 },
});

// ══════════════════════════════════════════════════════════════════════════════
// MAIN IMPORT SCREEN
// ══════════════════════════════════════════════════════════════════════════════

export default function ImportScreen() {
  const { accent } = useAppContext();
  const router     = useRouter();

  const [step, setStep]                  = useState(1);
  const [loading, setLoading]            = useState(false);
  const [fileName, setFileName]          = useState('');
  const [fileFormat, setFileFormat]      = useState('');
  const [preview, setPreview]            = useState<ImportPreview | null>(null);
  const [pendingTrades, setPendingTrades] = useState<Partial<Trade>[]>([]);
  const [toastMsg, setToastMsg]          = useState('');
  const [toastVisible, setToastVisible]  = useState(false);
  const [parseErrors, setParseErrors]    = useState<string[]>([]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(false);
    setTimeout(() => setToastVisible(true), 50);
  };

  // ── Step 1: Pick MT4/MT5 file ─────────────────────────────────────────
  const handlePickFile = async () => {
    try {
      setLoading(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const result = await DocumentPicker.getDocumentAsync({
        type:                 ['text/csv', 'text/html', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        setLoading(false);
        return;
      }

      const asset = result.assets[0];
      setFileName(asset.name ?? 'Unknown file');

      // ✅ Use File API first, fall back to fetch for non-local URIs
      let content: string;
      try {
        const file = new File(asset.uri);
        if (file.exists) {
          content = file.text();
        } else {
          const response = await fetch(asset.uri);
          content = await response.text();
        }
      } catch {
        const response = await fetch(asset.uri);
        content = await response.text();
      }

      if (!content || content.trim().length === 0) {
        Alert.alert('Empty File', 'The selected file appears to be empty.');
        setLoading(false);
        return;
      }

      const parseResult = parseMT4File(content);
      setFileFormat(parseResult.format.toUpperCase());
      setParseErrors(parseResult.errors);

      if (parseResult.deals.length === 0) {
        Alert.alert(
          'No Trades Found',
          parseResult.errors.join('\n') ||
            'Could not find any trades in this file. Please check the format.',
          [{ text: 'OK' }]
        );
        setLoading(false);
        return;
      }

      const existing    = await loadTrades();
      const existingIds = new Set(existing.map((t) => t.id));
      const { trades, skipped } = convertDealsToTrades(parseResult.deals, existingIds);

      if (trades.length === 0) {
        Alert.alert(
          'All Trades Already Imported',
          `Found ${parseResult.deals.length} trades but all ${skipped} are already in your journal.`
        );
        setLoading(false);
        return;
      }

      const prev = buildImportPreview(trades);
      setPreview(prev);
      setPendingTrades(trades);

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep(2);
    } catch (e: any) {
      Alert.alert('Import Error', e.message ?? 'Failed to read the file.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2 → 3: Confirm import ────────────────────────────────────────
  const handleConfirmImport = async () => {
    if (!preview || pendingTrades.length === 0) return;

    try {
      setLoading(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const existing = await loadTrades();
      const merged   = [...(pendingTrades as Trade[]), ...existing].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      await saveTrades(merged);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep(3);
    } catch (e: any) {
      Alert.alert('Save Error', e.message ?? 'Failed to save trades.');
    } finally {
      setLoading(false);
    }
  };

  // ── Reset MT4 flow ────────────────────────────────────────────────────
  const handleReset = () => {
    setStep(1);
    setFileName('');
    setFileFormat('');
    setPreview(null);
    setPendingTrades([]);
    setParseErrors([]);
  };

  const pnlColor =
    (preview?.totalPnl ?? 0) > 0 ? colors.green :
    (preview?.totalPnl ?? 0) < 0 ? colors.red   :
    colors.muted;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Import Trades' }} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <View style={styles.headerCard}>
          <View style={styles.headerIcon}>
            <Ionicons name="download" size={28} color={accent} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Import Trades</Text>
            <Text style={styles.headerSub}>
              Restore a backup or import from MT4/MT5
            </Text>
          </View>
        </View>

        {/* ── Restore JSON Backup ──────────────────────────────────────── */}
        <RestoreBackupCard
          onRestoreComplete={() => showToast('✓ Backup restored successfully')}
        />

        {/* ── Divider ──────────────────────────────────────────────────── */}
        <SectionDivider label="IMPORT FROM MT4 / MT5" />

        {/* ── Step Indicators ─────────────────────────────────────────── */}
        <View style={styles.stepsRow}>
          <StepBadge step={1} current={step} label="SELECT" />
          <View style={styles.stepLine} />
          <StepBadge step={2} current={step} label="PREVIEW" />
          <View style={styles.stepLine} />
          <StepBadge step={3} current={step} label="DONE" />
        </View>

        {/* ════════════════════════════════════════════════════════════ */}
        {/* STEP 1 — Instructions + File Picker                         */}
        {/* ════════════════════════════════════════════════════════════ */}
        {step === 1 && (
          <>
            <View style={styles.instructCard}>
              <View style={styles.instructHeader}>
                <Ionicons name="information-circle" size={16} color={colors.blue} />
                <Text style={styles.instructTitle}>HOW TO EXPORT FROM MT4/MT5</Text>
              </View>

              <Text style={styles.instructSubtitle}>On your PC/Mac:</Text>

              {[
                { step: '1', text: 'Open MT4 or MT5 on your computer' },
                { step: '2', text: 'Go to "View" → "Terminal" (Ctrl+T)' },
                { step: '3', text: 'Click the "Account History" tab' },
                { step: '4', text: 'Right-click anywhere in the history' },
                { step: '5', text: 'Choose "Save as Report" or "Save as Detailed Report"' },
                { step: '6', text: 'Save as HTML or CSV format' },
                { step: '7', text: 'Send the file to your phone (WhatsApp, email, Google Drive)' },
                { step: '8', text: 'Come back here and tap "Select File" below' },
              ].map((item) => (
                <View key={item.step} style={styles.instructRow}>
                  <View style={[styles.instructNum, { backgroundColor: accent + '22', borderColor: accent + '55' }]}>
                    <Text style={[styles.instructNumText, { color: accent }]}>{item.step}</Text>
                  </View>
                  <Text style={styles.instructText}>{item.text}</Text>
                </View>
              ))}
            </View>

            <View style={styles.formatsCard}>
              <Text style={styles.formatsTitle}>SUPPORTED FORMATS</Text>
              <View style={styles.formatsRow}>
                {[
                  { label: '.HTM',  desc: 'MT4 HTML Report', color: colors.blue   },
                  { label: '.HTML', desc: 'MT5 Statement',   color: colors.purple },
                  { label: '.CSV',  desc: 'Spreadsheet',     color: colors.green  },
                  { label: '.TXT',  desc: 'Text Export',     color: colors.amber  },
                ].map((f) => (
                  <View
                    key={f.label}
                    style={[styles.formatBadge, { backgroundColor: f.color + '18', borderColor: f.color + '44' }]}
                  >
                    <Text style={[styles.formatLabel, { color: f.color }]}>{f.label}</Text>
                    <Text style={styles.formatDesc}>{f.desc}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.whatCard}>
              <Text style={styles.whatTitle}>WHAT GETS IMPORTED</Text>
              {[
                { icon: 'checkmark-circle', text: 'Pair, direction (BUY/SELL)',                        color: colors.green },
                { icon: 'checkmark-circle', text: 'Entry price, lot size, SL, TP',                     color: colors.green },
                { icon: 'checkmark-circle', text: 'Profit/Loss amount',                                color: colors.green },
                { icon: 'checkmark-circle', text: 'Open and close time/date',                          color: colors.green },
                { icon: 'checkmark-circle', text: 'Session auto-detected from time',                   color: colors.green },
                { icon: 'alert-circle',     text: 'Discipline scores start at 0% (fill in manually)', color: colors.amber },
                { icon: 'alert-circle',     text: 'Strategy defaults to Price Action (edit later)',    color: colors.amber },
              ].map((item, i) => (
                <View key={i} style={styles.whatRow}>
                  <Ionicons name={item.icon as any} size={14} color={item.color} />
                  <Text style={styles.whatText}>{item.text}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              onPress={handlePickFile}
              disabled={loading}
              style={[styles.pickBtn, { backgroundColor: accent }]}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={colors.bg} size="small" />
              ) : (
                <Ionicons name="folder-open" size={22} color={colors.bg} />
              )}
              <Text style={styles.pickBtnText}>
                {loading ? 'Reading file...' : 'Select MT4/MT5 File'}
              </Text>
            </TouchableOpacity>

            <Text style={styles.tipText}>
              💡 Tip: Select "All files" or "Documents" in the file picker if you cannot see your file.
            </Text>
          </>
        )}

        {/* ════════════════════════════════════════════════════════════ */}
        {/* STEP 2 — Preview                                            */}
        {/* ════════════════════════════════════════════════════════════ */}
        {step === 2 && preview && (
          <>
            <View style={styles.fileInfoCard}>
              <View style={styles.fileInfoRow}>
                <Ionicons name="document" size={20} color={accent} />
                <View style={styles.fileInfoText}>
                  <Text style={styles.fileInfoName}>{fileName}</Text>
                  <Text style={styles.fileInfoMeta}>
                    Format: {fileFormat} · {preview.total} trades found
                  </Text>
                </View>
                <View style={[styles.fileFormatBadge, { backgroundColor: accent + '22', borderColor: accent + '55' }]}>
                  <Text style={[styles.fileFormatText, { color: accent }]}>{fileFormat}</Text>
                </View>
              </View>
            </View>

            {parseErrors.length > 0 && (
              <View style={styles.warningCard}>
                <Ionicons name="warning" size={16} color={colors.amber} />
                <View style={styles.warningText}>
                  {parseErrors.map((e, i) => (
                    <Text key={i} style={styles.warningLine}>{e}</Text>
                  ))}
                </View>
              </View>
            )}

            {preview.dateRange && (
              <View style={styles.dateRangeCard}>
                <Ionicons name="calendar" size={14} color={colors.muted} />
                <Text style={styles.dateRangeText}>
                  {preview.dateRange.from} → {preview.dateRange.to}
                </Text>
              </View>
            )}

            <View style={styles.previewStatsRow}>
              <StatBox value={preview.total}  label="TRADES"  color={colors.blue}  />
              <View style={{ width: spacing.xs }} />
              <StatBox value={preview.wins}   label="WINS"    color={colors.green} />
              <View style={{ width: spacing.xs }} />
              <StatBox value={preview.losses} label="LOSSES"  color={colors.red}   />
              <View style={{ width: spacing.xs }} />
              <StatBox
                value={preview.totalPnl >= 0
                  ? `+$${preview.totalPnl.toFixed(0)}`
                  : `-$${Math.abs(preview.totalPnl).toFixed(0)}`}
                label="P&L"
                color={pnlColor}
              />
            </View>

            {preview.pairs.length > 0 && (
              <View style={styles.pairsCard}>
                <Text style={styles.pairsTitle}>PAIRS FOUND</Text>
                <View style={styles.pairsRow}>
                  {preview.pairs.slice(0, 12).map((p) => (
                    <View key={p} style={[styles.pairBadge, { backgroundColor: accent + '18', borderColor: accent + '44' }]}>
                      <Text style={[styles.pairText, { color: accent }]}>{p}</Text>
                    </View>
                  ))}
                  {preview.pairs.length > 12 && (
                    <View style={styles.pairBadge}>
                      <Text style={styles.pairText}>+{preview.pairs.length - 12} more</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            <View style={styles.tradePreviewCard}>
              <Text style={styles.tradePreviewTitle}>TRADE PREVIEW (first 5)</Text>
              {preview.trades.slice(0, 5).map((t, i) => {
                const tpnlColor = (t.pnl ?? 0) > 0 ? colors.green : (t.pnl ?? 0) < 0 ? colors.red : colors.muted;
                const resColor  = t.result === 'win' ? colors.green : t.result === 'loss' ? colors.red : colors.amber;
                return (
                  <View key={i} style={styles.tradePreviewRow}>
                    <View style={[styles.tradePreviewDot, { backgroundColor: resColor }]} />
                    <View style={styles.tradePreviewInfo}>
                      <Text style={styles.tradePreviewPair}>{t.pair} {t.dir}</Text>
                      <Text style={styles.tradePreviewMeta}>
                        {t.dateStr} · {t.session} · {t.lot} lots
                      </Text>
                    </View>
                    <Text style={[styles.tradePreviewPnl, { color: tpnlColor }]}>
                      {(t.pnl ?? 0) >= 0 ? '+' : ''}${(t.pnl ?? 0).toFixed(2)}
                    </Text>
                  </View>
                );
              })}
              {preview.total > 5 && (
                <Text style={styles.moreTradesText}>
                  + {preview.total - 5} more trades will be imported
                </Text>
              )}
            </View>

            <View style={styles.noteCard}>
              <Ionicons name="bulb" size={14} color={colors.amber} />
              <Text style={styles.noteText}>
                After import, open each trade to fill in your discipline checklist, strategy, and journal notes. Discipline scores start at 0%.
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleConfirmImport}
              disabled={loading}
              style={[styles.importBtn, { backgroundColor: accent }]}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={colors.bg} size="small" />
              ) : (
                <Ionicons name="download" size={20} color={colors.bg} />
              )}
              <Text style={styles.importBtnText}>
                {loading ? 'Importing...' : `Import ${preview.total} Trade${preview.total !== 1 ? 's' : ''}`}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleReset} style={styles.cancelBtn} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>Choose Different File</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ════════════════════════════════════════════════════════════ */}
        {/* STEP 3 — Success                                            */}
        {/* ════════════════════════════════════════════════════════════ */}
        {step === 3 && preview && (
          <View style={styles.successBlock}>
            <View style={[styles.successIcon, { backgroundColor: colors.green + '18' }]}>
              <Ionicons name="checkmark-circle" size={64} color={colors.green} />
            </View>

            <Text style={styles.successTitle}>Import Complete!</Text>
            <Text style={styles.successSubtitle}>
              {preview.total} trades imported successfully
            </Text>

            <View style={styles.successStats}>
              <View style={styles.successStat}>
                <Text style={[styles.successStatNum, { color: colors.green }]}>{preview.wins}</Text>
                <Text style={styles.successStatLabel}>WINS</Text>
              </View>
              <View style={styles.successDivider} />
              <View style={styles.successStat}>
                <Text style={[styles.successStatNum, { color: colors.red }]}>{preview.losses}</Text>
                <Text style={styles.successStatLabel}>LOSSES</Text>
              </View>
              <View style={styles.successDivider} />
              <View style={styles.successStat}>
                <Text style={[styles.successStatNum, { color: pnlColor }]}>
                  {preview.totalPnl >= 0 ? '+' : ''}${Math.abs(preview.totalPnl).toFixed(0)}
                </Text>
                <Text style={styles.successStatLabel}>P&L</Text>
              </View>
            </View>

            <View style={styles.nextStepsCard}>
              <Text style={styles.nextStepsTitle}>NEXT STEPS</Text>
              {[
                'Review each imported trade in History',
                'Fill in your discipline checklist for each trade',
                'Add your strategy, emotions and lessons',
                'Set your goals based on this data',
              ].map((s, i) => (
                <View key={i} style={styles.nextStepRow}>
                  <View style={[styles.nextStepNum, { backgroundColor: colors.green + '22' }]}>
                    <Text style={[styles.nextStepNumText, { color: colors.green }]}>{i + 1}</Text>
                  </View>
                  <Text style={styles.nextStepText}>{s}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              onPress={() => router.push('/(tabs)/history')}
              style={[styles.importBtn, { backgroundColor: colors.green }]}
              activeOpacity={0.8}
            >
              <Ionicons name="list" size={20} color={colors.bg} />
              <Text style={styles.importBtnText}>View Imported Trades</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleReset} style={styles.cancelBtn} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>Import Another File</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <Toast message={toastMsg} visible={toastVisible} />
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: colors.bg },
  scroll:  { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 60 },

  headerCard:  { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg },
  headerIcon:  { width: 56, height: 56, borderRadius: 16, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  headerText:  { flex: 1 },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  headerSub:   { fontFamily: font.mono, fontSize: 10, color: colors.muted, lineHeight: 16 },

  stepsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  stepLine: { flex: 1, height: 0.5, backgroundColor: colors.border, marginHorizontal: spacing.xs },

  instructCard:     { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  instructHeader:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.md },
  instructTitle:    { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5 },
  instructSubtitle: { fontFamily: font.mono, fontSize: 11, color: colors.text, fontWeight: '700', marginBottom: spacing.sm },
  instructRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  instructNum:      { width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  instructNumText:  { fontFamily: font.mono, fontSize: 10, fontWeight: '800' },
  instructText:     { flex: 1, fontFamily: font.mono, fontSize: 11, color: colors.muted, lineHeight: 17 },

  formatsCard:  { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  formatsTitle: { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5, marginBottom: spacing.sm },
  formatsRow:   { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  formatBadge:  { borderWidth: 1, borderRadius: radius.sm, padding: spacing.sm, alignItems: 'center', flex: 1, minWidth: 70 },
  formatLabel:  { fontFamily: font.mono, fontSize: 13, fontWeight: '800', marginBottom: 2 },
  formatDesc:   { fontFamily: font.mono, fontSize: 8, color: colors.muted, textAlign: 'center' },

  whatCard:  { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg },
  whatTitle: { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5, marginBottom: spacing.sm },
  whatRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  whatText:  { flex: 1, fontFamily: font.mono, fontSize: 11, color: colors.muted, lineHeight: 17 },

  pickBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radius.lg, paddingVertical: 16, marginBottom: spacing.sm },
  pickBtnText: { fontFamily: font.mono, fontSize: 15, fontWeight: '800', color: colors.bg },
  tipText:     { fontFamily: font.mono, fontSize: 10, color: colors.muted, textAlign: 'center', lineHeight: 16 },

  fileInfoCard:    { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  fileInfoRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fileInfoText:    { flex: 1 },
  fileInfoName:    { color: colors.text, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  fileInfoMeta:    { fontFamily: font.mono, fontSize: 10, color: colors.muted },
  fileFormatBadge: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  fileFormatText:  { fontFamily: font.mono, fontSize: 10, fontWeight: '700' },

  warningCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: colors.amber + '11', borderWidth: 0.5, borderColor: colors.amber + '44', borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.sm },
  warningText: { flex: 1 },
  warningLine: { fontFamily: font.mono, fontSize: 11, color: colors.amber, lineHeight: 17 },

  dateRangeCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface2, borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.sm },
  dateRangeText: { fontFamily: font.mono, fontSize: 11, color: colors.muted },

  previewStatsRow: { flexDirection: 'row', marginBottom: spacing.sm },

  pairsCard:  { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  pairsTitle: { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5, marginBottom: spacing.sm },
  pairsRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pairBadge:  { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: colors.surface2 },
  pairText:   { fontFamily: font.mono, fontSize: 10, color: colors.muted, fontWeight: '700' },

  tradePreviewCard:  { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  tradePreviewTitle: { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5, marginBottom: spacing.sm },
  tradePreviewRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  tradePreviewDot:   { width: 8, height: 8, borderRadius: 4 },
  tradePreviewInfo:  { flex: 1 },
  tradePreviewPair:  { fontFamily: font.mono, fontSize: 12, color: colors.text, fontWeight: '700' },
  tradePreviewMeta:  { fontFamily: font.mono, fontSize: 9, color: colors.muted, marginTop: 2 },
  tradePreviewPnl:   { fontFamily: font.mono, fontSize: 12, fontWeight: '800' },
  moreTradesText:    { fontFamily: font.mono, fontSize: 10, color: colors.muted, textAlign: 'center', marginTop: spacing.sm },

  noteCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: colors.amber + '11', borderWidth: 0.5, borderColor: colors.amber + '44', borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.md },
  noteText: { flex: 1, fontFamily: font.mono, fontSize: 11, color: colors.muted, lineHeight: 17 },

  importBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radius.lg, paddingVertical: 15, marginBottom: spacing.sm },
  importBtnText: { fontFamily: font.mono, fontSize: 14, fontWeight: '800', color: colors.bg },
  cancelBtn:     { alignItems: 'center', paddingVertical: 12, borderRadius: radius.md, borderWidth: 0.5, borderColor: colors.border },
  cancelBtnText: { fontFamily: font.mono, fontSize: 12, color: colors.muted },

  successBlock:     { alignItems: 'center', paddingTop: spacing.xl },
  successIcon:      { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  successTitle:     { color: colors.text, fontSize: 24, fontWeight: '800', marginBottom: 8 },
  successSubtitle:  { fontFamily: font.mono, fontSize: 12, color: colors.muted, marginBottom: spacing.lg, textAlign: 'center' },
  successStats:     { flexDirection: 'row', backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg, width: '100%' },
  successStat:      { flex: 1, alignItems: 'center' },
  successStatNum:   { fontFamily: font.mono, fontSize: 28, fontWeight: '800', marginBottom: 4 },
  successStatLabel: { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1 },
  successDivider:   { width: 0.5, backgroundColor: colors.border, alignSelf: 'stretch', marginHorizontal: spacing.sm },
  nextStepsCard:    { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg, width: '100%' },
  nextStepsTitle:   { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5, marginBottom: spacing.sm },
  nextStepRow:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 8 },
  nextStepNum:      { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  nextStepNumText:  { fontFamily: font.mono, fontSize: 10, fontWeight: '800' },
  nextStepText:     { flex: 1, fontFamily: font.mono, fontSize: 11, color: colors.muted, lineHeight: 17 },
});