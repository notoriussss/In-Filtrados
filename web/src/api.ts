import { ERROR_MESSAGES } from './constants';
import type { ShopResponse } from './shop';

export interface AuthResponse {
  token: string;
  playerId: string;
  username: string;
}

export interface RegisterResponse {
  playerId: string;
  username: string;
}

export interface MeResponse {
  playerId: string;
  username: string;
  coins: number;
  matchesPlayed: number;
  wins: number;
  // S2-07: estadísticas como impostor.
  timesImpostor: number;
  winsAsImpostor: number;
}

export interface RoomResponse {
  roomCode: string;
  matchId: string;
}

const BASE_URL = '/api';

async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorMessage: string = ERROR_MESSAGES.SERVER_ERROR;
    try {
      const errorData = await response.json();
      // Tomamos el mensaje de error del backend, o un genérico
      errorMessage = errorData.message || errorData.error || errorMessage;
    } catch {
      errorMessage = response.statusText || errorMessage;
    }
    throw new Error(errorMessage);
  }

  return response.json() as Promise<T>;
}

export const api = {
  async register(
    username: string,
    password: string,
  ): Promise<RegisterResponse> {
    return apiFetch<RegisterResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  async login(username: string, password: string): Promise<AuthResponse> {
    return apiFetch<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  async getMe(token: string): Promise<MeResponse> {
    return apiFetch<MeResponse>('/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },

  async getShop(token: string): Promise<ShopResponse> {
    return apiFetch<ShopResponse>('/shop', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  async buyItem(token: string, itemId: string): Promise<ShopResponse> {
    return apiFetch<ShopResponse>('/shop/buy', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ itemId }),
    });
  },

  async createRoom(token: string): Promise<RoomResponse> {
    return apiFetch<RoomResponse>('/rooms', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },

  async joinRoom(token: string, roomCode: string): Promise<RoomResponse> {
    return apiFetch<RoomResponse>(`/rooms/${roomCode}/join`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },
};
