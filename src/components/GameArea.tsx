/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, RotateCcw, Monitor, Users, Globe, Send, MessageCircleCode, Smile } from "lucide-react";
import { BoardState, GameState, User } from "../types";
import { playSound } from "../utils/audio";

interface GameAreaProps {
  mode: "single" | "local" | "online";
  user: User | null;
  soundVolume: number;
  onlineRoom: any | null; // From websocket matching
  onlineSymbol: "X" | "O" | null;
  onSendMove: (cellIndex: number) => void;
  onSendRestart: () => void;
  onSendChat: (content: string) => void;
  onExit: () => void;
  chatMessages: { sender: string; content: string; time: number }[];
  difficulty?: "easy" | "medium" | "hard";
}

const WINNING_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

function getOutcome(board: BoardState): { winner: string | null; line: number[] | null } {
  for (const combo of WINNING_LINES) {
    const [a, b, c] = combo;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: combo };
    }
  }
  const isFull = board.every((cell) => cell !== null);
  return { winner: isFull ? "draw" : null, line: null };
}

function minimax(board: BoardState, depth: number, isMaximizing: boolean): { score: number; index?: number } {
  const check = getOutcome(board);
  if (check.winner === "O") return { score: 10 - depth };
  if (check.winner === "X") return { score: depth - 10 };
  if (check.winner === "draw") return { score: 0 };

  const available = board.map((val, idx) => val === null ? idx : null).filter((v) => v !== null) as number[];

  if (isMaximizing) {
    let bestScore = -Infinity;
    let bestIndex = -1;
    for (const idx of available) {
      board[idx] = "O";
      const { score } = minimax(board, depth + 1, false);
      board[idx] = null;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = idx;
      }
    }
    return { score: bestScore, index: bestIndex };
  } else {
    let bestScore = Infinity;
    let bestIndex = -1;
    for (const idx of available) {
      board[idx] = "X";
      const { score } = minimax(board, depth + 1, true);
      board[idx] = null;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = idx;
      }
    }
    return { score: bestScore, index: bestIndex };
  }
}

function getMediumMove(board: BoardState): number {
  // 1. Can bot "O" win immediately?
  for (let i = 0; i < 9; i++) {
    if (board[i] === null) {
      const tempBoard = [...board];
      tempBoard[i] = "O";
      if (getOutcome(tempBoard).winner === "O") {
        return i;
      }
    }
  }

  // 2. Can player "X" win immediately? If so, block it!
  for (let i = 0; i < 9; i++) {
    if (board[i] === null) {
      const tempBoard = [...board];
      tempBoard[i] = "X";
      if (getOutcome(tempBoard).winner === "X") {
        return i;
      }
    }
  }

  // 3. Play center if open
  if (board[4] === null) return 4;

  // 4. Play any open corner
  const corners = [0, 2, 6, 8];
  const openCorners = corners.filter((c) => board[c] === null);
  if (openCorners.length > 0) {
    return openCorners[Math.floor(Math.random() * openCorners.length)];
  }

  // 5. Play any random open cell
  const openCells = board.map((v, i) => v === null ? i : null).filter((v) => v !== null) as number[];
  return openCells[Math.floor(Math.random() * openCells.length)];
}

