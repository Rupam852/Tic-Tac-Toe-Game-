/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface User {
  uid: string;
  username: string;
  email: string;
  rating: number; // Elo-like rating (defaults to 1200)
  wins: number;
  losses: number;
  draws: number;
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  createdAt: string;
}

export type BoardState = (string | null)[]; // 9 cells

export type GameStatus = "waiting" | "playing" | "ended";

export interface GameState {
  board: BoardState;
  turn: string; // Player UID whose turn it is
  winner: string | null; // UID of winner or 'draw' or null
  winningLine: number[] | null; // e.g. [0, 1, 2]
  status: GameStatus;
  playerX: { uid: string; username: string; rating: number };
  playerO: { uid: string; username: string; rating: number } | null;
  mode: "single" | "local" | "online";
  rematchRequestedBy?: string | null; // User UID
  scoreX?: number;
  scoreO?: number;
  draws?: number;
}

export interface GameRoom {
  roomId: string;
  code: string; // 6-digit alphanumeric room joining code
  creatorId: string;
  state: GameState;
  createdAt: number;
  expiresAt?: number; // 10-minute expiry timestamp
}

export interface MatchHistoryItem {
  id: string;
  playerX: string;
  playerO: string;
  winner: string | null; // UID of winner or 'draw'
  mode: "single" | "local" | "online";
  ratingChangeX?: number;
  ratingChangeO?: number;
  createdAt: string;
}

export interface LeaderboardEntry {
  uid: string;
  username: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  rank?: number;
}

export interface UserSettings {
  darkMode: boolean;
  soundVolume: number; // 0 to 1
  hapticFeedback: boolean;
}
