import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  FlatList,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import {
  GalleryImage,
  Trade,
  loadGallery,
  loadTrades,
  addGalleryImage,
  updateGalleryImage,
} from '../store/trades';
import { colors, font, spacing, radius } from '../theme';
import { Toast } from '../components/UI';

const { width } = Dimensions.get('window');

type Category = 'pattern' | 'setup' | 'analysis' | 'mistake' | 'other';
type Mode     = 'single' | 'batch';

const CATEGORIES: { key: Category; label: string; icon: string; color: string }[] = [
  { key: 'pattern',  label: 'Pattern',  icon: '📊', color: colors.blue   },
  { key: 'setup',    label: 'Setup',    icon: '🎯', color: colors.green  },
  { key: 'analysis', label: 'Analysis', icon: '🔍', color: colors.amber  },
  { key: 'mistake',  label: 'Mistake',  icon: '⚠️', color: colors.red    },
  { key: 'other',    label: 'Other',    icon: '📌', color: colors.purple },
];

// ─── Batch image item ────────────────────────────────────────────────────────
type BatchItem = {
  uri:  string;
  note: string;
};

export default function AddImageScreen() {
  const router = useRouter();
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const isEdit = !!editId;

  // ── Mode ─────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>('single');

  // ── Single image state ───────────────────────────────────────────────
  const [imageUri, setImageUri]  = useState<string | null>(null);

  // ── Batch state ──────────────────────────────────────────────────────
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);

  // ── Group state (NEW) ────────────────────────────────────────────────
  const [saveAsGroup, setSaveAsGroup] = useState(true);   // default ON in batch
  const [groupName, setGroupName]     = useState('');     // e.g. "CRT"

  // ── Shared state ─────────────────────────────────────────────────────
  const [title, setTitle]                = useState('');
  const [notes, setNotes]                = useState('');
  const [category, setCategory]          = useState<Category>('pattern');
  const [selectedTrade, setSelected]     = useState<Trade | null>(null);
  const [saving, setSaving]              = useState(false);
  const [saveProgress, setSaveProgress]  = useState({ current: 0, total: 0 });
  const [trades, setTrades]              = useState<Trade[]>([]);
  const [showTradePicker, setShowPicker] = useState(false);
  const [tradeSearch, setTradeSearch]    = useState('');
  const [existingImage, setExisting]     = useState<GalleryImage | null>(null);
  const [toast, setToast]                = useState({ msg: '', visible: false });

  const showToast = (msg: string) => {
    setToast({ msg, visible: false });
    setTimeout(() => setToast({ msg, visible: true }), 50);
  };

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const allTrades = await loadTrades();
        setTrades(allTrades);

        if (isEdit) {
          const gallery = await loadGallery();
          const found = gallery.find((img) => img.id === Number(editId));
          if (found) {
            setExisting(found);
            setImageUri(found.uri);
            setTitle(found.title);
            setNotes(found.notes);
            setCategory(found.category);
            setMode('single'); // edits are always single
            if (found.tradeId) {
              const linked = allTrades.find((t) => t.id === found.tradeId);
              if (linked) setSelected(linked);
            }
          }
        }
      })();
    }, [editId, isEdit])
  );

  // ── Single-mode pickers ──────────────────────────────────────────────
  const pickSingleFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes:    ['images'],
      quality:       0.85,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      Haptics.selectionAsync();
    }
  };

  const pickSingleFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow camera access.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality:       0.85,
      allowsEditing: true,
      mediaTypes:    ['images'],
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      Haptics.selectionAsync();
    }
  };

  // ── Batch-mode pickers ───────────────────────────────────────────────
  const pickBatchFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes:              ['images'],
      quality:                 0.85,
      allowsMultipleSelection: true,
      selectionLimit:          20,
    });
    if (!result.canceled && result.assets.length > 0) {
      const newItems: BatchItem[] = result.assets.map((a) => ({ uri: a.uri, note: '' }));
      setBatchItems((prev) => [...prev, ...newItems]);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      showToast(`✓ Added ${newItems.length} image${newItems.length > 1 ? 's' : ''}`);
    }
  };

  const pickBatchFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow camera access.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality:       0.85,
      allowsEditing: false,
      mediaTypes:    ['images'],
    });
    if (!result.canceled && result.assets[0]) {
      setBatchItems((prev) => [...prev, { uri: result.assets[0].uri, note: '' }]);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      showToast('✓ Photo added — take more or save');
    }
  };

  const removeBatchItem = (idx: number) => {
    setBatchItems((prev) => prev.filter((_, i) => i !== idx));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const updateBatchItemNote = (idx: number, note: string) => {
    setBatchItems((prev) => prev.map((item, i) => (i === idx ? { ...item, note } : item)));
  };

  const showImageOptions = () => {
    if (mode === 'single') {
      Alert.alert('Add Image', 'Choose a source', [
        { text: 'Camera',        onPress: pickSingleFromCamera },
        { text: 'Photo Library', onPress: pickSingleFromGallery },
        { text: 'Cancel',        style: 'cancel' },
      ]);
    } else {
      Alert.alert('Add Images', 'Choose a source', [
        { text: 'Camera (one at a time)',   onPress: pickBatchFromCamera },
        { text: 'Photo Library (multiple)', onPress: pickBatchFromGallery },
        { text: 'Cancel',                   style: 'cancel' },
      ]);
    }
  };

  // ── Utils ────────────────────────────────────────────────────────────
  const formatPnl = (pnl: number) => {
    if (pnl > 0) return `+$${pnl.toFixed(2)}`;
    if (pnl < 0) return `-$${Math.abs(pnl).toFixed(2)}`;
    return '$0.00';
  };

  const pnlColor = (pnl: number) =>
    pnl > 0 ? colors.green : pnl < 0 ? colors.red : colors.muted;

  // ── Save ─────────────────────────────────────────────────────────────
  const handleSave = async () => {
    // Validation
    if (mode === 'single' && !imageUri) {
      Alert.alert('No Image', 'Please select or take a photo first.');
      return;
    }
    if (mode === 'batch' && batchItems.length === 0) {
      Alert.alert('No Images', 'Please add at least one image.');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Title Required', 'Please enter a title.');
      return;
    }

    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      // ── Edit mode: only single ────────────────────────────────────
      if (isEdit && existingImage) {
        const updated: GalleryImage = {
          ...existingImage,
          title:     title.trim(),
          notes:     notes.trim(),
          category,
          tradeId:   selectedTrade?.id ?? null,
          tradePair: selectedTrade?.pair ?? null,
        };
        if (imageUri && imageUri !== existingImage.uri) updated.uri = imageUri;
        await updateGalleryImage(updated);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast('✓ Image updated');
        setTimeout(() => router.back(), 500);
        return;
      }

      // ── Single mode ───────────────────────────────────────────────
      if (mode === 'single' && imageUri) {
        await addGalleryImage({
          sourceUri:  imageUri,
          title:      title.trim(),
          notes:      notes.trim(),
          category,
          tradeId:    selectedTrade?.id ?? null,
          tradePair:  selectedTrade?.pair ?? null,
          groupId:    null,
          groupName:  null,
          groupOrder: 0,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast('✓ Image saved');
        setTimeout(() => router.back(), 500);
        return;
      }

      // ── Batch mode ────────────────────────────────────────────────
      const total = batchItems.length;
      setSaveProgress({ current: 0, total });

      // Generate group ID if saving as album
      const groupId = saveAsGroup && total > 1
        ? `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        : null;
      const finalGroupName = saveAsGroup && total > 1
        ? (groupName.trim() || title.trim())
        : null;

      for (let i = 0; i < batchItems.length; i++) {
        const item = batchItems[i];

        // Group mode → number within group name; Separate → number the titles
        const imgTitle = groupId
          ? `${title.trim()} — ${i + 1}`
          : total > 1 ? `${title.trim()} ${i + 1}` : title.trim();

        const combinedNotes = item.note.trim()
          ? `${notes.trim()}\n\n— Note: ${item.note.trim()}`
          : notes.trim();

        await addGalleryImage({
          sourceUri:  item.uri,
          title:      imgTitle,
          notes:      combinedNotes,
          category,
          tradeId:    selectedTrade?.id ?? null,
          tradePair:  selectedTrade?.pair ?? null,
          groupId,
          groupName:  finalGroupName,
          groupOrder: i,
        });
        setSaveProgress({ current: i + 1, total });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(groupId
        ? `✓ Album "${finalGroupName}" saved`
        : `✓ Saved ${total} image${total > 1 ? 's' : ''}`
      );
      setTimeout(() => router.back(), 700);
      return;

    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', e.message ?? 'Failed to save.');
    } finally {
      setSaving(false);
      setSaveProgress({ current: 0, total: 0 });
    }
  };

  const filteredTrades = trades.filter((t) => {
    const q = tradeSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      String(t.id).includes(q)              ||
      t.pair.toLowerCase().includes(q)      ||
      t.dateStr.toLowerCase().includes(q)   ||
      t.strategy.toLowerCase().includes(q)  ||
      t.timeframe.toLowerCase().includes(q) ||
      t.session.toLowerCase().includes(q)   ||
      t.dir.toLowerCase().includes(q)       ||
      t.result.toLowerCase().includes(q)
    );
  });

  const canSave =
    !saving &&
    title.trim().length > 0 &&
    (mode === 'single' ? !!imageUri : batchItems.length > 0);

  // ── UPDATED save button label ─────────────────────────────────────
  const saveButtonLabel = () => {
    if (saving) {
      if (mode === 'batch' && saveProgress.total > 0) {
        return `Saving ${saveProgress.current}/${saveProgress.total}...`;
      }
      return 'Saving...';
    }
    if (isEdit) return 'Update Image';
    if (mode === 'batch' && saveAsGroup && batchItems.length > 1) {
      return `Save Album (${batchItems.length})`;
    }
    if (mode === 'batch') return `Save ${batchItems.length} Image${batchItems.length > 1 ? 's' : ''}`;
    return 'Save Image';
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {/* ── Mode Toggle (hidden in edit) ─────────────────────────── */}
          {!isEdit && (
            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'single' && styles.modeBtnActive]}
                onPress={() => { setMode('single'); Haptics.selectionAsync(); }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="image-outline"
                  size={16}
                  color={mode === 'single' ? colors.green : colors.muted}
                />
                <Text style={[styles.modeBtnText, mode === 'single' && { color: colors.green }]}>
                  Single
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeBtn, mode === 'batch' && styles.modeBtnActive]}
                onPress={() => { setMode('batch'); Haptics.selectionAsync(); }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="albums-outline"
                  size={16}
                  color={mode === 'batch' ? colors.green : colors.muted}
                />
                <Text style={[styles.modeBtnText, mode === 'batch' && { color: colors.green }]}>
                  Batch
                </Text>
                {batchItems.length > 0 && (
                  <View style={styles.modeCountBadge}>
                    <Text style={styles.modeCountText}>{batchItems.length}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* ── Batch hint ────────────────────────────────────────────── */}
          {mode === 'batch' && !isEdit && (
            <View style={styles.batchHint}>
              <Ionicons name="information-circle-outline" size={14} color={colors.blue} />
              <Text style={styles.batchHintText}>
                All images share the same title, category, and linked trade. Each will be numbered automatically.
              </Text>
            </View>
          )}

          {/* ── NEW: Group / Separate mode toggle ────────────────────── */}
          {mode === 'batch' && !isEdit && batchItems.length > 1 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>SAVE MODE</Text>
              <View style={styles.groupModeRow}>
                <TouchableOpacity
                  style={[styles.groupModeCard, saveAsGroup && styles.groupModeCardActive]}
                  onPress={() => { setSaveAsGroup(true); Haptics.selectionAsync(); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="albums" size={20} color={saveAsGroup ? colors.green : colors.muted} />
                  <Text style={[styles.groupModeTitle, saveAsGroup && { color: colors.green }]}>
                    As Album
                  </Text>
                  <Text style={styles.groupModeHint}>One card, tap to browse</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.groupModeCard, !saveAsGroup && styles.groupModeCardActive]}
                  onPress={() => { setSaveAsGroup(false); Haptics.selectionAsync(); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="grid" size={20} color={!saveAsGroup ? colors.green : colors.muted} />
                  <Text style={[styles.groupModeTitle, !saveAsGroup && { color: colors.green }]}>
                    Separate
                  </Text>
                  <Text style={styles.groupModeHint}>Individual images</Text>
                </TouchableOpacity>
              </View>

              {/* Album name input — shown only when saving as group */}
              {saveAsGroup && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.sectionLabel}>ALBUM NAME (optional)</Text>
                  <TextInput
                    style={styles.input}
                    value={groupName}
                    onChangeText={setGroupName}
                    placeholder='e.g. "CRT", "London Setups", "M15 Patterns"'
                    placeholderTextColor={colors.muted}
                    maxLength={40}
                  />
                  <Text style={styles.titlePreview}>
                    If empty, will use title: "{title.trim() || 'Untitled'}"
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ══ SINGLE MODE ══════════════════════════════════════════ */}
          {mode === 'single' && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>IMAGE</Text>
              {imageUri ? (
                <TouchableOpacity activeOpacity={0.9} onPress={showImageOptions}>
                  <Image source={{ uri: imageUri }} style={styles.previewImage} />
                  <View style={styles.changeOverlay}>
                    <Ionicons name="camera-outline" size={16} color="#fff" />
                    <Text style={styles.changeText}>Tap to change</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <View style={styles.pickerContainer}>
                  <TouchableOpacity
                    style={styles.pickerButton}
                    onPress={pickSingleFromCamera}
                    activeOpacity={0.8}
                  >
                    <View style={styles.pickerIconCircle}>
                      <Ionicons name="camera" size={28} color={colors.green} />
                    </View>
                    <Text style={styles.pickerLabel}>Camera</Text>
                    <Text style={styles.pickerHint}>Take a photo</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.pickerButton}
                    onPress={pickSingleFromGallery}
                    activeOpacity={0.8}
                  >
                    <View style={styles.pickerIconCircle}>
                      <Ionicons name="images" size={28} color={colors.blue} />
                    </View>
                    <Text style={styles.pickerLabel}>Gallery</Text>
                    <Text style={styles.pickerHint}>Choose a photo</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* ══ BATCH MODE ══════════════════════════════════════════ */}
          {mode === 'batch' && (
            <View style={styles.section}>
              <View style={styles.batchHeader}>
                <Text style={styles.sectionLabel}>
                  IMAGES {batchItems.length > 0 && `(${batchItems.length})`}
                </Text>
                {batchItems.length > 0 && (
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert('Clear All', 'Remove all images?', [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Clear',
                          style: 'destructive',
                          onPress: () => {
                            setBatchItems([]);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          },
                        },
                      ]);
                    }}
                  >
                    <Text style={styles.clearAllText}>Clear all</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Add buttons */}
              <View style={styles.batchAddRow}>
                <TouchableOpacity
                  style={styles.batchAddBtn}
                  onPress={pickBatchFromCamera}
                  activeOpacity={0.8}
                >
                  <Ionicons name="camera" size={18} color={colors.green} />
                  <Text style={styles.batchAddText}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.batchAddBtn}
                  onPress={pickBatchFromGallery}
                  activeOpacity={0.8}
                >
                  <Ionicons name="images" size={18} color={colors.blue} />
                  <Text style={styles.batchAddText}>Gallery (multi)</Text>
                </TouchableOpacity>
              </View>

              {/* Image list */}
              {batchItems.length === 0 ? (
                <View style={styles.batchEmpty}>
                  <Ionicons name="images-outline" size={40} color={colors.muted} />
                  <Text style={styles.batchEmptyTitle}>No images added yet</Text>
                  <Text style={styles.batchEmptyText}>
                    Tap Gallery to select multiple at once, or Camera to shoot them one by one.
                  </Text>
                </View>
              ) : (
                <View style={styles.batchList}>
                  {batchItems.map((item, idx) => (
                    <View key={`${item.uri}-${idx}`} style={styles.batchItem}>
                      <View style={styles.batchItemLeft}>
                        <Image source={{ uri: item.uri }} style={styles.batchThumb} />
                        <View style={styles.batchNumberBadge}>
                          <Text style={styles.batchNumberText}>{idx + 1}</Text>
                        </View>
                      </View>
                      <View style={styles.batchItemRight}>
                        <TextInput
                          style={styles.batchNoteInput}
                          value={item.note}
                          onChangeText={(v) => updateBatchItemNote(idx, v)}
                          placeholder="Quick note for this image (optional)"
                          placeholderTextColor={colors.muted}
                          maxLength={120}
                          multiline
                        />
                      </View>
                      <TouchableOpacity
                        style={styles.batchRemoveBtn}
                        onPress={() => removeBatchItem(idx)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="close-circle" size={22} color={colors.red} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* ══ SHARED FIELDS ═══════════════════════════════════════ */}

          {/* Title */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {mode === 'batch' && batchItems.length > 1 ? 'BASE TITLE (auto-numbered)' : 'TITLE'}
            </Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder={
                mode === 'batch'
                  ? 'e.g. London Session H4 — will become "London Session H4 1", "... 2"'
                  : 'e.g. H4 Double Top on EURUSD'
              }
              placeholderTextColor={colors.muted}
              maxLength={80}
            />
            {mode === 'batch' && batchItems.length > 1 && title.trim() && !saveAsGroup && (
              <Text style={styles.titlePreview}>
                Preview: {title.trim()} 1, {title.trim()} 2, ...
              </Text>
            )}
            {mode === 'batch' && batchItems.length > 1 && title.trim() && saveAsGroup && (
              <Text style={styles.titlePreview}>
                Album: "{groupName.trim() || title.trim()}" · {batchItems.length} images
              </Text>
            )}
          </View>

          {/* Category */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>CATEGORY</Text>
            <View style={styles.categoryGrid}>
              {CATEGORIES.map((cat) => {
                const isActive = category === cat.key;
                return (
                  <TouchableOpacity
                    key={cat.key}
                    style={[
                      styles.categoryChip,
                      isActive && {
                        backgroundColor: cat.color + '22',
                        borderColor:     cat.color,
                      },
                    ]}
                    onPress={() => { setCategory(cat.key); Haptics.selectionAsync(); }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.categoryIcon}>{cat.icon}</Text>
                    <Text style={[styles.categoryText, isActive && { color: cat.color }]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Linked trade */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>LINK TO TRADE (OPTIONAL)</Text>
            {selectedTrade ? (
              <View style={styles.selectedTradeCard}>
                <View style={styles.selectedTradeLeft}>
                  <Text style={styles.selectedTradePair}>{selectedTrade.pair}</Text>
                  <Text style={styles.selectedTradeMeta}>
                    {selectedTrade.dir} · {selectedTrade.dateStr} ·{' '}
                    <Text style={{ color: pnlColor(selectedTrade.pnl) }}>
                      {formatPnl(selectedTrade.pnl)}
                    </Text>
                  </Text>
                </View>
                <TouchableOpacity style={styles.unlinkBtn} onPress={() => setSelected(null)}>
                  <Ionicons name="close-circle" size={20} color={colors.red} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => setShowPicker(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="link-outline" size={18} color={colors.green} />
                <Text style={styles.linkButtonText}>Select a trade</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Shared notes */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {mode === 'batch' ? 'SHARED NOTES (applies to all)' : 'NOTES'}
            </Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder={
                mode === 'batch'
                  ? 'Describe the setup / pattern that applies to all these images...'
                  : 'Describe the pattern, setup, or what you learned...'
              }
              placeholderTextColor={colors.muted}
              multiline
              textAlignVertical="top"
              maxLength={5000}
            />
            <Text style={styles.charCount}>{notes.length}/5000</Text>
          </View>

          {/* Save button */}
          <TouchableOpacity
            style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={!canSave}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color={colors.bg} size="small" />
            ) : (
              <Ionicons
                name={
                  isEdit          ? 'checkmark-circle' :
                  mode === 'batch' && saveAsGroup && batchItems.length > 1
                                  ? 'albums' :
                  mode === 'batch' ? 'albums' :
                                    'cloud-upload'
                }
                size={20}
                color={colors.bg}
              />
            )}
            <Text style={styles.saveButtonText}>{saveButtonLabel()}</Text>
          </TouchableOpacity>

          <View style={{ height: 80 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Trade Picker Modal ────────────────────────────────────── */}
      <Modal
        visible={showTradePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select a Trade</Text>
              <TouchableOpacity onPress={() => setShowPicker(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalSearchContainer}>
              <Ionicons name="search" size={16} color={colors.muted} />
              <TextInput
                style={styles.modalSearchInput}
                value={tradeSearch}
                onChangeText={setTradeSearch}
                placeholder="Search by pair, date, strategy..."
                placeholderTextColor={colors.muted}
              />
              {tradeSearch.length > 0 && (
                <TouchableOpacity onPress={() => setTradeSearch('')}>
                  <Ionicons name="close-circle" size={16} color={colors.muted} />
                </TouchableOpacity>
              )}
            </View>

            <FlatList
              data={filteredTrades}
              keyExtractor={(item) => item.id.toString()}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalList}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={styles.modalEmpty}>
                  <Text style={styles.modalEmptyText}>
                    {tradeSearch ? 'No trades match your search' : 'No trades recorded yet'}
                  </Text>
                </View>
              }
              renderItem={({ item: trade }) => {
                const dirColor = trade.dir === 'BUY' ? colors.green : colors.red;
                return (
                  <TouchableOpacity
                    style={styles.modalTradeItem}
                    activeOpacity={0.8}
                    onPress={() => {
                      setSelected(trade);
                      setShowPicker(false);
                      setTradeSearch('');
                      Haptics.selectionAsync();
                    }}
                  >
                    <View style={styles.modalTradeLeft}>
                      <Text style={styles.modalTradePair}>
                        {trade.pair}
                        <Text style={{ color: dirColor }}> {trade.dir}</Text>
                      </Text>
                      <Text style={styles.modalTradeMeta}>
                        {trade.dateStr} · {trade.strategy} · {trade.timeframe}
                      </Text>
                    </View>
                    <View style={styles.modalTradeRight}>
                      <Text style={[styles.modalTradePnl, { color: pnlColor(trade.pnl) }]}>
                        {formatPnl(trade.pnl)}
                      </Text>
                      <Text
                        style={[
                          styles.modalTradeResult,
                          {
                            color:
                              trade.result === 'win'  ? colors.green :
                              trade.result === 'loss' ? colors.red   :
                                                        colors.amber,
                          },
                        ]}
                      >
                        {trade.result.toUpperCase()}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      <Toast message={toast.msg} visible={toast.visible} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: colors.bg },
  scrollView:    { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingBottom: 40 },

  // Mode toggle
  modeToggle: {
    flexDirection:   'row',
    backgroundColor: colors.surface,
    borderRadius:    radius.pill,
    padding:         4,
    marginBottom:    spacing.md,
    gap:             4,
  },
  modeBtn: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             6,
    paddingVertical: 10,
    borderRadius:    radius.pill,
  },
  modeBtnActive: {
    backgroundColor: colors.green + '18',
  },
  modeBtnText: {
    fontSize:   12,
    fontWeight: '700',
    color:      colors.muted,
    fontFamily: font.mono,
  },
  modeCountBadge: {
    backgroundColor:   colors.green,
    borderRadius:      999,
    minWidth:          18,
    height:            18,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: 4,
    marginLeft:        2,
  },
  modeCountText: {
    fontSize:   10,
    fontWeight: '800',
    color:      colors.bg,
    fontFamily: font.mono,
  },

  batchHint: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    gap:             6,
    backgroundColor: colors.blue + '11',
    borderWidth:     0.5,
    borderColor:     colors.blue + '44',
    borderRadius:    radius.md,
    padding:         spacing.md,
    marginBottom:    spacing.md,
  },
  batchHintText: {
    flex:       1,
    fontSize:   11,
    color:      colors.blue,
    fontFamily: font.mono,
    lineHeight: 16,
  },

  // Section
  section: { marginBottom: spacing.lg },
  sectionLabel: {
    fontSize:      10,
    fontWeight:    '700',
    color:         colors.muted,
    fontFamily:    font.mono,
    letterSpacing: 1.5,
    marginBottom:  spacing.sm,
  },
  titlePreview: {
    fontSize:   10,
    color:      colors.blue,
    fontFamily: font.mono,
    marginTop:  6,
    fontStyle:  'italic',
  },

  // ── NEW: Group mode styles ─────────────────────────────────────────
  groupModeRow: {
    flexDirection: 'row',
    gap:           10,
  },
  groupModeCard: {
    flex:            1,
    backgroundColor: colors.surface,
    borderWidth:     1,
    borderColor:     colors.border,
    borderRadius:    radius.md,
    padding:         14,
    alignItems:      'center',
    gap:             4,
  },
  groupModeCardActive: {
    backgroundColor: colors.green + '15',
    borderColor:     colors.green,
  },
  groupModeTitle: {
    fontSize:   13,
    fontWeight: '700',
    color:      colors.muted,
    marginTop:  4,
  },
  groupModeHint: {
    fontSize:   10,
    color:      colors.muted,
    fontFamily: font.mono,
  },

  // Single picker
  pickerContainer: { flexDirection: 'row', gap: spacing.md },
  pickerButton: {
    flex:            1,
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.lg,
    padding:         spacing.lg,
    alignItems:      'center',
    gap:             spacing.sm,
  },
  pickerIconCircle: {
    width:           56,
    height:          56,
    borderRadius:    28,
    backgroundColor: colors.bg,
    justifyContent:  'center',
    alignItems:      'center',
    borderWidth:     0.5,
    borderColor:     colors.border,
  },
  pickerLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  pickerHint:  { fontSize: 11, color: colors.muted, fontFamily: font.mono },
  previewImage: {
    width:        '100%',
    height:       width * 0.55,
    borderRadius: radius.lg,
    resizeMode:   'cover',
  },
  changeOverlay: {
    position:          'absolute',
    bottom:            10,
    right:             10,
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    backgroundColor:   'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical:   5,
    borderRadius:      radius.md,
  },
  changeText: { fontSize: 11, color: '#fff', fontFamily: font.mono },

  // Batch
  batchHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   spacing.sm,
  },
  clearAllText: {
    fontSize:   11,
    color:      colors.red,
    fontFamily: font.mono,
    fontWeight: '600',
  },
  batchAddRow: {
    flexDirection: 'row',
    gap:           spacing.sm,
    marginBottom:  spacing.md,
  },
  batchAddBtn: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             8,
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderStyle:     'dashed',
    borderRadius:    radius.md,
    paddingVertical: 12,
  },
  batchAddText: {
    fontSize:   12,
    fontWeight: '700',
    color:      colors.text,
    fontFamily: font.mono,
  },
  batchEmpty: {
    padding:         spacing.xl,
    alignItems:      'center',
    gap:             spacing.sm,
    backgroundColor: colors.surface,
    borderRadius:    radius.lg,
    borderWidth:     0.5,
    borderColor:     colors.border,
  },
  batchEmptyTitle: {
    fontSize:   13,
    fontWeight: '700',
    color:      colors.text,
    marginTop:  spacing.sm,
  },
  batchEmptyText: {
    fontSize:          11,
    color:             colors.muted,
    fontFamily:        font.mono,
    textAlign:         'center',
    lineHeight:        16,
    paddingHorizontal: spacing.md,
  },
  batchList: { gap: spacing.sm },
  batchItem: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             spacing.sm,
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.md,
    padding:         spacing.sm,
  },
  batchItemLeft:  { position: 'relative' },
  batchThumb: {
    width:        60,
    height:       60,
    borderRadius: radius.sm,
    resizeMode:   'cover',
  },
  batchNumberBadge: {
    position:        'absolute',
    top:             -4,
    left:            -4,
    backgroundColor: colors.green,
    borderRadius:    999,
    width:           20,
    height:          20,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     2,
    borderColor:     colors.bg,
  },
  batchNumberText: {
    fontSize:   10,
    fontWeight: '800',
    color:      colors.bg,
    fontFamily: font.mono,
  },
  batchItemRight: { flex: 1 },
  batchNoteInput: {
    fontSize:        12,
    color:           colors.text,
    fontFamily:      font.mono,
    padding:         8,
    backgroundColor: colors.bg,
    borderRadius:    radius.sm,
    minHeight:       40,
    maxHeight:       80,
  },
  batchRemoveBtn: { padding: 4 },

  // Input
  input: {
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.md,
    padding:         spacing.md,
    fontSize:        14,
    color:           colors.text,
    fontFamily:      font.mono,
  },
  notesInput: { minHeight: 160, maxHeight: 300 },
  charCount: {
    fontSize:   10,
    color:      colors.muted,
    fontFamily: font.mono,
    textAlign:  'right',
    marginTop:  4,
  },

  // Category
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  categoryChip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    borderRadius:      radius.pill,
    borderWidth:       0.5,
    borderColor:       colors.border,
    backgroundColor:   colors.surface,
  },
  categoryIcon: { fontSize: 14 },
  categoryText: { fontSize: 12, fontWeight: '600', color: colors.muted },

  // Selected trade
  selectedTradeCard: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.green + '44',
    borderRadius:    radius.md,
    padding:         spacing.md,
  },
  selectedTradeLeft: { flex: 1 },
  selectedTradePair: {
    fontSize:      15,
    fontWeight:    '800',
    color:         colors.text,
    letterSpacing: 0.3,
    marginBottom:  2,
  },
  selectedTradeMeta: {
    fontSize:   11,
    color:      colors.muted,
    fontFamily: font.mono,
  },
  unlinkBtn: { padding: 4 },

  // Link button
  linkButton: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             spacing.sm,
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.md,
    padding:         spacing.md,
    borderStyle:     'dashed',
  },
  linkButtonText: { fontSize: 13, fontWeight: '600', color: colors.green },

  // Save button
  saveButton: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             spacing.sm,
    backgroundColor: colors.green,
    borderRadius:    radius.lg,
    padding:         spacing.lg,
    marginTop:       spacing.sm,
  },
  saveButtonDisabled: { opacity: 0.4 },
  saveButtonText: {
    fontSize:      15,
    fontWeight:    '800',
    color:         colors.bg,
    letterSpacing: 0.5,
  },

  // Modal
  modalOverlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent:  'flex-end',
  },
  modalContainer: {
    backgroundColor:      colors.bg,
    borderTopLeftRadius:  20,
    borderTopRightRadius: 20,
    maxHeight:            '80%',
    paddingBottom:        30,
  },
  modalHeader: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    padding:           spacing.lg,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  modalSearchContainer: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               spacing.sm,
    margin:            spacing.md,
    backgroundColor:   colors.surface,
    borderWidth:       0.5,
    borderColor:       colors.border,
    borderRadius:      radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
  },
  modalSearchInput: {
    flex:       1,
    fontSize:   13,
    color:      colors.text,
    fontFamily: font.mono,
  },
  modalList:  { paddingHorizontal: spacing.md, paddingBottom: spacing.lg },
  modalEmpty: { padding: 40, alignItems: 'center' },
  modalEmptyText: {
    fontSize:   13,
    color:      colors.muted,
    fontFamily: font.mono,
    textAlign:  'center',
  },
  modalTradeItem: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.sm,
    padding:         spacing.md,
    marginBottom:    spacing.sm,
  },
  modalTradeLeft: { flex: 1 },
  modalTradePair: {
    fontSize:     14,
    fontWeight:   '700',
    color:        colors.text,
    marginBottom: 2,
  },
  modalTradeMeta: {
    fontSize:   10,
    color:      colors.muted,
    fontFamily: font.mono,
  },
  modalTradeRight: { alignItems: 'flex-end', gap: 2 },
  modalTradePnl: {
    fontSize:   14,
    fontWeight: '800',
    fontFamily: font.mono,
  },
  modalTradeResult: {
    fontSize:      9,
    fontWeight:    '700',
    fontFamily:    font.mono,
    letterSpacing: 0.5,
  },
});