export default function GameArea({
  mode,
  user,
  soundVolume,
  onlineRoom,
  onlineSymbol,
  onSendMove,
  onSendRestart,
  onSendChat,
  onExit,
  chatMessages,
  difficulty = "easy",
}: GameAreaProps) {
  // Local (and Robot) Game State
  const [localBoard, setLocalBoard] = useState<BoardState>(() => {
    const saved = sessionStorage.getItem("local_board");
    return saved ? JSON.parse(saved) : Array(9).fill(null);
  });
  const [localTurn, setLocalTurn] = useState<"X" | "O">(
    () => (sessionStorage.getItem("local_turn") as "X" | "O") || "X"
  );
  const [localWinner, setLocalWinner] = useState<string | null>(
    () => sessionStorage.getItem("local_winner") || null
  ); // "X", "O", "draw", or null
  const [localWinningLine, setLocalWinningLine] = useState<number[] | null>(() => {
    const saved = sessionStorage.getItem("local_winning_line");
    return saved ? JSON.parse(saved) : null;
  });
  
  // Scoreboard tracking for current session
  const [sessionWinsX, setSessionWinsX] = useState(() => {
    const saved = sessionStorage.getItem("session_wins_x");
    return saved ? parseInt(saved, 10) : 0;
  });
  const [sessionWinsO, setSessionWinsO] = useState(() => {
    const saved = sessionStorage.getItem("session_wins_o");
    return saved ? parseInt(saved, 10) : 0;
  });
  const [sessionDraws, setSessionDraws] = useState(() => {
    const saved = sessionStorage.getItem("session_draws");
    return saved ? parseInt(saved, 10) : 0;
  });

  // Chat/Emoji drawer parameters
  const [chatInput, setChatInput] = useState("");
  const [isEmojiTrayOpen, setIsEmojiTrayOpen] = useState(false);

  const [timeLeft, setTimeLeft] = useState<string>("");
  const [isExpired, setIsExpired] = useState<boolean>(false);

  const clearSessionStorage = () => {
    sessionStorage.removeItem("local_board");
    sessionStorage.removeItem("local_turn");
    sessionStorage.removeItem("local_winner");
    sessionStorage.removeItem("local_winning_line");
  };

  // Sync board state & scores to sessionStorage
  useEffect(() => {
    sessionStorage.setItem("local_board", JSON.stringify(localBoard));
    sessionStorage.setItem("local_turn", localTurn);
    if (localWinner) {
      sessionStorage.setItem("local_winner", localWinner);
    } else {
      sessionStorage.removeItem("local_winner");
    }
    if (localWinningLine) {
      sessionStorage.setItem("local_winning_line", JSON.stringify(localWinningLine));
    } else {
      sessionStorage.removeItem("local_winning_line");
    }
    sessionStorage.setItem("session_wins_x", sessionWinsX.toString());
    sessionStorage.setItem("session_wins_o", sessionWinsO.toString());
    sessionStorage.setItem("session_draws", sessionDraws.toString());
  }, [localBoard, localTurn, localWinner, localWinningLine, sessionWinsX, sessionWinsO, sessionDraws]);

  // 10-Minute Countdown Timer for Online Rooms
  useEffect(() => {
    if (mode !== "online" || !onlineRoom || !onlineRoom.expiresAt) {
      setTimeLeft("");
      setIsExpired(false);
      return;
    }

    const updateTimer = () => {
      const diff = onlineRoom.expiresAt - Date.now();
      if (diff <= 0) {
        setTimeLeft("00:00");
        setIsExpired(true);
        return;
      }

      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      const formatted = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
      setTimeLeft(formatted);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [mode, onlineRoom]);

  const EMOJI_PRESETS = ["🎯", "🔥", "😂", "👑", "🤝", "😭", "😮", "🤖"];

  // Reset internal local match
  const handleLocalReset = () => {
    playSound("click", soundVolume);
    setLocalBoard(Array(9).fill(null));
    setLocalTurn("X");
    setLocalWinner(null);
    setLocalWinningLine(null);
    clearSessionStorage();
  };

  // Play a move
  const handleCellClick = (idx: number) => {
    if (mode === "online") {
      // In online mode, moves are sent to the WebSocket server for validation & broadcast
      if (!onlineRoom || onlineRoom.state.status !== "playing") return;
      if (onlineRoom.state.turn !== (user?.uid || "")) return; // Not your turn
      if (onlineRoom.state.board[idx] !== null) return; // Occupied

      playSound("place", soundVolume);
      onSendMove(idx);
      return;
    }

    // Local / Single match handling
    if (localBoard[idx] !== null || localWinner) return;

    const currentSymbol = localTurn;
    const newBoard = [...localBoard];
    newBoard[idx] = currentSymbol;
    playSound("place", soundVolume);
    setLocalBoard(newBoard);

    const check = getOutcome(newBoard);
    if (check.winner) {
      setLocalWinner(check.winner);
      setLocalWinningLine(check.line);
      if (check.winner === "draw") {
        setSessionDraws((d) => d + 1);
        playSound("draw", soundVolume);
      } else {
        if (check.winner === "X") setSessionWinsX((w) => w + 1);
        else setSessionWinsO((w) => w + 1);
        playSound("win", soundVolume);
      }
    } else {
      setLocalTurn(currentSymbol === "X" ? "O" : "X");
    }
  };

  // Robot Algorithm turn logic
  useEffect(() => {
    if (mode !== "single" || localTurn !== "O" || localWinner) return;

    // Simulate Robot choosing moves using easy, medium, or hard algorithms
    const timer = setTimeout(() => {
      const availableCells = localBoard
        .map((val, idx) => (val === null ? idx : null))
        .filter((val) => val !== null) as number[];

      if (availableCells.length === 0) return;

      let chosenIndex = -1;
      if (difficulty === "easy") {
        const randomIdx = Math.floor(Math.random() * availableCells.length);
        chosenIndex = availableCells[randomIdx];
      } else if (difficulty === "medium") {
        chosenIndex = getMediumMove(localBoard);
      } else {
        const best = minimax(localBoard, 0, true);
        chosenIndex = best.index !== undefined ? best.index : availableCells[0];
      }

      // Execute AI Move
      const newBoard = [...localBoard];
      newBoard[chosenIndex] = "O";
      playSound("place", soundVolume);
      setLocalBoard(newBoard);

      const check = getOutcome(newBoard);
      if (check.winner) {
        setLocalWinner(check.winner);
        setLocalWinningLine(check.line);
        if (check.winner === "draw") {
          setSessionDraws((d) => d + 1);
          playSound("draw", soundVolume);
        } else {
          setSessionWinsO((w) => w + 1);
          playSound("win", soundVolume);
        }
      } else {
        setLocalTurn("X");
      }
    }, 600); // realistic slight response lag for AI

    return () => clearTimeout(timer);
  }, [localTurn, localWinner, mode, localBoard, difficulty]);

  // Online game status mappings
  const isOnlineWin = mode === "online" && onlineRoom?.state.status === "ended";
  const onlineWinnerUID = mode === "online" && onlineRoom?.state.winner;
  const onlineWinnerLine = mode === "online" && onlineRoom?.state.winningLine;

  const currentBoard = mode === "online" ? (onlineRoom?.state.board || Array(9).fill(null)) : localBoard;
  const currentWinner = mode === "online" ? onlineRoom?.state.winner : localWinner;
  const currentWinningStreak = mode === "online" ? onlineWinnerLine : localWinningLine;

  // Compute status lines
  let statusMessage = "";
  let highlightTurn = false;

  const isXActive = mode === "online"
    ? (onlineRoom?.state.status === "playing" && onlineRoom?.state.turn === onlineRoom?.state.playerX.uid)
    : (!localWinner && localTurn === "X");
  const isOActive = mode === "online"
    ? (onlineRoom?.state.status === "playing" && onlineRoom?.state.turn === onlineRoom?.state.playerO?.uid)
    : (!localWinner && localTurn === "O");

  if (mode === "online" && onlineRoom) {
    const state = onlineRoom.state;
    if (state.status === "waiting") {
      statusMessage = "Inviting Friend... Match code: " + onlineRoom.code;
    } else if (state.status === "playing") {
      const isMyTurn = state.turn === (user?.uid || "");
      const activeLabel = state.turn === state.playerX.uid ? "Player 1 (X)" : "Player 2 (O)";
      statusMessage = isMyTurn ? `Your Turn (${onlineSymbol})` : `${activeLabel} Turn`;
      highlightTurn = isMyTurn;
    } else if (state.status === "ended") {
      if (state.winner === "draw") {
        statusMessage = "Game ends in a Draw!";
      } else {
        const isMeWinner = state.winner === (user?.uid || "");
        if (isMeWinner) {
          statusMessage = "🏆 Victory! You won the match";
        } else {
          const winnerLabel = state.winner === state.playerX.uid ? "Player 1 (X)" : "Player 2 (O)";
          statusMessage = `${winnerLabel} won the match`;
        }
      }
    }
  } else {
    // Single / Local match
    if (localWinner) {
      if (localWinner === "draw") {
        statusMessage = "It's a Draw!";
      } else {
        statusMessage = mode === "single" 
          ? (localWinner === "X" ? "🏆 You Won!" : "🤖 Robot Won!")
          : `Player ${localWinner === "X" ? "1 (X)" : "2 (O)"} Won!`;
      }
    } else {
      statusMessage = mode === "single"
        ? (localTurn === "X" ? "Your Turn" : "Robot Turn...")
        : `Turn: Player ${localTurn === "X" ? "1 (X)" : "2 (O)"}`;
      highlightTurn = localTurn === "X";
    }
  }

  const handleSendChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendChat(chatInput.trim());
    setChatInput("");
  };

  const getSenderDisplayName = (sender: string) => {
    if (mode === "online" && onlineRoom) {
      if (sender === onlineRoom.state.playerX.username) {
        return onlineRoom.state.playerX.uid === user?.uid ? "Player 1 (You)" : "Player 1";
      }
      if (onlineRoom.state.playerO && sender === onlineRoom.state.playerO.username) {
        return onlineRoom.state.playerO.uid === user?.uid ? "Player 2 (You)" : "Player 2";
      }
    }
    return sender;
  };

  const handleEmojiClick = (emoji: string) => {
    playSound("click", soundVolume);
    onSendChat(emoji);
    setIsEmojiTrayOpen(false);
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-2 py-4">
      {/* Navigation and Title Row */}
      <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800 mb-6 gap-2 flex-wrap sm:flex-nowrap">
        <button
          id="exit-game-area-btn"
          onClick={() => {
            playSound("click", soundVolume);
            clearSessionStorage();
            // Also let's clear the persistent session wins
            sessionStorage.removeItem("session_wins_x");
            sessionStorage.removeItem("session_wins_o");
            sessionStorage.removeItem("session_draws");
            onExit();
          }}
          className="flex items-center gap-1 sm:gap-1.5 rounded-xl border border-slate-200 px-2.5 sm:px-4 py-1.5 sm:py-2 text-[11px] sm:text-xs font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300 transition-all hover:bg-slate-50 dark:hover:bg-slate-900 hover:scale-[1.03] active:scale-[0.97] duration-155 whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          <span className="hidden xs:inline">Leave Match</span>
          <span className="inline xs:hidden">Leave</span>
        </button>

        <div className="flex items-center gap-2 sm:gap-3 min-w-0 justify-end flex-wrap sm:flex-nowrap">
          {mode === "online" && timeLeft && (
            <div className="flex items-center gap-1 bg-rose-500/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-extrabold shadow-sm border border-rose-500/20 shrink-0">
              <span className="h-1 sm:h-1.5 w-1 sm:w-1.5 rounded-full bg-rose-500 animate-ping"></span>
              <span className="hidden xs:inline">Expires in {timeLeft}</span>
              <span className="inline xs:hidden">{timeLeft}</span>
            </div>
          )}

          <div className="flex items-center gap-1 sm:gap-1.5 text-slate-500 dark:text-slate-400 shrink-0">
            {mode === "single" && <Monitor className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500 animate-pulse" />}
            {mode === "local" && <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500 animate-pulse" />}
            {mode === "online" && <Globe className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500 animate-pulse" />}
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">
              <span className="hidden sm:inline">
                {mode === "single" 
                  ? `Vs Robot (${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)})` 
                  : mode === "local" 
                  ? "Pass & Play" 
                  : "10-Min Room"}
              </span>
              <span className="inline sm:hidden">
                {mode === "single" 
                  ? `Bot (${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)})` 
                  : mode === "local" 
                  ? "Local" 
                  : "Online"}
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Playable Arena Column */}
        <div className="md:col-span-7 flex flex-col items-center">
          
          {/* GORGEOUS PLAYER VS PLAYER CARD PANEL */}
          <div className="w-full max-w-sm mb-4 bg-slate-900/60 border border-slate-850 rounded-2xl p-3 flex items-center justify-between shadow-md relative overflow-hidden">
            {/* Background glows */}
            <div className="absolute inset-0 pointer-events-none opacity-20">
              <div className="absolute top-0 left-0 w-1/2 h-full bg-blue-500/10 blur-xl"></div>
              <div className="absolute top-0 right-0 w-1/2 h-full bg-rose-500/10 blur-xl"></div>
            </div>

            {/* Player X Info */}
            <div className={`flex-1 flex flex-col items-start min-w-0 z-10 p-1 sm:p-2 rounded-xl border transition-all duration-200 ${isXActive ? "border-blue-500/35 bg-blue-500/5 shadow-[0_0_12px_rgba(59,130,246,0.15)]" : "border-transparent"}`}>
              <div className="flex items-center gap-1 sm:gap-1.5 max-w-full">
                <span className="text-[9px] sm:text-[10px] font-black uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1 sm:px-1.5 py-0.5 rounded shrink-0">X</span>
                <span className="text-[10px] sm:text-xs font-bold text-slate-200 truncate">
                  {mode === "online" ? (
                    onlineRoom?.state.playerX.uid === user?.uid ? (
                      <>
                        <span className="hidden sm:inline">Player 1 (You)</span>
                        <span className="inline sm:hidden">P1 (You)</span>
                      </>
                    ) : (
                      <>
                        <span className="hidden sm:inline">Player 1</span>
                        <span className="inline sm:hidden">P1</span>
                      </>
                    )
                  ) : "Player 1"}
                </span>
              </div>
              <span className="text-[8px] sm:text-[9px] text-slate-400 truncate mt-0.5 font-mono max-w-[65px] sm:max-w-[100px]">
                {mode === "online" 
                  ? onlineRoom?.state.playerX.username 
                  : mode === "single" 
                  ? user?.username 
                  : "Local Play"}
              </span>
              {mode === "online" && (
                <span className="text-[8px] sm:text-[9px] text-blue-400 font-semibold mt-0.5">
                  Elo: {onlineRoom?.state.playerX.rating}
                </span>
              )}
            </div>

            {/* VS Divider with central scores */}
            <div className="flex flex-col items-center px-1.5 sm:px-3 shrink-0 z-10">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">VS</span>
              {mode === "online" ? (
                <div className="flex items-center gap-1 bg-slate-950 px-1.5 sm:px-2.5 py-0.5 rounded-full border border-slate-805 text-[10px] sm:text-[11px] font-black font-mono text-slate-350 mt-1" title={`Draws: ${onlineRoom?.state.draws || 0}`}>
                  <span>{onlineRoom?.state.scoreX || 0}</span>
                  <span className="text-slate-650">:</span>
                  <span>{onlineRoom?.state.scoreO || 0}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 bg-slate-950 px-1.5 sm:px-2.5 py-0.5 rounded-full border border-slate-800 text-[10px] sm:text-[11px] font-black font-mono text-slate-350 mt-1">
                  <span>{sessionWinsX}</span>
                  <span className="text-slate-650">:</span>
                  <span>{sessionWinsO}</span>
                </div>
              )}
            </div>

            {/* Player O Info */}
            <div className={`flex-1 flex flex-col items-end min-w-0 z-10 p-1 sm:p-2 rounded-xl border transition-all duration-200 ${isOActive ? "border-rose-500/35 bg-rose-500/5 shadow-[0_0_12px_rgba(244,63,94,0.15)]" : "border-transparent"}`}>
              <div className="flex items-center gap-1 sm:gap-1.5 max-w-full">
                <span className="text-[10px] sm:text-xs font-bold text-slate-200 truncate">
                  {mode === "online" ? (
                    onlineRoom?.state.playerO ? (
                      onlineRoom.state.playerO.uid === user?.uid ? (
                        <>
                          <span className="hidden sm:inline">Player 2 (You)</span>
                          <span className="inline sm:hidden">P2 (You)</span>
                        </>
                      ) : (
                        <>
                          <span className="hidden sm:inline">Player 2</span>
                          <span className="inline sm:hidden">P2</span>
                        </>
                      )
                    ) : (
                      <>
                        <span className="hidden sm:inline">Waiting...</span>
                        <span className="inline sm:hidden">Wait...</span>
                      </>
                    )
                  ) : mode === "single"
                  ? "Robot"
                  : "Player 2"}
                </span>
                <span className="text-[9px] sm:text-[10px] font-black uppercase bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1 sm:px-1.5 py-0.5 rounded shrink-0">O</span>
              </div>
              <span className="text-[8px] sm:text-[9px] text-slate-400 truncate mt-0.5 font-mono max-w-[65px] sm:max-w-[100px]">
                {mode === "online" 
                  ? (onlineRoom?.state.playerO?.username || "Connecting...") 
                  : mode === "single" 
                  ? `AI (${difficulty.toUpperCase()})` 
                  : "Local Play"}
              </span>
              {mode === "online" && onlineRoom?.state.playerO && (
                <span className="text-[8px] sm:text-[9px] text-rose-400 font-semibold mt-0.5">
                  Elo: {onlineRoom.state.playerO.rating}
                </span>
              )}
            </div>
          </div>

          {/* Active status Banner */}
          <div className="mb-4 text-center">
            <motion.h4
              animate={{ scale: highlightTurn ? [1, 1.03, 1] : 1 }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className={`text-sm font-bold tracking-tight rounded-full px-5 py-1.5 ${
                highlightTurn
                  ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                  : "text-slate-700 dark:text-slate-350"
              }`}
            >
              {statusMessage}
            </motion.h4>
          </div>

          {/* Core Interactive Board Grid (Touch area exceeds 44px boundaries) */}
          <div className="relative aspect-square w-full max-w-sm rounded-2xl bg-slate-100 p-4 border border-slate-200/50 dark:bg-[#0B1120]/45 dark:border-slate-800 shadow-md overflow-hidden">
            
            {/* Expiry overlay */}
            {isExpired && (
              <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center text-center p-6 z-30 space-y-4">
                <h3 className="text-xl font-black text-rose-500 uppercase tracking-wider">Room Expired!</h3>
                <p className="text-xs text-slate-350 max-w-xs leading-relaxed">
                  This room has reached its 10-minute active lifetime limit and has been automatically terminated.
                </p>
                <button
                  onClick={onExit}
                  className="rounded-xl bg-blue-600 hover:bg-blue-500 py-2.5 px-6 text-xs font-bold text-white transition-all duration-150 shadow-md shadow-blue-500/20"
                >
                  Return to Lobby
                </button>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 h-full w-full">
              {currentBoard.map((cellValue, idx) => {
                const isSelectedCellInWinLine = currentWinningStreak?.includes(idx);
                return (
                  <button
                    key={idx}
                    id={`grid-cell-${idx}`}
                    onClick={() => handleCellClick(idx)}
                    className={`relative flex items-center justify-center rounded-xl bg-white shadow-xs transition-all duration-150 touch-manipulation hover:scale-102 hover:shadow-md dark:bg-slate-900 border border-slate-150 dark:border-slate-800 ${
                      isSelectedCellInWinLine
                        ? "bg-blue-600 text-white dark:bg-blue-500 border-blue-500"
                        : "text-slate-800 dark:text-slate-100"
                    }`}
                    style={{ minHeight: "84px" }}
                    disabled={
                      (mode === "online" && onlineRoom?.state.status !== "playing") ||
                      (mode === "online" && onlineRoom?.state.turn !== user?.uid)
                    }
                  >
                    {cellValue && (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.2 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`font-sans font-black text-4xl select-none ${
                          isSelectedCellInWinLine
                            ? "text-white"
                            : cellValue === "X"
                            ? "text-blue-500 font-sans tracking-tighter"
                            : "text-rose-500 font-sans"
                        }`}
                      >
                        {cellValue}
                      </motion.span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Score Counter summary */}
          {mode !== "online" && (
            <div className="mt-6 flex justify-around w-full max-w-sm bg-zinc-50 dark:bg-zinc-950/35 p-3.5 rounded-xl text-center border border-zinc-100 dark:border-zinc-850">
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400">Wins (X)</p>
                <p className="text-sm font-mono font-bold text-zinc-900 dark:text-zinc-50 mt-0.5">{sessionWinsX}</p>
              </div>
              <div className="border-r border-zinc-200/60 dark:border-zinc-800"></div>
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400">Draws</p>
                <p className="text-sm font-mono font-bold text-zinc-900 dark:text-zinc-50 mt-0.5">{sessionDraws}</p>
              </div>
              <div className="border-r border-zinc-200/60 dark:border-zinc-800"></div>
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400">Wins (O)</p>
                <p className="text-sm font-mono font-bold text-zinc-900 dark:text-zinc-50 mt-0.5">{sessionWinsO}</p>
              </div>
            </div>
          )}

          {/* Interactive Actions Overlay */}
          {currentWinner && (
            <div className="mt-5 w-full max-w-sm space-y-2.5">
              {mode === "online" ? (
                /* Online Match Rematches controls */
                <div className="rounded-xl bg-blue-50/50 p-4 border border-blue-100 text-center dark:bg-[#0B1120]/60 dark:border-slate-800">
                  {onlineRoom.state.rematchRequestedBy ? (
                    onlineRoom.state.rematchRequestedBy === user?.uid ? (
                      <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Waiting for opponent to accept rematch...</p>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-xs text-blue-700 dark:text-blue-300 font-semibold font-sans">
                          {onlineRoom.state.rematchRequestedBy === onlineRoom.state.playerX.uid ? "Player 1" : "Player 2"} requested a rematch!
                        </p>
                        <button
                          id="accept-online-rematch-btn"
                          onClick={() => {
                            playSound("click", soundVolume);
                            onSendRestart();
                          }}
                          className="w-full rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white transition-all hover:bg-blue-500 hover:scale-[1.02] active:scale-[0.98] duration-155 shadow-md shadow-blue-500/10"
                        >
                          Accept Rematch Offer
                        </button>
                      </div>
                    )
                  ) : (
                    <button
                      id="request-online-rematch-btn"
                      onClick={() => {
                        playSound("click", soundVolume);
                        onSendRestart();
                      }}
                      className="w-full rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white transition-all hover:bg-blue-500 hover:scale-[1.02] active:scale-[0.98] duration-155 shadow-md shadow-blue-500/10"
                    >
                      Offer Game Rematch
                    </button>
                  )}
                </div>
              ) : (
                /* Local & Single match resets */
                <button
                  id="local-rematch-btn"
                  onClick={handleLocalReset}
                  className="flex items-center justify-center gap-2 w-full rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white transition-all hover:bg-blue-500 hover:scale-[1.02] active:scale-[0.98] duration-155 shadow-md shadow-blue-500/10"
                >
                  <RotateCcw className="h-4 w-4" />
                  Play Again
                </button>
              )}
            </div>
          )}
        </div>

        {/* Dynamic Communication Socket Chat Drawer (Online matches only) */}
        {mode === "online" && (
          <div className="md:col-span-5 w-full flex flex-col h-96 md:h-[432px] bg-white rounded-xl border border-slate-200 dark:bg-[#0B1120]/45 dark:border-slate-800 p-4 shadow-sm overflow-hidden">
            <h5 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b pb-2 mb-3 flex items-center gap-1.5 dark:border-slate-800">
              <MessageCircleCode className="h-4 w-4 text-blue-500" />
              Room Live Chat & Taunts
            </h5>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 text-xs">
              {chatMessages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-zinc-400 dark:text-zinc-600">
                  No chat messages yet.
                </div>
              ) : (
                chatMessages.map((msg, i) => {
                  return (
                    <div
                      key={i}
                      className={`max-w-[85%] rounded-xl px-3 py-1.5 ${
                        msg.sender === (user?.username || "Guest")
                          ? "ml-auto bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                      }`}
                    >
                      <p className="text-[9px] font-bold text-slate-550 dark:text-slate-400">
                        {getSenderDisplayName(msg.sender)}
                      </p>
                      <p className="mt-0.5 leading-relaxed font-sans font-medium text-xs break-all text-slate-850 dark:text-slate-100">
                        {msg.content}
                      </p>
                    </div>
                  );
                })
              )}
            </div>

            {/* Emoji and taunts triggers row */}
            <div className="relative mt-3">
              <AnimatePresence>
                {isEmojiTrayOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute bottom-12 left-0 right-0 bg-slate-50 dark:bg-[#0B1120] p-2 rounded-xl grid grid-cols-4 gap-2 border border-slate-200 dark:border-slate-800 shadow-md"
                  >
                    {EMOJI_PRESETS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => handleEmojiClick(emoji)}
                        className="text-lg hover:scale-125 transition-transform py-1 rounded-md"
                      >
                        {emoji}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Input Form */}
              <form onSubmit={handleSendChatSubmit} className="flex gap-2">
                <button
                  id="emoji-tray-btn"
                  type="button"
                  onClick={() => {
                    playSound("click", soundVolume);
                    setIsEmojiTrayOpen(!isEmojiTrayOpen);
                  }}
                  className="rounded-lg p-2 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 transition-all hover:bg-slate-200 dark:hover:bg-slate-700 hover:scale-108 active:scale-92 duration-155"
                  title="Emoji list"
                >
                  <Smile className="h-4 w-4" />
                </button>
                <input
                  id="chat-input-text"
                  type="text"
                  placeholder="Type taunts..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 dark:border-slate-800 dark:bg-[#0B1120] dark:text-white"
                />
                <button
                  id="send-chat-payload-btn"
                  type="submit"
                  className="rounded-lg bg-blue-600 p-2 text-white transition-all hover:bg-blue-500 hover:scale-108 active:scale-92 duration-155"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
