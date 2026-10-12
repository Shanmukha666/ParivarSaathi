import { useState, useEffect } from 'react';
import { UserProfile } from './types';
import { isSupportedLanguage, type Language } from './i18n';

export interface ExtendedProfile extends Partial<UserProfile> {
  role?: string;
  selectedTradeId?: number;
  selectedTradeName?: string;
  consent?: boolean;
}

interface AppState {
  language: Language;
  sessionId: string | null;
  profile: ExtendedProfile;
  isHydrated: boolean;
}

const STORAGE_KEY = 'parivar_path_state';
const STORAGE_VERSION = 2;

const defaultProfile: ExtendedProfile = {
  state: 'Telangana',
  district: 'Warangal',
  classPassed: 'Class 10 Pass',
  income: '₹1 - 3 Lakhs',
  role: 'both',
  consent: false,
  selectedTradeId: undefined,
  selectedTradeName: undefined,
  interests: [],
};

const defaultState: AppState = {
  language: 'en',
  sessionId: null,
  profile: defaultProfile,
  isHydrated: false,
};

let globalState: AppState = { ...defaultState };
let listeners: Array<(state: AppState) => void> = [];

function persistState() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        language: globalState.language,
        sessionId: globalState.sessionId,
        profile: globalState.profile,
      }),
    );
    // Remove the legacy duplicate so an older value can never win on hydration.
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage is optional; in-memory state remains authoritative for this tab.
  }
}

function setGlobalState(newState: Partial<AppState>) {
  globalState = { ...globalState, ...newState };
  persistState();
  listeners.forEach((listener) => listener(globalState));
}

function setLanguage(lang: string) {
  if (isSupportedLanguage(lang)) setGlobalState({ language: lang });
}

function setSessionId(id: string | null) {
  setGlobalState({ sessionId: id });
}

function updateProfile(updates: Partial<ExtendedProfile>) {
  setGlobalState({
    profile: { ...globalState.profile, ...updates },
  });
}

function setSelectedTrade(id: number, name: string) {
  setGlobalState({
    profile: {
      ...globalState.profile,
      selectedTradeId: id,
      selectedTradeName: name,
    },
  });
}

function resetStore() {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  }
  globalState = {
    ...defaultState,
    profile: { ...defaultProfile },
    isHydrated: true,
  };
  listeners.forEach((listener) => listener(globalState));
}

export function useStore() {
  const [state, setState] = useState<AppState>(globalState);

  useEffect(() => {
    if (typeof window !== 'undefined' && !globalState.isHydrated) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as {
            version?: number;
            language?: string;
            sessionId?: string | null;
            profile?: ExtendedProfile;
          };

          const savedLanguage = isSupportedLanguage(saved.language || '')
            ? saved.language as Language
            : defaultState.language;

          globalState = {
            ...defaultState,
            language: savedLanguage,
            sessionId: saved.sessionId ?? null,
            profile: {
              ...defaultProfile,
              ...(saved.profile || {}),
            },
            isHydrated: true,
          };
        } else {
          globalState = {
            ...globalState,
            profile: { ...defaultProfile },
            isHydrated: true,
          };
        }
        setState({ ...globalState, profile: { ...globalState.profile } });
      } catch (error) {
        console.warn('Storage hydration failed; using defaults', error);
        globalState = {
          ...defaultState,
          profile: { ...defaultProfile },
          isHydrated: true,
        };
        setState({ ...globalState });
      }
    }

    listeners.push(setState);
    return () => {
      listeners = listeners.filter((listener) => listener !== setState);
    };
  }, []);

  return {
    ...state,
    setLanguage,
    setSessionId,
    updateProfile,
    setSelectedTrade,
    resetStore,
  };
}
