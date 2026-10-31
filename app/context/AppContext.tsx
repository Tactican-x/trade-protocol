import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import {
  loadTheme,
  saveTheme,
  loadPin,
  getDuressActive,
  setDuressActive,
  AccentColor,
} from '../store/journal';

// ── Accent color map ──────────────────────────────────────────────────────────
export const ACCENT_COLORS: Record<AccentColor, string> = {
  green:  '#00d68f',
  blue:   '#4fc3f7',
  purple: '#a78bfa',
  amber:  '#ffd166',
  red:    '#ff6b6b',
};

// ── Context type ──────────────────────────────────────────────────────────────
interface AppContextType {
  accent:        string;
  accentKey:     AccentColor;
  setAccent:     (key: AccentColor) => void;
  pinEnabled:    boolean;
  pin:           string | null;
  refreshPin:    () => void;

  // ── Duress mode ──────────────────────────────────────────────────────────
  isDuress:      boolean;       // true = app is in decoy mode right now
  enterDuress:   () => void;    // called by AppLockGate when duress PIN entered
  exitDuress:    () => void;    // called by AppLockGate when real PIN entered
}

const AppContext = createContext<AppContextType>({
  accent:      '#00d68f',
  accentKey:   'green',
  setAccent:   () => {},
  pinEnabled:  false,
  pin:         null,
  refreshPin:  () => {},
  isDuress:    false,
  enterDuress: () => {},
  exitDuress:  () => {},
});

// ── Provider props ────────────────────────────────────────────────────────────
interface AppProviderProps {
  children:     React.ReactNode;
  onPinChange?: (pin: string | null) => void;
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function AppProvider({ children, onPinChange }: AppProviderProps) {
  const [accentKey, setAccentKey] = useState<AccentColor>('green');
  const [pin, setPin]             = useState<string | null>(null);

  // ── Duress state ─────────────────────────────────────────────────────────
  // Initialised from persisted storage so it survives app restarts
  const [isDuress, setIsDuress]   = useState<boolean>(false);

  // ── Load saved settings on mount ─────────────────────────────────────────
  useEffect(() => {
    loadTheme().then((t) => setAccentKey(t.accent));

    loadPin().then((savedPin) => {
      setPin(savedPin);
      onPinChange?.(savedPin);
    });

    // Restore duress mode if it was active before the app was killed
    // This is the key to duress persisting across restarts
    getDuressActive().then((active) => {
      if (active) {
        setIsDuress(true);
      }
    });
  }, []);

  // ── Accent color ──────────────────────────────────────────────────────────
  const setAccent = useCallback(async (key: AccentColor) => {
    setAccentKey(key);
    await saveTheme({ accent: key });
  }, []);

  // ── PIN refresh ───────────────────────────────────────────────────────────
  const refreshPin = useCallback(() => {
    loadPin().then((newPin) => {
      setPin(newPin);
      onPinChange?.(newPin);
    });
  }, [onPinChange]);

  // ── Duress: enter decoy mode ──────────────────────────────────────────────
  // Called by AppLockGate when verifyPin returns isDuress: true
  // Also persists the flag so it survives app kill
  const enterDuress = useCallback(async () => {
    await setDuressActive(true);   // persist to AsyncStorage
    setIsDuress(true);             // update React state
  }, []);

  // ── Duress: exit decoy mode ───────────────────────────────────────────────
  // Called by AppLockGate when the real PIN is entered
  // Real data becomes visible again immediately
  const exitDuress = useCallback(async () => {
    await setDuressActive(false);  // clear from AsyncStorage
    setIsDuress(false);            // update React state
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppContext.Provider
      value={{
        accent:      ACCENT_COLORS[accentKey],
        accentKey,
        setAccent,
        pinEnabled:  pin !== null,
        pin,
        refreshPin,
        isDuress,
        enterDuress,
        exitDuress,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useAppContext() {
  return useContext(AppContext);
}