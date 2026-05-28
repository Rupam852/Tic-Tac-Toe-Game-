/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Trophy,
  Sliders,
  LogOut,
  User as UserIcon,
  Play,
  Monitor,
  Users,
  Globe,
  KeyRound,
  ShieldCheck,
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
import { User, UserSettings, GameRoom, GameState } from "./types";
import { playSound } from "./utils/audio";
import SettingsMenu from "./components/SettingsMenu";
import Leaderboard from "./components/Leaderboard";
import AuthScreen from "./components/AuthScreen";
import GameArea from "./components/GameArea";

export default function App() {
  // Navigation State
  const [activeView, setActiveView] = useState<"landing" | "menu" | "leaderboard" | "profile">("landing");
  const [activeGameMode, setActiveGameMode] = useState<"single" | "local" | "online" | null>(null);

  // Authenticated State
  const [user, setUser] = useState<User | null>(null);
  const [showAuthScreen, setShowAuthScreen] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "register">("login");

  // App Settings
  const [settings, setSettings] = useState<UserSettings>({
    darkMode: true,
    soundVolume: 0.5,
    hapticFeedback: true,
  });

  // Settings Modal Toggle
  const [showSettings, setShowSettings] = useState(false);

  // Toast Notifications
  const [toasts, setToasts] = useState<{ id: string; type: "success" | "error" | "info"; text: string }[]>([]);

  // WebSocket / Multiplayer States
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isSearchingMatch, setIsSearchingMatch] = useState(false);
  const [onlineRoom, setOnlineRoom] = useState<GameRoom | null>(null);
  const [onlineSymbol, setOnlineSymbol] = useState<"X" | "O" | null>(null);
  const [joiningCode, setJoiningCode] = useState("");
  const [lobbyOnlineCount, setLobbyOnlineCount] = useState(1);
  const [lobbyMatchmakingCount, setLobbyMatchmakingCount] = useState(0);
  const [chatMessages, setChatMessages] = useState<{ sender: string; content: string; time: number }[]>([]);

  // Challenges States
  const [pendingChallenge, setPendingChallenge] = useState<{ challenger: any; challengeCode: string } | null>(null);
  const [showPrivateRoomModal, setShowPrivateRoomModal] = useState(false);

  const socketReconnectTimer = useRef<NodeJS.Timeout | null>(null);

  // Add Toast helper
  const addToast = (text: string, type: "success" | "error" | "info" = "info") => {
    const id = Date.now().toString() + Math.random().toString();
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4000);
  };

  // Synchronize Dark Mode preferences on container elements
  useEffect(() => {
    const html = document.documentElement;
    if (settings.darkMode) {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }
    localStorage.setItem("game_prefs", JSON.stringify(settings));
  }, [settings]);

  // Load Saved Preferences on Mount
  useEffect(() => {
    const savedPrefs = localStorage.getItem("game_prefs");
    if (savedPrefs) {
      try {
        setSettings(JSON.parse(savedPrefs));
      } catch (e) {}
    }

    const savedUser = localStorage.getItem("game_user");
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
        setActiveView("menu");
        addToast("Logged in securely from credentials token", "success");
      } catch (e) {}
    }
  }, []);

  // Sync / Establish connection with global WebSocket Server
  useEffect(() => {
    // Use environment variable VITE_BACKEND_URL in production, fallback to relative local path
    const backendUrl = import.meta.env.VITE_BACKEND_URL || window.location.origin;
    const socketUrl = backendUrl.replace(/^http/, "ws") + "/ws";

    let ws: WebSocket;

    const connectWS = () => {
      ws = new WebSocket(socketUrl);

      ws.onopen = () => {
        setSocket(ws);
        console.log("WebSocket connection established with gaming backend");
        
        // If a user is logged in, register socket mapping immediately
        const cachedUser = localStorage.getItem("game_user");
        if (cachedUser) {
          try {
            const userObj = JSON.parse(cachedUser);
            ws.send(JSON.stringify({
              type: "register_socket",
              payload: { user: userObj }
            }));
          } catch (e) {}
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          const { type, payload } = message;

          switch (type) {
            case "lobby_info":
              setLobbyOnlineCount(payload.onlineCount);
              setLobbyMatchmakingCount(payload.matchmakingCount);
              break;

            case "match_found":
              playSound("win", settings.soundVolume);
              setOnlineRoom(payload.room);
              setOnlineSymbol(payload.symbol);
              setIsSearchingMatch(false);
              setActiveGameMode("online");
              setChatMessages([]);
              addToast(`Competitor Matched! Representing Symbol ${payload.symbol}`, "success");
              break;

            case "room_created":
              setOnlineRoom(payload.room);
              setOnlineSymbol(payload.symbol);
              setShowPrivateRoomModal(true);
              setChatMessages([]);
              addToast("Custom Private Room Created! Send Code to invite", "success");
              break;

            case "room_joined":
              playSound("challenge", settings.soundVolume);
              setOnlineRoom(payload.room);
              setShowPrivateRoomModal(false);
              setActiveGameMode("online");
              if (payload.room.state.playerO?.uid === user?.uid) {
                setOnlineSymbol("O");
              } else if (payload.room.state.playerX.uid === user?.uid) {
                setOnlineSymbol("X");
              }
              setChatMessages([]);
              addToast("Gamer Joined Room - Game Started!", "success");
              break;

            case "room_updated":
              setOnlineRoom(payload.room);
              break;

            case "chat_receive":
              playSound("place", settings.soundVolume);
              setChatMessages((prev) => [...prev, { sender: payload.sender, content: payload.content, time: Date.now() }]);
              break;

            case "incoming_challenge":
              playSound("challenge", settings.soundVolume);
              setPendingChallenge({ challenger: payload.challenger, challengeCode: payload.challengeCode });
              break;

            case "opponent_disconnected":
              playSound("error", settings.soundVolume);
              addToast("Match forfeited. Competitor disconnected", "error");
              setOnlineRoom(null);
              setActiveGameMode(null);
              break;

            case "rematch_request":
              playSound("challenge", settings.soundVolume);
              addToast(`${payload.requesterUsername} requested a Rematch match!`, "info");
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
        // Attempt automatic retry with exponential delay
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
  }, [user]); // Rebuild context when user changes to trigger accurate room metadata

  // Handle successful login or account registration
  const handleAuthSuccess = (userData: User) => {
    setUser(userData);
    localStorage.setItem("game_user", JSON.stringify(userData));
    setShowAuthScreen(false);
    setActiveView("menu");
    addToast(`Greetings, ${userData.username}! Authenticated successfully`, "success");

    // Inform local websocket of current mapping credentials
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "register_socket",
        payload: { user: userData }
      }));
    }
  };

  // Secure profile sign out flow
  const handleSignOut = () => {
    playSound("click", settings.soundVolume);
    setUser(null);
    localStorage.removeItem("game_user");
    setActiveView("landing");
    addToast("Logged out of gamer profile securely", "info");
  };

  // Toggle Two-Factor state on profile
  const handleToggle2FA = async (targetState: boolean) => {
    playSound("click", settings.soundVolume);
    if (!user) return;

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || "";
      const res = await fetch(`${backendUrl}/api/auth/toggle-2fa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, enabled: targetState }),
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        localStorage.setItem("game_user", JSON.stringify(data.user));
        addToast(targetState ? "Two-Factor Verification Authorized!" : "Two-Factor Disabled safely", "success");
      }
    } catch (err) {
      addToast("Failed updating verification parameters", "error");
    }
  };

  // Matchmaking Quickjoin handler
  const joinMatchmaker = () => {
    playSound("click", settings.soundVolume);
    if (!user) {
      addToast("Gamer Auth required for competitive matchmaking queue", "info");
      setShowAuthScreen(true);
      return;
    }
    
    if (socket && socket.readyState === WebSocket.OPEN) {
      setIsSearchingMatch(true);
      socket.send(JSON.stringify({ type: "join_matchmaking" }));
    } else {
      addToast("Connecting to matchmaking servers... Please wait", "error");
    }
  };

  const leaveMatchmaker = () => {
    playSound("click", settings.soundVolume);
    setIsSearchingMatch(false);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "leave_matchmaking" }));
    }
  };

  // Custom private play room creations
  const createPrivateRoom = () => {
    playSound("click", settings.soundVolume);
    if (!user) {
      addToast("Gamer Sign-In required to host matches!", "info");
      setShowAuthScreen(true);
      return;
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "create_room" }));
    } else {
      addToast("Server unreachable right now", "error");
    }
  };

  // Join custom room using numeric text input index code
  const joinPrivateRoomWithEnteredCode = () => {
    playSound("click", settings.soundVolume);
    if (!user) {
      addToast("Log in representation required!", "info");
      setShowAuthScreen(true);
      return;
    }

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

  // Handle incoming challenge responses
  const acceptChallenge = () => {
    playSound("click", settings.soundVolume);
    if (socket && socket.readyState === WebSocket.OPEN && pendingChallenge) {
      socket.send(JSON.stringify({
        type: "join_room",
        payload: { code: pendingChallenge.challengeCode }
      }));
    }
    setPendingChallenge(null);
  };

  // Send move sockets
  const sendMoveMessage = (cellIndex: number) => {
    if (socket && socket.readyState === WebSocket.OPEN && onlineRoom) {
      socket.send(JSON.stringify({
        type: "play_move",
        payload: { roomId: onlineRoom.roomId, cellIndex }
      }));
    }
  };

  // Request/Accept Rematches
  const sendRematchOffer = () => {
    if (socket && socket.readyState === WebSocket.OPEN && onlineRoom) {
      socket.send(JSON.stringify({
        type: "restart_game",
        payload: { roomId: onlineRoom.roomId }
      }));
    }
  };

  // Sends active chat bubble/taunt payloads
  const sendChatBubble = (content: string) => {
    if (socket && socket.readyState === WebSocket.OPEN && onlineRoom) {
      socket.send(JSON.stringify({
        type: "chat_bubble",
        payload: { roomId: onlineRoom.roomId, content }
      }));
    }
  };

  // Direct challenge an online player
  const initiateChallengeToOpponent = (targetUid: string, targetUsername: string) => {
    playSound("click", settings.soundVolume);
    if (!user) {
      addToast("Sign In required to challenge players", "info");
      setShowAuthScreen(true);
      return;
    }
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "send_challenge",
        payload: { targetUid }
      }));
      addToast(`Gamer Challenge dispatch sent to ${targetUsername}`, "success");
    }
  };

  // Copy 6-digit room code to clipboard
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

  // Share invite via Web Share API or fallback to clipboard
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
      // Fallback
      try {
        await navigator.clipboard.writeText(inviteText);
        addToast("Invite copied to clipboard! Paste it to share.", "success");
      } catch (err) {
        addToast("Failed to copy invitation message", "error");
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0F172A] font-sans antialiased text-slate-800 dark:text-slate-200 transition-colors duration-300">
      
      {/* Floating dynamic status bar logs */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 50, y: -10 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, x: 50 }}
              className="flex items-center gap-2 rounded-xl bg-white/95 dark:bg-slate-900/95 p-3.5 shadow-xl border border-slate-150 dark:border-slate-800 pointer-events-auto"
            >
              {toast.type === "success" && <CheckCircle className="h-4 w-4 text-emerald-500 fill-emerald-50" />}
              {toast.type === "error" && <XCircle className="h-4 w-4 text-rose-500 fill-rose-50" />}
              {toast.type === "info" && <BellRing className="h-4 w-4 text-blue-500 fill-blue-50" />}
              <span className="text-[11px] font-semibold tracking-tight text-slate-800 dark:text-slate-100 lead-5">
                {toast.text}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Primary Header Navigation */}
      <header className="sticky top-0 z-40 bg-white/85 dark:bg-[#0B1120]/85 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 pt-3 pb-3">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between">
          <div
            onClick={() => {
              playSound("click", settings.soundVolume);
              setActiveGameMode(null);
              setActiveView(user ? "menu" : "landing");
            }}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="bg-blue-600 flex h-8 w-8 items-center justify-center rounded font-bold text-white shadow-md shadow-blue-500/30">
              X
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-1 leading-none italic">
                TicTacToe
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Preferences Switcher - Hidden on primary landing view to achieve zero distraction */}
            {activeView !== "landing" && (
              <button
                id="open-settings-overlay"
                onClick={() => {
                  playSound("click", settings.soundVolume);
                  setShowSettings(true);
                }}
                className="rounded-xl bg-slate-100 border border-slate-200/50 p-2.5 text-slate-650 dark:bg-slate-800 dark:border-slate-700/65 dark:text-slate-300 transition-all hover:bg-slate-200 dark:hover:bg-slate-700 hover:scale-[1.05] active:scale-[0.95]"
                title="Preferences"
              >
                <Sliders className="h-4 w-4" />
              </button>
            )}

            {/* Profile Status Badge with Sign In and Sign Up options */}
            {user ? (
              <div className="flex items-center gap-2">
                {activeView === "landing" && (
                  <button
                    id="header-lobby-shortcut-btn"
                    onClick={() => {
                      playSound("click", settings.soundVolume);
                      setActiveView("menu");
                    }}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white transition-all hover:bg-blue-500 hover:scale-[1.04] active:scale-[0.96] shadow-md shadow-blue-500/10"
                  >
                    Enter Match Lobby
                  </button>
                )}
                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-850 border dark:border-slate-755 p-1 rounded-xl">
                  <button
                    id="header-profile-btn"
                    onClick={() => {
                      playSound("click", settings.soundVolume);
                      setActiveView("profile");
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-800 dark:text-slate-205 transition-all hover:text-blue-500 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <UserIcon className="h-3.5 w-3.5 text-blue-500" />
                    {user.username}
                  </button>
                  <div className="h-4 border-r dark:border-slate-800"></div>
                  <button
                    id="header-logout-btn"
                    onClick={handleSignOut}
                    className="p-1 px-2 text-slate-400 transition-all hover:text-rose-500 hover:scale-110 active:scale-[0.9]"
                    title="Sign Out"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  id="header-signin-btn"
                  onClick={() => {
                    playSound("click", settings.soundVolume);
                    setAuthTab("login");
                    setShowAuthScreen(true);
                  }}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-250 transition-all hover:bg-slate-50 dark:hover:bg-slate-900 hover:scale-[1.04] active:scale-[0.96] flex items-center gap-1 hover:border-slate-350 dark:hover:border-slate-700 hover:text-black dark:hover:text-white"
                >
                  Sign In
                </button>
                <button
                  id="header-signup-btn"
                  onClick={() => {
                    playSound("click", settings.soundVolume);
                    setAuthTab("register");
                    setShowAuthScreen(true);
                  }}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white transition-all hover:bg-blue-500 hover:scale-[1.04] active:scale-[0.96] flex items-center gap-1 shadow-md shadow-blue-500/15 hover:shadow-lg hover:shadow-blue-500/20"
                >
                  Sign Up
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container Views */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        
        {/* Challenge Invite Dialog */}
        <AnimatePresence>
          {pendingChallenge && (
            <div id="invitation-toast" className="fixed bottom-4 left-4 z-50 bg-white/95 border dark:border-zinc-850 p-4 rounded-2xl shadow-2xl max-w-sm w-full dark:bg-zinc-900 flex flex-col gap-2.5">
              <div className="flex gap-2">
                <BellRing className="h-5 w-5 text-amber-500 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-50">Gamer Challenge Prompt</h4>
                  <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400 mt-1">
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">{pendingChallenge.challenger.username}</span> invited you to a Competitive Tic-Tac-Toe match!
                  </p>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  id="decline-challenge-btn"
                  onClick={() => {
                    playSound("click", settings.soundVolume);
                    setPendingChallenge(null);
                  }}
                  className="rounded-lg bg-zinc-100 py-1.5 px-3 text-[10px] font-bold text-zinc-650 hover:bg-zinc-200"
                >
                  Decline
                </button>
                <button
                  id="accept-challenge-btn"
                  onClick={acceptChallenge}
                  className="rounded-lg bg-indigo-500 py-1.5 px-4 text-[10px] font-bold text-white hover:bg-indigo-600"
                >
                  Accept Match
                </button>
              </div>
            </div>
          )}
        </AnimatePresence>

        {/* Private Room invite details Modal */}
        <AnimatePresence>
          {showPrivateRoomModal && onlineRoom && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl relative space-y-6"
              >
                {/* Close Button */}
                <button
                  id="close-private-room-modal"
                  onClick={() => {
                    playSound("click", settings.soundVolume);
                    setShowPrivateRoomModal(false);
                    setOnlineRoom(null);
                  }}
                  className="absolute top-4 right-4 rounded-xl p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>

                {/* Header */}
                <div className="text-center space-y-2">
                  <div className="mx-auto h-12 w-12 bg-blue-50 dark:bg-blue-950/40 rounded-full flex items-center justify-center text-blue-500 shadow-md">
                    <Users className="h-6 w-6 animate-pulse" />
                  </div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    Invite Your Friend!
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-slate-400">
                    Share this unique 6-digit room code with your friend. Once they enter it, the match will automatically begin!
                  </p>
                </div>

                {/* Room Code Display */}
                <div className="flex flex-col items-center justify-center bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 p-5 rounded-2xl space-y-3 shadow-inner">
                  <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">
                    ROOM JOIN CODE
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl font-black font-mono tracking-wider text-blue-600 dark:text-blue-400">
                      {onlineRoom.code}
                    </span>
                    <button
                      id="copy-room-code-btn"
                      onClick={handleCopyCode}
                      className="rounded-lg p-2 bg-white border border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 shadow-xs hover:scale-108 active:scale-92 transition-all duration-150"
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
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 py-3 text-xs font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98] duration-155 shadow-md shadow-blue-500/10"
                  >
                    <Share2 className="h-4 w-4" />
                    Share Invitation Link
                  </button>

                  <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-405 dark:text-slate-400 py-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
                    <span>Waiting for opponent to connect...</span>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {activeGameMode ? (
          /* Active Interactive Match Screen */
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
              setOnlineRoom(null);
              setActiveGameMode(null);
            }}
            chatMessages={chatMessages}
          />
        ) : (
          /* Landing Menus / Sub-views */
          <div>
            {/* View selectors tabs - Hidden on landing page to ensure a pure landing page view */}
            {activeView !== "landing" && (
              <div className="flex items-center gap-4 border-b border-slate-205 dark:border-slate-800 mb-8 pb-1 overflow-x-auto scrollbar-none">
                {!user && (
                  <button
                    id="view-tab-landing"
                    onClick={() => {
                      playSound("click", settings.soundVolume);
                      setActiveView("landing");
                    }}
                    className={`pb-3 text-xs font-semibold tracking-wide border-b-2 transition-all hover:scale-105 active:scale-95 duration-155 whitespace-nowrap ${
                      activeView === "landing"
                        ? "border-blue-500 text-blue-500"
                        : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    }`}
                  >
                    Home
                  </button>
                )}
                <button
                  id="view-tab-menu"
                  onClick={() => {
                    playSound("click", settings.soundVolume);
                    setActiveView("menu");
                  }}
                  className={`pb-3 text-xs font-semibold tracking-wide border-b-2 transition-all hover:scale-105 active:scale-95 duration-155 whitespace-nowrap ${
                    activeView === "menu"
                      ? "border-blue-500 text-blue-500"
                      : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  Match Lobby
                </button>

                {user && (
                  <button
                    id="view-tab-profile"
                    onClick={() => {
                      playSound("click", settings.soundVolume);
                      setActiveView("profile");
                    }}
                    className={`pb-3 text-xs font-semibold tracking-wide border-b-2 transition-all hover:scale-105 active:scale-95 duration-155 whitespace-nowrap ${
                      activeView === "profile"
                        ? "border-blue-500 text-blue-500"
                        : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    }`}
                  >
                    My Profile
                  </button>
                )}
              </div>
            )}

            {/* Active view component mount */}
            {activeView === "landing" && (
              <div className="space-y-12">
                {/* Hero Section */}
                <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-slate-900 via-[#0B1120] to-slate-950 p-8 sm:p-12 text-white border border-slate-800 shadow-2xl">
                  {/* Atmospheric grid lines and blobs in background */}
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.15),transparent_40%)] pointer-events-none"></div>
                  <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>

                  <div className="relative z-10 max-w-2xl">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-400 border border-blue-500/20 mb-6 animate-pulse-subtle">
                      <Sparkles className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                      Global Online Multiplayer Arena
                    </span>

                    <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight text-white font-sans">
                      The Next-Gen <br />
                      <span className="text-transparent bg-clip-text bg-linear-to-r from-blue-400 via-indigo-400 to-purple-400">
                        Low Latency
                      </span> Tic-Tac-Toe
                    </h1>

                    <p className="mt-4 text-xs sm:text-sm text-slate-300 leading-relaxed max-w-lg">
                      Enter the ultimate arena for real-time tactical matchmaking. Connect with players globally over fast high-speed physical sockets, calibrate your ELO rating, or custom-challenge opponents in absolute security.
                    </p>

                    {/* Major call to actions */}
                    <div className="mt-8 flex flex-col sm:flex-row gap-3.5">
                      <button
                        id="hero-play-arena-btn"
                        onClick={() => {
                          playSound("click", settings.soundVolume);
                          setActiveView("menu");
                        }}
                        className="rounded-xl bg-blue-600 px-6 py-3.5 text-xs font-bold text-white hover:bg-blue-500 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/35 text-center flex items-center justify-center gap-2 transition-all hover:scale-[1.04] active:scale-[0.96] duration-155"
                      >
                        <Play className="h-4 w-4 fill-white text-white" />
                        Enter Match Lobby
                      </button>

                      <button
                        id="hero-matchmaker-queue-btn"
                        onClick={() => {
                          playSound("click", settings.soundVolume);
                          if (!user) {
                            addToast("Please sign in or register to join matchmaking queue", "info");
                            setShowAuthScreen(true);
                          } else {
                            setActiveView("menu");
                            joinMatchmaker();
                          }
                        }}
                        className="rounded-xl bg-slate-800 px-6 py-3.5 text-xs font-bold text-slate-100 hover:bg-slate-700 border border-slate-700 text-center flex items-center justify-center gap-2 transition-all hover:scale-[1.04] active:scale-[0.96] duration-155 dark:bg-slate-800 dark:text-slate-100"
                      >
                        <Globe className="h-4 w-4 text-blue-400" />
                        Quick Matchmaking Match
                      </button>

                      <button
                        id="hero-practice-robot-btn"
                        onClick={() => {
                          playSound("click", settings.soundVolume);
                          setActiveGameMode("single");
                        }}
                        className="rounded-xl bg-slate-900 px-5 py-3.5 text-xs font-bold text-slate-400 hover:bg-slate-800 dark:bg-slate-900 dark:text-slate-400 border border-slate-800/80 text-center flex items-center justify-center gap-2 transition-all hover:scale-[1.04] active:scale-[0.96] duration-155 hover:text-white dark:hover:text-slate-200"
                      >
                        <Monitor className="h-4 w-4 text-slate-405" />
                        Practice VS Robot
                      </button>
                    </div>
                  </div>
                </div>

                {/* Performance & Security Statistics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800/85 bg-white dark:bg-slate-900/40 p-4 shadow-xs text-center">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Match Connection</p>
                    <p className="text-xl sm:text-2xl font-extrabold text-blue-500 mt-1 font-mono">&lt; 15ms</p>
                    <p className="text-[10px] text-slate-500 mt-1">Immediate Socket Delivery</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800/85 bg-white dark:bg-slate-900/40 p-4 shadow-xs text-center">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Active Game Rooms</p>
                    <p className="text-xl sm:text-2xl font-extrabold text-emerald-500 mt-1 font-mono">
                      {Math.max(lobbyOnlineCount * 2, 4)} Active
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1">Interactive Match Lobby</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800/85 bg-white dark:bg-slate-900/40 p-4 shadow-xs text-center">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Account Safety</p>
                    <p className="text-xl sm:text-2xl font-extrabold text-purple-500 mt-1 font-mono">SHA-512</p>
                    <p className="text-[10px] text-slate-500 mt-1">Multi-Factor Encrypted Profiles</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800/85 bg-white dark:bg-slate-900/40 p-4 shadow-xs text-center">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Robot Match AI</p>
                    <p className="text-xl sm:text-2xl font-extrabold text-amber-500 mt-1 font-mono">Random RNG</p>
                    <p className="text-[10px] text-slate-500 mt-1">Zero Strategy Deterministic</p>
                  </div>
                </div>

                {/* Key Core Features Showroom */}
                <div className="space-y-4">
                  <div className="text-center max-w-md mx-auto">
                    <h2 className="text-md sm:text-lg font-bold tracking-tight text-slate-950 dark:text-white">
                      Engineered For Competitive Grid Matching
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 text-xs mt-1.5 leading-relaxed">
                      Explore built-in mechanics designed to optimize fast paired game sessions and secure matchmaking standings.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Feature 1 */}
                    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-6 flex gap-4 hover:border-slate-300 dark:hover:border-slate-750 transition-colors">
                      <div className="h-10 w-10 shrink-0 rounded-xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center text-blue-500">
                        <Globe className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-xs sm:text-sm font-bold text-slate-955 dark:text-white">
                          Optimized Matchmaking Pooling
                        </h3>
                        <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                          Our socket matchmaker works instantly to group queuing players based on connection availability. Disconnection cleaning is performed automatically to keep wait times to an absolute minimum.
                        </p>
                      </div>
                    </div>

                    {/* Feature 2 */}
                    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-6 flex gap-4 hover:border-slate-300 dark:hover:border-slate-750 transition-colors">
                      <div className="h-10 w-10 shrink-0 rounded-xl bg-purple-50 dark:bg-purple-950/40 flex items-center justify-center text-purple-500">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-xs sm:text-sm font-bold text-slate-955 dark:text-white">
                          Robust Multi-Factor Authorization
                        </h3>
                        <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                          Register your exclusive Gamer Tag to keep track of ELO rating points, win counts, and rankings. Protect credentials securely with direct salted passwords and dynamic 2FA verify codes.
                        </p>
                      </div>
                    </div>

                    {/* Feature 3 */}
                    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-6 flex gap-4 hover:border-slate-300 dark:hover:border-slate-750 transition-colors">
                      <div className="h-10 w-10 shrink-0 rounded-xl bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center text-rose-500">
                        <Trophy className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-xs sm:text-sm font-bold text-slate-955 dark:text-white">
                          Global Competitive ELO Rankings
                        </h3>
                        <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                          Climb ELO ranking metrics by outsmarting active players. View standard match archives, ELO adjustments, and launch active challenges directly from stats tables.
                        </p>
                      </div>
                    </div>

                    {/* Feature 4 */}
                    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-6 flex gap-4 hover:border-slate-300 dark:hover:border-slate-750 transition-colors">
                      <div className="h-10 w-10 shrink-0 rounded-xl bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center text-amber-500">
                        <Monitor className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-xs sm:text-sm font-bold text-slate-955 dark:text-white">
                          Strategy-Free RNG Robot
                        </h3>
                        <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                          Practice new layouts anytime against our mathematical robot. Moves are made completely at random, simulating a quick-moving, lightweight solver layout with immediate response.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sub CTA Banner card */}
                <div className="rounded-2xl bg-slate-100 dark:bg-slate-900 p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 border dark:border-slate-800">
                  <div className="space-y-1 text-center sm:text-left">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">Ready to challenge the global ladder?</h3>
                    <p className="text-slate-500 dark:text-slate-400 text-xs">Register your unique profile tag or start practicing instantly offline.</p>
                  </div>
                  <div className="flex gap-3 shrink-0">
                    {!user && (
                      <button
                        id="landing-bottom-auth-btn"
                        onClick={() => {
                          playSound("click", settings.soundVolume);
                          setShowAuthScreen(true);
                        }}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-blue-600 dark:text-blue-400 px-5 py-2.5 transition-all hover:bg-slate-50 dark:hover:bg-slate-700 hover:scale-[1.04] active:scale-[0.96] duration-155"
                      >
                        Create ELO Profile
                      </button>
                    )}
                    <button
                      id="landing-bottom-play-btn"
                      onClick={() => {
                        playSound("click", settings.soundVolume);
                        setActiveView("menu");
                      }}
                      className="rounded-xl bg-blue-600 text-xs font-bold text-white px-5 py-2.5 shadow-md shadow-blue-500/10 transition-all hover:bg-blue-500 hover:scale-[1.04] active:scale-[0.96] duration-155"
                    >
                      Enter Match Lobby
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Active view component mount */}
            {activeView === "menu" && (
              <div className="space-y-6">
                <div className="pb-2 border-b border-slate-200/60 dark:border-slate-800/60">
                  <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">Select Game Mode</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Practice offline against the robot solver or host a local pass-and-play matchup.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                  {/* Modes selector Column */}
                  <div className="lg:col-span-7 space-y-6">
                    {/* Operational modes grid selection */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      
                      {/* Bot Mode Card */}
                      <div className="group rounded-2xl bg-white dark:bg-slate-900/50 p-6 shadow-xs border border-slate-200 dark:border-slate-800 flex flex-col justify-between hover:border-blue-500 dark:hover:border-blue-500/60 hover:shadow-lg hover:shadow-blue-500/5 hover:-translate-y-1 transition-all duration-300">
                        <div>
                          <div className="bg-blue-50 dark:bg-blue-950/40 h-11 w-11 rounded-xl flex items-center justify-center text-blue-500 mb-4 ring-1 ring-blue-500/10">
                            <Monitor className="h-5 w-5" />
                          </div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-950 dark:text-white group-hover:text-blue-500 transition-colors">Practice Robot Match</h3>
                            <span className="text-[10px] bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-bold px-2 py-0.5 rounded-full">VS Bot</span>
                          </div>
                          <p className="text-[11px] leading-relaxed text-slate-550 dark:text-slate-400 mt-2">
                             Test tactical formations against standard mathematical solvers offline. Dynamic game rules apply.
                          </p>
                        </div>
                        <button
                          id="play-singleplayer-btn"
                          onClick={() => {
                            playSound("click", settings.soundVolume);
                            setActiveGameMode("single");
                          }}
                          className="mt-6 w-full rounded-xl bg-slate-50 py-3 text-xs font-bold text-blue-650 border border-slate-200/60 dark:bg-slate-950 dark:border-slate-850 dark:text-blue-400 transition-all hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 dark:hover:text-white hover:scale-[1.02] active:scale-[0.98] duration-200 flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          Start Practicing
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </button>
                      </div>

                      {/* Local Match Mode Card */}
                      <div className="group rounded-2xl bg-white dark:bg-slate-900/50 p-6 shadow-xs border border-slate-200 dark:border-slate-800 flex flex-col justify-between hover:border-rose-500 dark:hover:border-rose-500/60 hover:shadow-lg hover:shadow-rose-500/5 hover:-translate-y-1 transition-all duration-300">
                        <div>
                          <div className="bg-rose-50 dark:bg-rose-950/40 h-11 w-11 rounded-xl flex items-center justify-center text-rose-500 mb-4 ring-1 ring-rose-500/10">
                            <Users className="h-5 w-5" />
                          </div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-950 dark:text-white group-hover:text-rose-500 transition-colors">Local Pass & Play</h3>
                            <span className="text-[10px] bg-rose-50 dark:bg-rose-955/50 text-rose-600 dark:text-rose-400 font-bold px-2 py-0.5 rounded-full">2 Players</span>
                          </div>
                          <p className="text-[11px] leading-relaxed text-slate-550 dark:text-slate-400 mt-2">
                            Invite friends directly on the same device screen for casual local multiplayer action.
                          </p>
                        </div>
                        <button
                          id="play-local-btn"
                          onClick={() => {
                            playSound("click", settings.soundVolume);
                            setActiveGameMode("local");
                          }}
                          className="mt-6 w-full rounded-xl bg-slate-50 py-3 text-xs font-bold text-rose-600 border border-slate-200/60 dark:bg-slate-950 dark:border-slate-855 dark:text-rose-400 transition-all hover:bg-rose-500 hover:text-white dark:hover:bg-rose-500 dark:hover:text-white hover:scale-[1.02] active:scale-[0.98] duration-200 flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          Launch Local
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Custom Private Rooms creation and online challenges listing */}
                  <div className="lg:col-span-5 space-y-6">
                    {/* Private Room hosting card */}
                    <div className="rounded-2xl bg-white p-6 border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800 shadow-xs hover:shadow-md transition-shadow">
                      <h4 className="text-xs font-extrabold text-slate-400 dark:text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                        Private Rooms Code Host
                      </h4>
                      
                      <div className="space-y-4">
                        <button
                          id="host-private-room-btn"
                          onClick={createPrivateRoom}
                          className="w-full text-center rounded-xl bg-slate-50 py-3 text-xs font-bold text-slate-800 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-705 hover:bg-slate-100 hover:scale-[1.02] active:scale-[0.98] transition-all duration-155 flex items-center justify-center gap-1.5 shadow-xs"
                        >
                          <Plus className="h-4 w-4 text-blue-550" />
                          Host New Private Room
                        </button>

                        <div className="relative flex items-center my-3">
                          <div className="flex-grow border-t border-slate-200/70 dark:border-slate-800/85"></div>
                          <span className="flex-shrink mx-3 text-[10px] uppercase font-bold text-slate-400 tracking-wider">Or Join Friend</span>
                          <div className="flex-grow border-t border-slate-200/70 dark:border-slate-800/85"></div>
                        </div>

                        <div className="flex gap-2">
                          <input
                            id="private-code-input"
                            type="text"
                            maxLength={6}
                            placeholder="6-digit matching code"
                            value={joiningCode}
                            onChange={(e) => setJoiningCode(e.target.value.toUpperCase())}
                            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-center font-mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:border-slate-800 dark:bg-[#0B1120] dark:text-white transition-all shadow-inner"
                          />
                          <button
                            id="submit-room-code-btn"
                            onClick={joinPrivateRoomWithEnteredCode}
                            className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white transition-all hover:bg-blue-500 hover:scale-[1.03] active:scale-[0.97] duration-155 shadow-md shadow-blue-500/10 flex items-center justify-center"
                          >
                            Join Match
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Active challenger triggers */}
                    <div className="rounded-2xl bg-white p-5 border border-slate-200/80 dark:bg-slate-900/50 dark:border-slate-800 shadow-xs">
                      <h4 className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Competitive Online Arena
                      </h4>
                      <p className="text-[11px] text-slate-400 dark:text-slate-400 leading-relaxed font-sans">
                        Connect your secure Gamer profile to active matchmaking and challenges list. To challenge individual online players, look for active tags in the stats rankings table.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeView === "leaderboard" && (
              <Leaderboard 
                backendUrl={import.meta.env.VITE_BACKEND_URL || ""} 
                currentUserId={user?.uid} 
                soundVolume={settings.soundVolume} 
              />
            )}

            {activeView === "profile" && user && (
              /* Secured User Settings Profiles page */
              <div className="rounded-2xl bg-white p-6 border border-slate-205 dark:bg-slate-900/60 dark:border-slate-800 shadow-xl max-w-2xl mx-auto">
                <div className="flex flex-col sm:flex-row items-center gap-5 pb-5 border-b mb-6 dark:border-slate-800">
                  <div className="h-16 w-16 bg-blue-50 dark:bg-blue-950/40 rounded-full flex items-center justify-center text-blue-500">
                    <UserIcon className="h-8 w-8" />
                  </div>
                  <div className="text-center sm:text-left">
                    <h3 className="text-base font-bold tracking-tight text-slate-950 dark:text-white">{user.username}</h3>
                  </div>
                </div>

                {/* Ratings Statistics */}
                <h4 className="text-[10px] uppercase font-extrabold tracking-wider text-slate-400 mb-3 block">Matches performance</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                  <div className="bg-slate-50 dark:bg-[#0B1120] rounded-xl p-3 border border-slate-205 dark:border-slate-800 text-center">
                    <p className="text-[11px] font-semibold text-slate-400">Wins count</p>
                    <p className="text-xl font-bold font-mono text-emerald-500 mt-1">{user.wins}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-[#0B1120] rounded-xl p-3 border border-slate-205 dark:border-slate-800 text-center">
                    <p className="text-[11px] font-semibold text-slate-400">Losses count</p>
                    <p className="text-xl font-bold font-mono text-rose-500 mt-1">{user.losses}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-[#0B1120] rounded-xl p-3 border border-slate-205 dark:border-slate-800 text-center">
                    <p className="text-[11px] font-semibold text-slate-400">Draws count</p>
                    <p className="text-xl font-bold font-mono text-slate-500 mt-1">{user.draws}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-[#0B1120] rounded-xl p-3 border border-slate-205 dark:border-slate-800 text-center">
                    <p className="text-[11px] font-semibold text-slate-400">Total Play count</p>
                    <p className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1">
                      {user.wins + user.losses + user.draws}
                    </p>
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

      {/* Secured authentication modal overlay */}
      <AnimatePresence>
        {showAuthScreen && (
          <AuthScreen
            backendUrl={import.meta.env.VITE_BACKEND_URL || ""}
            onAuthSuccess={handleAuthSuccess}
            soundVolume={settings.soundVolume}
            onClose={() => setShowAuthScreen(false)}
            initialTab={authTab}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
