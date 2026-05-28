/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dotenv from "dotenv";
import express from "express";
import http from "http";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config();
import fs from "fs";
import crypto from "crypto";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import { User, GameRoom, GameState, MatchHistoryItem, LeaderboardEntry, BoardState, GameStatus } from "./src/types";

const PORT = 3000;

// Memory-based tracking of active rooms and connections
const activeRooms = new Map<string, GameRoom>(); // roomId -> GameRoom
const roomTimers = new Map<string, NodeJS.Timeout>(); // roomId -> expiration timer
const activeSockets = new Map<string, { socket: WebSocket; user: any }>(); // uid -> socket wrapper

// Check winning states
const WINNING_COMBINATIONS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
  [0, 4, 8], [2, 4, 6]             // Diagonals
];

function checkWinner(board: BoardState): { winner: string | null; line: number[] | null } {
  for (const combo of WINNING_COMBINATIONS) {
    const [a, b, c] = combo;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: combo };
    }
  }
  const isDraw = board.every((cell) => cell !== null);
  return { winner: isDraw ? "draw" : null, line: null };
}

// Standard ELO rating algorithm
function computeEloChange(ratingA: number, ratingB: number, outcome: 1 | 0 | 0.5): number {
  const K = 32;
  const expectedScore = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  return Math.round(K * (outcome - expectedScore));
}

// Generate a random 6-digit room entry code
function generateRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed tricky chars like O, I, 1, 0
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return code;
}

