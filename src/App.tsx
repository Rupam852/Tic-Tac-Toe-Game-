/// <reference types="vite/client" />
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sliders,
  Play,
  Monitor,
  Users,
  Globe,
  BellRing,
  CheckCircle,
  XCircle,
  X,
  Plus,
  ArrowRight,
  Sparkles,
  Share2,
  Copy
} from "lucide-react";
import { User, UserSettings, GameRoom } from "./types";
import { playSound } from "./utils/audio";
import SettingsMenu from "./components/SettingsMenu";
import GameArea from "./components/GameArea";

export default function App() {
  // Navigation & Mode States
  const [activeView, setActiveView] = useState<"landing" | "menu">(
    () => (sessionStorage.getItem("active_view") as "landing" | "menu") || "landing"
  );
  const [activeGameMode, setActiveGameMode] = useState<"single" | "local" | "online" | null>(() => {
    const saved = sessionStorage.getItem("active_game_mode");
    if (saved === "single" || saved === "local") {
      return saved as "single" | "local";
    }
    return null;
  });

  // Bot Difficulty Settings
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">(
    () => (sessionStorage.getItem("bot_difficulty") as "easy" | "medium" | "hard") || "easy"
  );
  const [showDifficultyModal, setShowDifficultyModal] = useState(false);

  // Anonymous Guest Profile State
  const [user, setUser] = useState<User | null>(null);

  // App Preference Settings
  const [settings, setSettings] = useState<UserSettings>({
    darkMode: true,
    soundVolume: 0.5,
    hapticFeedback: true,
  });
  const [showSettings, setShowSettings] = useState(false);

  // Toast Notifications State
  const [toasts, setToasts] = useState<{ id: string; type: "success" | "error" | "info"; text: string }[]>([]);

  // WebSocket & Online Room States
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [onlineRoom, setOnlineRoom] = useState<GameRoom | null>(null);
  const [onlineSymbol, setOnlineSymbol] = useState<"X" | "O" | null>(null);
  const [joiningCode, setJoiningCode] = useState("");
  const [lobbyOnlineCount, setLobbyOnlineCount] = useState(1);
  const [chatMessages, setChatMessages] = useState<{ sender: string; content: string; time: number }[]>([]);
  const [showPrivateRoomModal, setShowPrivateRoomModal] = useState(false);

  const socketReconnectTimer = useRef<NodeJS.Timeout | null>(null);

  // Toast helper function
  const addToast = (text: string, type: "success" | "error" | "info" = "info") => {
    const id = Date.now().toString() + Math.random().toString();
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4000);
  };

  // Sync Preferences to document
  useEffect(() => {
    const html = document.documentElement;
    if (settings.darkMode) {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }
    localStorage.setItem("game_prefs", JSON.stringify(settings));
  }, [settings]);

  // Sync activeView to sessionStorage
  useEffect(() => {
    sessionStorage.setItem("active_view", activeView);
  }, [activeView]);

  // Sync activeGameMode to sessionStorage
  useEffect(() => {
    if (activeGameMode) {
      sessionStorage.setItem("active_game_mode", activeGameMode);
    } else {
      sessionStorage.removeItem("active_game_mode");
    }
  }, [activeGameMode]);

  // Sync difficulty to sessionStorage
  useEffect(() => {
    sessionStorage.setItem("bot_difficulty", difficulty);
  }, [difficulty]);

  // Load Saved Preferences and Initialize Guest Profile on Mount
  useEffect(() => {
    const savedPrefs = localStorage.getItem("game_prefs");
    if (savedPrefs) {
      try {
        setSettings(JSON.parse(savedPrefs));
      } catch (e) {}
    }

    let savedUser = localStorage.getItem("game_user");
    if (!savedUser) {
      const guestNum = Math.floor(1000 + Math.random() * 9000);
      const randomId = "u_" + Math.random().toString(36).substring(2, 11);
      const initialGuest: User = {
        uid: randomId,
        username: `Gamer_${guestNum}`,
        email: "",
        rating: 1200,
        wins: 0,
        losses: 0,
        draws: 0,
        twoFactorEnabled: false,
        createdAt: new Date().toISOString()
      };
      localStorage.setItem("game_user", JSON.stringify(initialGuest));
      setUser(initialGuest);
    } else {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        const guestNum = Math.floor(1000 + Math.random() * 9000);
        const randomId = "u_" + Math.random().toString(36).substring(2, 11);
        const initialGuest = {
          uid: randomId,
          username: `Gamer_${guestNum}`,
          rating: 1200,
          wins: 0,
          losses: 0,
          draws: 0
        } as any;
        localStorage.setItem("game_user", JSON.stringify(initialGuest));
        setUser(initialGuest);
      }
    }
  }, []);

  // Sync / Establish connection with global WebSocket Server
  useEffect(() => {
    if (!user) return;

    const backendUrl = import.meta.env.VITE_BACKEND_URL || window.location.origin;
    const socketUrl = backendUrl.replace(/^http/, "ws") + "/ws";

    let ws: WebSocket;

    const connectWS = () => {
      ws = new WebSocket(socketUrl);

      ws.onopen = () => {
        setSocket(ws);
        console.log("WebSocket connection established with gaming backend");
        
        ws.send(JSON.stringify({
          type: "register_socket",
          payload: { user }
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          const { type, payload } = message;

          switch (type) {
            case "lobby_info":
              setLobbyOnlineCount(payload.onlineCount);
              break;

            case "room_created":
              setOnlineRoom(payload.room);
              setOnlineSymbol(payload.symbol);
              setShowPrivateRoomModal(true);
              setChatMessages([]);
              addToast("Private Room Created! Share Code to invite.", "success");
              break;

            case "room_joined":
              playSound("win", settings.soundVolume);
              setOnlineRoom(payload.room);
              setShowPrivateRoomModal(false);
              setActiveGameMode("online");
              if (payload.room.state.playerO?.uid === user?.uid) {
                setOnlineSymbol("O");
              } else if (payload.room.state.playerX.uid === user?.uid) {
                setOnlineSymbol("X");
              }
              setChatMessages([]);
              addToast("Opponent Joined! Match Started.", "success");
              break;

            case "room_updated":
              setOnlineRoom(payload.room);
              break;

            case "chat_receive":
              playSound("place", settings.soundVolume);
              setChatMessages((prev) => [...prev, { sender: payload.sender, content: payload.content, time: Date.now() }]);
              break;

            case "opponent_disconnected":
              playSound("error", settings.soundVolume);
              addToast("Opponent disconnected. Room closed.", "error");
              setOnlineRoom(null);
              setActiveGameMode(null);
              break;

            case "room_expired":
              playSound("error", settings.soundVolume);
              addToast(payload.message || "This room has expired!", "error");
              setOnlineRoom(null);
              setActiveGameMode(null);
              break;

            case "rematch_request":
              playSound("challenge", settings.soundVolume);
              addToast(`${payload.requesterUsername} requested a Rematch!`, "info");
              break;

            case "user_updated":
              if (payload.user) {
                setUser(payload.user);
                localStorage.setItem("game_user", JSON.stringify(payload.user));
              }
              break;

            case "error":
              playSound("error", settings.soundVolume);
              addToast(payload.message || "An error occurred", "error");
              break;
          }
        } catch (e) {
          console.error("Error reading websocket frame:", e);
        }
      };

      ws.onclose = () => {
        setSocket(null);
        socketReconnectTimer.current = setTimeout(connectWS, 4000);
      };

      ws.onerror = (e) => {
        console.error("WebSocket network socket crashed:", e);
      };
    };

    connectWS();

    return () => {
      if (ws) ws.close();
      if (socketReconnectTimer.current) clearTimeout(socketReconnectTimer.current);
    };
  }, [user?.uid]);

  // Private room creations
  const createPrivateRoom = () => {
    playSound("click", settings.soundVolume);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "create_room" }));
    } else {
      addToast("Server unreachable right now", "error");
    }
  };

  // Join private room with code
  const joinPrivateRoomWithEnteredCode = () => {
    playSound("click", settings.soundVolume);
    if (!joiningCode.trim()) {
      addToast("Please enter a room code", "error");
      return;
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "join_room",
        payload: { code: joiningCode.trim() }
      }));
    } else {
      addToast("Connection issues detected", "error");
    }
  };

  // Send moves to socket
  const sendMoveMessage = (cellIndex: number) => {
    if (socket && socket.readyState === WebSocket.OPEN && onlineRoom) {
      socket.send(JSON.stringify({
        type: "play_move",
        payload: { roomId: onlineRoom.roomId, cellIndex }
      }));
    }
  };

  // Rematch offer
  const sendRematchOffer = () => {
    if (socket && socket.readyState === WebSocket.OPEN && onlineRoom) {
      socket.send(JSON.stringify({
        type: "restart_game",
        payload: { roomId: onlineRoom.roomId }
      }));
    }
  };

  // Send chat taunt
  const sendChatBubble = (content: string) => {
    if (socket && socket.readyState === WebSocket.OPEN && onlineRoom) {
      socket.send(JSON.stringify({
        type: "chat_bubble",
        payload: { roomId: onlineRoom.roomId, content }
      }));
    }
  };

  // Copy code helper
  const handleCopyCode = async () => {
    playSound("click", settings.soundVolume);
    if (!onlineRoom) return;
    try {
      await navigator.clipboard.writeText(onlineRoom.code);
      addToast(`Code ${onlineRoom.code} copied successfully!`, "success");
    } catch (err) {
      addToast("Failed to copy room code", "error");
    }
  };

  // Share link helper
  const handleShareInvite = async () => {
    playSound("click", settings.soundVolume);
    if (!onlineRoom) return;
    const inviteText = `Play Tic-Tac-Toe Live with me! 🎮\n\nRoom Code: ${onlineRoom.code}\nJoin here: ${window.location.origin}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Tic-Tac-Toe Live Match Invite",
          text: inviteText,
          url: window.location.origin
        });
        addToast("Invitation shared successfully!", "success");
      } catch (err) {
        console.log("Web Share Error:", err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(inviteText);
        addToast("Invite copied to clipboard! Paste it to share.", "success");
      } catch (err) {
        addToast("Failed to copy invitation message", "error");
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 font-sans antialiased overflow-x-hidden selection:bg-blue-600/30 selection:text-blue-300 transition-colors duration-200">
      
      {/* Background soft glowing design elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/5 dark:bg-blue-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: "8s" }}></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500/5 dark:bg-purple-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: "12s" }}></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#00000003_1px,transparent_1px),linear-gradient(to_bottom,#00000003_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:40px_40px]"></div>
      </div>

      {/* Floating toasts container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 50, y: -10 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, x: 50 }}
              className="flex items-center gap-3 rounded-2xl bg-slate-900/90 border border-slate-800 p-4 shadow-2xl backdrop-blur-md pointer-events-auto"
            >
              {toast.type === "success" && <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />}
              {toast.type === "error" && <XCircle className="h-5 w-5 text-rose-400 shrink-0" />}
              {toast.type === "info" && <BellRing className="h-5 w-5 text-blue-400 shrink-0" />}
              <span className="text-xs font-semibold text-slate-200">
                {toast.text}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Sticky Premium Header navigation */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-950/85 border-b border-slate-200 dark:border-slate-900 backdrop-blur-md transition-colors duration-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div
            onClick={() => {
              playSound("click", settings.soundVolume);
              setActiveGameMode(null);
              setActiveView("landing");
            }}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="bg-blue-600 flex h-9 w-9 items-center justify-center rounded-xl font-black text-white shadow-lg shadow-blue-500/20 group-hover:scale-105 active:scale-95 transition-transform duration-150">
              X
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5 leading-none italic select-none">
                Tic-Tac-Toe
                <span className="text-transparent bg-clip-text bg-linear-to-r from-blue-400 to-indigo-400 not-italic font-extrabold text-[10px] tracking-wide uppercase bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-800">
                  Live
                </span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {activeView !== "landing" && (
              <button
                id="open-settings-overlay"
                onClick={() => {
                  playSound("click", settings.soundVolume);
                  setShowSettings(true);
                }}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-2.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-all hover:scale-[1.05] active:scale-[0.95] shadow-xs"
                title="Preferences"
              >
                <Sliders className="h-4.5 w-4.5" />
              </button>
            )}

            {/* Guest Badge */}
            {user && (
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 p-1 rounded-xl shadow-xs shrink-0 max-w-[130px] sm:max-w-none">
                <div className="flex items-center gap-1 sm:gap-2 px-1.5 sm:px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-350 min-w-0">
                  <span className="h-1.5 sm:h-2 w-1.5 sm:w-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                  <span className="hidden sm:inline truncate max-w-[80px]">{user.username}</span>
                  <span className="inline sm:hidden font-bold">You</span>
                  <span className="text-[10px] text-blue-500 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 px-1 sm:px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-500/5 whitespace-nowrap shrink-0">
                    {user.rating}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container Views */}
      <main className="max-w-6xl mx-auto px-4 py-8 relative z-10 min-h-[calc(100vh-140px)] flex flex-col justify-center">
        
        {/* Private Room Waiting Code Modal */}
        <AnimatePresence>
          {showPrivateRoomModal && onlineRoom && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-4"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative space-y-6"
              >
                {/* Close Button */}
                <button
                  id="close-private-room-modal"
                  onClick={() => {
                    playSound("click", settings.soundVolume);
                    if (onlineRoom && socket && socket.readyState === WebSocket.OPEN) {
                      socket.send(JSON.stringify({
                        type: "leave_room",
                        payload: { roomId: onlineRoom.roomId }
                      }));
                    }
                    setShowPrivateRoomModal(false);
                    setOnlineRoom(null);
                  }}
                  className="absolute top-4 right-4 rounded-xl p-1.5 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>

                {/* Header */}
                <div className="text-center space-y-2">
                  <div className="mx-auto h-12 w-12 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-400 shadow-md border border-blue-500/20">
                    <Users className="h-6 w-6 animate-pulse" />
                  </div>
                  <h3 className="text-base font-extrabold text-white">
                    Invite Your Friend!
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Share this unique 6-digit room code. The room has a strict 10-minute lifetime once matchmaking begins!
                  </p>
                </div>

                {/* Room Code Display */}
                <div className="flex flex-col items-center justify-center bg-slate-950 border border-slate-800/80 p-5 rounded-2xl space-y-3 shadow-inner">
                  <span className="text-[10px] font-bold text-slate-500 tracking-widest uppercase">
                    ROOM JOIN CODE
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl font-black font-mono tracking-wider text-blue-400">
                      {onlineRoom.code}
                    </span>
                    <button
                      id="copy-room-code-btn"
                      onClick={handleCopyCode}
                      className="rounded-lg p-2 bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-all duration-150"
                      title="Copy Code"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Sharing and Action Buttons */}
                <div className="space-y-2.5">
                  <button
                    id="share-invite-btn"
                    onClick={handleShareInvite}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 py-3 text-xs font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98] duration-150 shadow-lg shadow-blue-500/15"
                  >
                    <Share2 className="h-4 w-4" />
                    Share Invitation Link
                  </button>

                  <div className="flex flex-col gap-2 p-3 bg-slate-950/60 border border-slate-850 rounded-xl mt-2 text-left">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-medium">Player 1 (Host - You)</span>
                      <span className="font-bold text-blue-400">{user?.username}</span>
                    </div>
                    <div className="border-t border-slate-900 my-1"></div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-medium flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping"></span>
                        Player 2 (Guest)
                      </span>
                      <span className="font-semibold text-slate-500 italic">Waiting for connection...</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Difficulty Selector Modal */}
        <AnimatePresence>
          {showDifficultyModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="w-full max-w-sm bg-slate-900 border border-slate-850 rounded-3xl p-6 shadow-2xl relative space-y-6"
              >
                <button
                  onClick={() => setShowDifficultyModal(false)}
                  className="absolute top-4 right-4 text-slate-450 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>

                <div className="text-center space-y-2">
                  <div className="mx-auto h-12 w-12 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-400 border border-blue-500/20">
                    <Monitor className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-extrabold text-white">Select Robot Difficulty</h3>
                  <p className="text-xs text-slate-400">Choose your match challenge below</p>
                </div>

                <div className="grid grid-cols-1 gap-3.5">
                  {(["easy", "medium", "hard"] as const).map((diff) => (
                    <button
                      key={diff}
                      onClick={() => {
                        playSound("click", settings.soundVolume);
                        setDifficulty(diff);
                        setShowDifficultyModal(false);
                        setActiveGameMode("single");
                      }}
                      className="group flex items-center justify-between rounded-xl bg-slate-950 border border-slate-850 p-4 hover:border-blue-500/60 hover:bg-slate-900 transition-all duration-150 text-left"
                    >
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-205 group-hover:text-blue-400">
                          {diff} Mode
                        </h4>
                        <p className="text-[10px] text-slate-450 mt-1">
                          {diff === "easy" && "Plays purely random, simple moves."}
                          {diff === "medium" && "Plays smart offensive / defensive blocking moves."}
                          {diff === "hard" && "Unbeatable. Powered by the Minimax algorithm."}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-500 group-hover:translate-x-1 transition-transform" />
                    </button>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {activeGameMode ? (
          /* Active Gameplay Area Screen */
          <GameArea
            mode={activeGameMode}
            user={user}
            soundVolume={settings.soundVolume}
            onlineRoom={onlineRoom}
            onlineSymbol={onlineSymbol}
            onSendMove={sendMoveMessage}
            onSendRestart={sendRematchOffer}
            onSendChat={sendChatBubble}
            onExit={() => {
              playSound("click", settings.soundVolume);
              if (activeGameMode === "online" && onlineRoom) {
                if (socket && socket.readyState === WebSocket.OPEN) {
                  socket.send(JSON.stringify({
                    type: "leave_room",
                    payload: { roomId: onlineRoom.roomId }
                  }));
                }
              }
              setOnlineRoom(null);
              setActiveGameMode(null);
            }}
            chatMessages={chatMessages}
            difficulty={difficulty}
          />
        ) : (
          /* Main Views */
          <div>
            {activeView === "landing" && (
              <div className="flex flex-col items-center justify-center text-center space-y-12 max-w-xl mx-auto py-8">
                
                {/* Hero Headers */}
                <div className="space-y-6">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5 }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-blue-400 border border-blue-500/20 mb-3"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                    State of the Art Gaming Portal
                  </motion.div>

                  <motion.h2
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.5 }}
                    className="text-4xl sm:text-6xl font-black tracking-tight leading-none text-slate-900 dark:text-white font-sans uppercase italic"
                  >
                    Tic-Tac-Toe <br />
                    <span className="text-transparent bg-clip-text bg-linear-to-r from-blue-400 via-indigo-400 to-purple-400 not-italic font-black">
                      Arena
                    </span>
                  </motion.h2>

                  <motion.p
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                    className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm leading-relaxed max-w-md mx-auto"
                  >
                    Experience real-time offline training against our recursive Minimax bot, pass-and-play matches, and dynamic 10-minute self-deleting WebSocket rooms.
                  </motion.p>
                </div>

                {/* Gorgeous glowing PLAY ARENA CTA Button */}
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.5 }}
                  className="w-full flex justify-center"
                >
                  <button
                    onClick={() => {
                      playSound("click", settings.soundVolume);
                      setActiveView("menu");
                    }}
                    className="group relative rounded-2xl bg-blue-600 px-10 py-5 text-sm font-black uppercase tracking-widest text-white shadow-[0_0_30px_rgba(59,130,246,0.3)] hover:shadow-[0_0_40px_rgba(59,130,246,0.55)] transition-all hover:scale-[1.05] active:scale-[0.95] duration-200"
                  >
                    <div className="absolute inset-0 bg-linear-to-r from-blue-500 to-indigo-500 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-0"></div>
                    <span className="relative z-10 flex items-center justify-center gap-3">
                      <Play className="h-5 w-5 fill-white text-white" />
                      PLAY ARENA
                    </span>
                  </button>
                </motion.div>
              </div>
            )}

            {activeView === "menu" && (
              <div className="space-y-8 max-w-4xl mx-auto">
                <div className="pb-3 border-b border-slate-200 dark:border-slate-900">
                  <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                    Lobby Menu
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-450 mt-1">Select a game mode to start playing immediately. Zero auth required.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                  
                  {/* Local / Bot Options Cards */}
                  <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-5">
                    
                    {/* Bot Mode Card */}
                    <div className="group rounded-2xl bg-white dark:bg-slate-900/60 p-4.5 sm:p-6 border border-slate-200 dark:border-slate-850 hover:border-blue-500/60 hover:shadow-lg hover:shadow-blue-500/5 hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between shadow-xs">
                      <div>
                        <div className="bg-blue-500/10 h-11 w-11 rounded-xl flex items-center justify-center text-blue-400 mb-4 border border-blue-500/20">
                          <Monitor className="h-5 w-5" />
                        </div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-400 transition-colors">Practice VS Bot</h3>
                          <span className="text-[10px] bg-blue-500/10 text-blue-400 font-bold px-2 py-0.5 rounded-full">AI</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400 mt-2">
                           Train offline against Easy, Medium heuristics, or an unbeatable recursive Minimax Hard bot.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          playSound("click", settings.soundVolume);
                          setShowDifficultyModal(true);
                        }}
                        className="mt-6 w-full rounded-xl bg-slate-100 dark:bg-slate-950 py-3 text-xs font-bold text-blue-500 dark:text-blue-400 border border-slate-200 dark:border-slate-850 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 dark:hover:text-white transition-all hover:scale-[1.02] active:scale-[0.98] duration-150 flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        Start Practicing
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </button>
                    </div>

                    {/* Local Mode Card */}
                    <div className="group rounded-2xl bg-white dark:bg-slate-900/60 p-4.5 sm:p-6 border border-slate-200 dark:border-slate-850 hover:border-rose-500/60 hover:shadow-lg hover:shadow-rose-500/5 hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between shadow-xs">
                      <div>
                        <div className="bg-rose-500/10 h-11 w-11 rounded-xl flex items-center justify-center text-rose-400 mb-4 border border-rose-500/20">
                          <Users className="h-5 w-5" />
                        </div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-rose-400 transition-colors">Play Local</h3>
                          <span className="text-[10px] bg-rose-500/10 text-rose-400 font-bold px-2 py-0.5 rounded-full">Pass & Play</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400 mt-2">
                          Pass and play with a friend on the same screen. Full score history keeps tabs on winner ratios.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          playSound("click", settings.soundVolume);
                          setActiveGameMode("local");
                        }}
                        className="mt-6 w-full rounded-xl bg-slate-100 dark:bg-slate-950 py-3 text-xs font-bold text-rose-500 dark:text-rose-400 border border-slate-200 dark:border-slate-850 hover:bg-rose-500 hover:text-white dark:hover:bg-rose-500 dark:hover:text-white transition-all hover:scale-[1.02] active:scale-[0.98] duration-155 flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        Launch Match
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </button>
                    </div>
                  </div>

                  {/* Private Rooms hosting card */}
                  <div className="lg:col-span-5 space-y-6">
                    <div className="rounded-2xl bg-white dark:bg-slate-900/60 p-4.5 sm:p-6 border border-slate-200 dark:border-slate-850 shadow-sm">
                      <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                        10-Min Online Room
                      </h4>
                      
                      <div className="space-y-4">
                        <button
                          onClick={createPrivateRoom}
                          className="w-full text-center rounded-xl bg-slate-100 dark:bg-slate-950 py-3 text-xs font-bold text-slate-700 dark:text-white border border-slate-200 dark:border-slate-850 hover:bg-slate-200 dark:hover:bg-slate-900 hover:scale-[1.02] active:scale-[0.98] transition-all duration-150 flex items-center justify-center gap-1.5"
                        >
                          <Plus className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                          Host New Room
                        </button>

                        <div className="relative flex items-center my-3">
                          <div className="flex-grow border-t border-slate-200 dark:border-slate-850"></div>
                          <span className="flex-shrink mx-3 text-[9px] uppercase font-black text-slate-500 tracking-wider">Or Enter Code</span>
                          <div className="flex-grow border-t border-slate-200 dark:border-slate-850"></div>
                        </div>

                        <div className="flex gap-2">
                          <input
                            type="text"
                            maxLength={6}
                            placeholder="6-letter code"
                            value={joiningCode}
                            onChange={(e) => setJoiningCode(e.target.value.toUpperCase())}
                            className="flex-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-xs text-center font-mono tracking-wider font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <button
                            onClick={joinPrivateRoomWithEnteredCode}
                            className="rounded-xl bg-blue-600 hover:bg-blue-500 px-5 py-2.5 text-xs font-bold text-white transition-all hover:scale-[1.03] active:scale-[0.97] duration-150 shadow-md shadow-blue-500/10"
                          >
                            Join
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-slate-900/40 p-5 border border-slate-900 text-center">
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                        Online Lobby Activity
                      </p>
                      <p className="text-2xl font-black text-blue-400 mt-1 font-mono">
                        {lobbyOnlineCount} Connected
                      </p>
                      <p className="text-[9px] text-slate-500 mt-1">Players online right now globally</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Preferences modal overlay */}
      <AnimatePresence>
        {showSettings && (
          <SettingsMenu
            settings={settings}
            setSettings={setSettings}
            onClose={() => setShowSettings(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
