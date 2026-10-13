export interface SessionData {
  token: string;
  playerId: string;
  username: string;
  matchId?: string;
  roomCode?: string;
  isCreator?: boolean;
}

const STORAGE_KEY = 'in-filtrados-session';

// initialScreen decide a dónde ir al cargar la página (S3-01).
export function initialScreen(
  data: SessionData | null,
): 'login' | 'lobby' | 'game' {
  if (!data?.token) return 'login';
  return data.matchId ? 'game' : 'lobby';
}

export const session = {
  saveSession(data: SessionData): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('No se pudo guardar la sesión en localStorage', error);
    }
  },

  loadSession(): SessionData | null {
    try {
      const item = localStorage.getItem(STORAGE_KEY);
      if (!item) return null;
      return JSON.parse(item) as SessionData;
    } catch (error) {
      console.warn('No se pudo leer la sesión de localStorage', error);
      return null;
    }
  },

  clearSession(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('No se pudo limpiar la sesión de localStorage', error);
    }
  },
};