// Setup fullstack server
async function startServer() {
  const app = express();
  const server = http.createServer(app);
  
  // Create WebSocket Server
  const wss = new WebSocketServer({ noServer: true });

  app.use(express.json());

  // CORS Middleware
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  // Simple Ping Endpoint for Cron Jobs/Keep-Alive monitors to prevent Render sleep spin-down
  app.get("/ping", (req, res) => {
    res.status(200).json({ status: "alive", timestamp: Date.now() });
  });



  // Handle WebSocket Connection
  server.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url || "", `http://${request.headers.host}`).pathname;
    if (pathname === "/ws") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  const broadcastLobbyInfo = () => {
    const payload = JSON.stringify({
      type: "lobby_info",
      payload: {
        onlineCount: activeSockets.size,
      }
    });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  };

  wss.on("connection", (ws: WebSocket) => {
    console.log("[WS Connection] A new client has connected to the WebSocket server");
    let currentUserId: string | null = null;
    let currentRoomId: string | null = null;

    const sendJson = (data: any) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
      }
    };

    const broadcastToRoom = (roomId: string, data: any) => {
      const room = activeRooms.get(roomId);
      if (!room) return;
      
      const pX = activeSockets.get(room.state.playerX.uid);
      if (pX) pX.socket.send(JSON.stringify(data));

      if (room.state.playerO) {
        const pO = activeSockets.get(room.state.playerO.uid);
        if (pO) pO.socket.send(JSON.stringify(data));
      }
    };

    ws.on("message", (msgStr: string) => {
      try {
        const message = JSON.parse(msgStr);
        const { type, payload } = message;
        console.log(`[WS Message] Received type: "${type}" for currentUserId: "${currentUserId}"`);

        switch (type) {
          // Bind authenticated user info to socket
          case "register_socket": {
            const { user } = payload;
            if (!user || !user.uid) return;
            currentUserId = user.uid;
            
            // Map socket
            activeSockets.set(currentUserId, { socket: ws, user });

            // Push updated state of online lobby count to all clients in real-time
            broadcastLobbyInfo();

            break;
          }

          // Create Custom Private Play Room
          case "create_room": {
            if (!currentUserId) return;
            const creator = activeSockets.get(currentUserId);
            if (!creator) return;

            // SAFEGUARD: Destroy any existing room previously hosted by this same user to prevent spam/leaks
            for (const [roomId, room] of activeRooms.entries()) {
              if (room.creatorId === currentUserId) {
                const oldTimer = roomTimers.get(roomId);
                if (oldTimer) {
                  clearTimeout(oldTimer);
                  roomTimers.delete(roomId);
                }
                activeRooms.delete(roomId);
                console.log(`[Anti-Spam Cleanup] Destroyed stale room ${roomId} previously hosted by ${currentUserId}`);
              }
            }

            const code = generateRoomCode();
            const roomId = "private_" + crypto.randomBytes(8).toString("hex");

            const initialRoomState: GameState = {
              board: Array(9).fill(null),
              turn: currentUserId,
              winner: null,
              winningLine: null,
              status: "waiting", // Waiting for opponent to join
              playerX: { uid: creator.user.uid, username: creator.user.username, rating: creator.user.rating || 1200 },
              playerO: null,
              mode: "online",
              scoreX: 0,
              scoreO: 0,
              draws: 0
            };

            const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

            const newRoom: GameRoom = {
              roomId,
              code,
              creatorId: currentUserId,
              state: initialRoomState,
              createdAt: Date.now(),
              expiresAt
            };

            activeRooms.set(roomId, newRoom);
            currentRoomId = roomId;

            sendJson({
              type: "room_created",
              payload: { room: newRoom, symbol: "X" }
            });

            // Set up a 10-minute self-deletion timeout
            const timer = setTimeout(() => {
              const r = activeRooms.get(roomId);
              if (r) {
                broadcastToRoom(roomId, {
                  type: "room_expired",
                  payload: { message: "This room has expired after 10 minutes of active lifetime." }
                });
                activeRooms.delete(roomId);
                roomTimers.delete(roomId);
                console.log(`[Room Expired] Room ${roomId} has automatically expired and been deleted.`);
              }
            }, 10 * 60 * 1000);
            roomTimers.set(roomId, timer);

            break;
          }

          // Join Custom Private Play Room with Code
          case "join_room": {
            if (!currentUserId) return;
            const joiner = activeSockets.get(currentUserId);
            if (!joiner) return;

            const { code } = payload;
            const formattedCode = code.trim().toUpperCase();
            let targetRoom: GameRoom | null = null;
            let codeExistsAtAll = false;
            
            for (const [_, room] of activeRooms.entries()) {
              if (room.code === formattedCode) {
                codeExistsAtAll = true;
                if (room.state.status === "waiting") {
                  targetRoom = room;
                  break;
                }
              }
            }

            if (!codeExistsAtAll) {
              sendJson({ type: "error", payload: { message: "This room code is invalid or has expired!" } });
              return;
            }

            if (!targetRoom) {
              sendJson({ type: "error", payload: { message: "This room is already full!" } });
              return;
            }

            // Fill developer player O slots
            targetRoom.state.playerO = {
              uid: joiner.user.uid,
              username: joiner.user.username,
              rating: joiner.user.rating || 1200
            };
            targetRoom.state.status = "playing";
            currentRoomId = targetRoom.roomId;

            // Update room
            activeRooms.set(targetRoom.roomId, targetRoom);

            // Notify creator and joiner
            broadcastToRoom(targetRoom.roomId, {
              type: "room_joined",
              payload: { room: targetRoom }
            });
            break;
          }

          // Direct Challenge (Challenge Online Profile)
          case "send_challenge": {
            if (!currentUserId) return;
            const challenger = activeSockets.get(currentUserId);
            if (!challenger) return;

            const { targetUid } = payload;
            const opponent = activeSockets.get(targetUid);
            
            if (opponent && targetUid !== currentUserId) {
              // Construct a pending challenge room code
              const challengeCode = "CHALLENGE_" + generateRoomCode();
              
              // Direct socket notification to target
              opponent.socket.send(JSON.stringify({
                type: "incoming_challenge",
                payload: {
                  challenger: challenger.user,
                  challengeCode
                }
              }));
              
              sendJson({ type: "challenge_sent" });
            } else {
              sendJson({ type: "error", payload: { message: "Player is offline or busy!" } });
            }
            break;
          }

          // Play move inside online matches
          case "play_move": {
            const { roomId, cellIndex } = payload;
            const room = activeRooms.get(roomId);
            if (!room || room.state.status !== "playing") return;

            const state = room.state;
            
            // Validate Turn and Boundaries
            if (state.turn !== currentUserId) {
              return; // Anti-cheating client validation
            }

            if (state.board[cellIndex] !== null) {
              return; // Cell occupied
            }

            // Figure out move symbol
            const currentSymbol = state.turn === state.playerX.uid ? "X" : "O";
            state.board[cellIndex] = currentSymbol;

            // Evaluate Winner/Draw
            const outcome = checkWinner(state.board);
            
            if (outcome.winner) {
              state.status = "ended";
              state.winningLine = outcome.line;
              
              if (outcome.winner === "draw") {
                state.winner = "draw";
                state.draws = (state.draws || 0) + 1;
              } else {
                state.winner = outcome.winner === "X" ? state.playerX.uid : state.playerO!.uid;
                if (outcome.winner === "X") {
                  state.scoreX = (state.scoreX || 0) + 1;
                } else {
                  state.scoreO = (state.scoreO || 0) + 1;
                }
              }

              // Update rating Elo values and stats in-memory
              try {
                let resultX: 1 | 0 | 0.5 = 0.5;
                let resultO: 1 | 0 | 0.5 = 0.5;

                if (state.winner === state.playerX.uid) {
                  resultX = 1;
                  resultO = 0;
                } else if (state.winner === state.playerO!.uid) {
                  resultX = 0;
                  resultO = 1;
                }

                const changeX = computeEloChange(state.playerX.rating, state.playerO!.rating, resultX);
                const changeO = computeEloChange(state.playerO!.rating, state.playerX.rating, resultO);

                state.playerX.rating = Math.max(100, state.playerX.rating + changeX);
                state.playerO!.rating = Math.max(100, state.playerO!.rating + changeO);

                // Update socket user state in activeSockets and notify client of their updated stats
                const mappedX = activeSockets.get(state.playerX.uid);
                const mappedO = activeSockets.get(state.playerO!.uid);
                
                if (mappedX) {
                  mappedX.user.rating = state.playerX.rating;
                  if (resultX === 1) mappedX.user.wins = (mappedX.user.wins || 0) + 1;
                  else if (resultX === 0) mappedX.user.losses = (mappedX.user.losses || 0) + 1;
                  else mappedX.user.draws = (mappedX.user.draws || 0) + 1;
                  try {
                    mappedX.socket.send(JSON.stringify({
                      type: "user_updated",
                      payload: { user: mappedX.user }
                    }));
                  } catch (e) {
                    console.error("Failed to notify player X user_updated in server:", e);
                  }
                }
                
                if (mappedO) {
                  mappedO.user.rating = state.playerO!.rating;
                  if (resultO === 1) mappedO.user.wins = (mappedO.user.wins || 0) + 1;
                  else if (resultO === 0) mappedO.user.losses = (mappedO.user.losses || 0) + 1;
                  else mappedO.user.draws = (mappedO.user.draws || 0) + 1;
                  try {
                    mappedO.socket.send(JSON.stringify({
                      type: "user_updated",
                      payload: { user: mappedO.user }
                    }));
                  } catch (e) {
                    console.error("Failed to notify player O user_updated in server:", e);
                  }
                }
              } catch (err) {
                console.error("Failed updating in-memory stats:", err);
              }
            } else {
              // Pass the turn
              state.turn = state.turn === state.playerX.uid ? state.playerO!.uid : state.playerX.uid;
            }

            // Sync updated state to all connected room devices
            broadcastToRoom(roomId, {
              type: "room_updated",
              payload: { room }
            });
            break;
          }

          // Rematch / Restart request handling
          case "restart_game": {
            const { roomId } = payload;
            const room = activeRooms.get(roomId);
            if (!room) return;

            const state = room.state;
            
            if (state.status !== "ended") return;

            if (!state.rematchRequestedBy) {
              // First player requests rematch
              state.rematchRequestedBy = currentUserId;
              
              broadcastToRoom(roomId, {
                type: "rematch_request",
                payload: { requesterUsername: currentUserId === state.playerX.uid ? state.playerX.username : state.playerO!.username }
              });

              broadcastToRoom(roomId, {
                type: "room_updated",
                payload: { room }
              });
            } else if (state.rematchRequestedBy !== currentUserId) {
              // Second player accepts rematch -> RESTART match
              state.board = Array(9).fill(null);
              state.winner = null;
              state.winningLine = null;
              state.status = "playing";
              state.rematchRequestedBy = null;
              state.turn = state.playerX.uid; // Reset to Player X

              broadcastToRoom(roomId, {
                type: "room_updated",
                payload: { room }
              });
            }
            break;
          }

          // Leave Custom Play Room
          case "leave_room": {
            const { roomId } = payload;
            const room = activeRooms.get(roomId);
            if (!room) return;

            // Notify opposite player
            const notifyUid = room.state.playerX.uid === currentUserId ? (room.state.playerO?.uid) : room.state.playerX.uid;
            if (notifyUid) {
              const oppSocket = activeSockets.get(notifyUid);
              if (oppSocket) {
                oppSocket.socket.send(JSON.stringify({
                  type: "opponent_disconnected",
                  payload: { message: "Opponent left the match." }
                }));
              }
            }

            // Clear auto-expiry timer
            const timer = roomTimers.get(roomId);
            if (timer) {
              clearTimeout(timer);
              roomTimers.delete(roomId);
            }

            activeRooms.delete(roomId);
            console.log(`[Room Terminated] Room ${roomId} explicitly closed by user.`);
            break;
          }

          // Real-time emoji burst or quick text chatting
          case "chat_bubble": {
            const { roomId, content } = payload;
            if (!currentUserId) return;
            
            const room = activeRooms.get(roomId);
            if (room) {
              const senderName = currentUserId === room.state.playerX.uid ? room.state.playerX.username : room.state.playerO?.username || "Guest";
              broadcastToRoom(roomId, {
                type: "chat_receive",
                payload: {
                  sender: senderName,
                  content
                }
              });
            }
            break;
          }
        }
      } catch (err) {
        console.error("WS parse error:", err);
      }
    });

    ws.on("close", () => {
      console.log(`[WS Close] Connection closed for currentUserId: "${currentUserId}"`);
      if (currentUserId) {
        activeSockets.delete(currentUserId);

        // Handle active online room termination upon disconnect
        for (const [roomId, room] of activeRooms.entries()) {
          if (room.state.playerX.uid === currentUserId || (room.state.playerO && room.state.playerO.uid === currentUserId)) {
            // Forfeit or inform the opposite player
            const notifyUid = room.state.playerX.uid === currentUserId ? (room.state.playerO?.uid) : room.state.playerX.uid;
            if (notifyUid) {
              const oppSocket = activeSockets.get(notifyUid);
              if (oppSocket) {
                oppSocket.socket.send(JSON.stringify({
                  type: "opponent_disconnected",
                  payload: { message: "Opponent disconnected from room." }
                }));
              }
            }
            // Clear auto-expiry timer
            const timer = roomTimers.get(roomId);
            if (timer) {
              clearTimeout(timer);
              roomTimers.delete(roomId);
            }
            activeRooms.delete(roomId);
          }
        }
        
        // Push updated state of online lobby count to all clients in real-time
        broadcastLobbyInfo();
      }
    });
  });

  // Serve static assets in production or coordinate developer server middleware
  if (process.env.NODE_ENV !== "production") {
    // Inject Vite dev middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Server static directory
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Bind to port 3000
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

startServer();
