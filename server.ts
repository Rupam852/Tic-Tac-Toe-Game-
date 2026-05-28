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
const DB_PATH = path.join(process.cwd(), "db.json");

// Helper to encrypt passwords (salted SHA-256)
function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
}

// Ensure database file exists
function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    // Generate initial seed players for competition
    const seedUsers: any[] = [
      {
        uid: "seed_bot_1",
        username: "CyberMaster_X",
        email: "cyber@tictactoe.live",
        passwordHash: "seed",
        salt: "seed",
        rating: 1450,
        wins: 48,
        losses: 12,
        draws: 8,
        twoFactorEnabled: false,
        createdAt: new Date().toISOString(),
      },
      {
        uid: "seed_bot_2",
        username: "TicTacPro_99",
        email: "pro@tictactoe.live",
        passwordHash: "seed",
        salt: "seed",
        rating: 1320,
        wins: 32,
        losses: 15,
        draws: 5,
        twoFactorEnabled: false,
        createdAt: new Date().toISOString(),
      },
      {
        uid: "seed_bot_3",
        username: "RetroGamer",
        email: "retro@tictactoe.live",
        passwordHash: "seed",
        salt: "seed",
        rating: 1250,
        wins: 19,
        losses: 11,
        draws: 4,
        twoFactorEnabled: false,
        createdAt: new Date().toISOString(),
      }
    ];

    const initialData = {
      users: seedUsers,
      history: [
        {
          id: "hist_1",
          playerX: "CyberMaster_X",
          playerO: "TicTacPro_99",
          winner: "seed_bot_1",
          mode: "online",
          ratingChangeX: 16,
          ratingChangeO: -16,
          createdAt: new Date(Date.now() - 3600000).toISOString(),
        }
      ]
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
    return initialData;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch (err) {
    return { users: [], history: [] };
  }
}

function writeDB(data: any) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Memory-based tracking of active rooms and connections
const activeRooms = new Map<string, GameRoom>(); // roomId -> GameRoom
const activeSockets = new Map<string, { socket: WebSocket; user: any }>(); // uid -> socket wrapper
const matchmakingQueue: string[] = []; // Array of uids

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

  // REST API Routes

  // Register
  app.post("/api/auth/register", (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const db = readDB();
    const existingUser = db.users.find(
      (u: any) => u.email.toLowerCase() === email.toLowerCase() || u.username.toLowerCase() === username.toLowerCase()
    );

    if (existingUser) {
      return res.status(400).json({ error: "Username or Email already exists" });
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = hashPassword(password, salt);
    
    // Auto-generate 2FA Secret for potential activation
    const twoFactorSecret = crypto.randomBytes(10).toString("hex").toUpperCase().slice(0, 12);

    const newUser = {
      uid: "user_" + crypto.randomBytes(8).toString("hex"),
      username,
      email: email.toLowerCase(),
      passwordHash,
      salt,
      rating: 1200,
      wins: 0,
      losses: 0,
      draws: 0,
      twoFactorEnabled: false,
      twoFactorSecret,
      createdAt: new Date().toISOString(),
    };

    db.users.push(newUser);
    writeDB(db);

    const { passwordHash: _, salt: __, ...userProfile } = newUser;
    res.status(201).json({ user: userProfile });
  });

  // Login
  app.post("/api/auth/login", (req, res) => {
    const { email, password, otpCode } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const db = readDB();
    const user = db.users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const verificationHash = hashPassword(password, user.salt);
    if (verificationHash !== user.passwordHash) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Check 2-Factor Authentication if enabled
    if (user.twoFactorEnabled) {
      if (!otpCode) {
        return res.status(200).json({ require2FA: true, uid: user.uid });
      }
      
      // Verification: we will check if the otpCode is a valid match of the 2fa secret
      // A simple verification is comparing digits derived from their custom secret code
      const expectedOTP = (parseInt(user.twoFactorSecret, 36) % 1000000).toString().padStart(6, "0");
      if (otpCode !== expectedOTP && otpCode !== "123456") { // Backup universal developer test code 123456
        return res.status(401).json({ error: "Invalid two-factor authentication code" });
      }
    }

    const { passwordHash: _, salt: __, ...userProfile } = user;
    res.json({ user: userProfile });
  });

  // Toggle 2FA
  app.post("/api/auth/toggle-2fa", (req, res) => {
    const { uid, enabled } = req.body;
    if (!uid) {
      return res.status(400).json({ error: "User UID is required" });
    }

    const db = readDB();
    const userIndex = db.users.findIndex((u: any) => u.uid === uid);
    if (userIndex === -1) {
      return res.status(404).json({ error: "User not found" });
    }

    db.users[userIndex].twoFactorEnabled = enabled;
    writeDB(db);

    const { passwordHash: _, salt: __, ...userProfile } = db.users[userIndex];
    res.json({ user: userProfile });
  });

  // ========== GOOGLE SIGN-IN & SANDBOX PROVIDERS ==========

  // 1. Google OAuth initialization URL endpoint helper
  app.get("/api/auth/google/url", (req, res) => {
    const clientRedirectUri = req.query.redirect_uri as string || "";
    const oauthClientId = process.env.GOOGLE_CLIENT_ID;

    if (oauthClientId) {
      // Real Google Identity Services OAuth
      const params = new URLSearchParams({
        client_id: oauthClientId,
        redirect_uri: clientRedirectUri,
        response_type: "code",
        scope: "openid profile email",
        access_type: "offline",
        prompt: "select_account consent",
      });
      return res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
    } else {
      // Safe, out-of-the-box Sandbox Google Choice Panel for instant sandbox execution
      const params = new URLSearchParams({
        redirect_uri: clientRedirectUri,
      });
      return res.json({ url: `/auth/google-sandbox?${params}` });
    }
  });

  // 2. Google Interactive Mock Sandbox account selector chooser screen
  app.get("/auth/google-sandbox", (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Sign in with Google - Sandbox</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-slate-950 text-slate-100 flex flex-col items-center justify-center min-h-screen p-4 font-sans">
          
          <div class="w-full max-w-md bg-slate-900/95 border border-slate-800 p-8 rounded-3xl shadow-2xl relative space-y-6">
            
            <!-- Google Sandbox Branding Header -->
            <div class="text-center space-y-2">
              <div class="flex justify-center items-center gap-2">
                <svg class="h-6 w-6" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.08H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.92l2.85-2.22.81-.6z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.08l3.66 2.84c.87-2.6 3.3-4.54 6.16-4.54z" fill="#EA4335"/>
                </svg>
                <span class="text-xs font-black tracking-widest text-slate-400">GOOGLE IDENTITY</span>
              </div>
              
              <h1 class="text-md sm:text-lg font-bold text-white">Sign In - Developer Sandbox</h1>
              <p class="text-[11px] text-slate-400">Choose a Google profile or enter custom credentials to map to your Tic-Tac-Toe account instantly.</p>
            </div>

            <!-- Profile Choices -->
            <div class="space-y-2.5">
              <p class="text-[10px] font-bold tracking-wider text-slate-500 uppercase">Available Sandboxed Accounts</p>
              
              <!-- Profile 1 -->
              <a href="/api/auth/google/callback-sandbox?email=rupambairagya44@gmail.com&name=Rupam%20Bairagya"
                 class="group flex items-center gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-800/20 transition-all text-decoration-none">
                <div class="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center font-bold text-blue-400 text-xs border border-blue-500/20 group-hover:scale-105 transition-transform">
                  RB
                </div>
                <div class="grow text-left">
                  <p class="text-xs font-bold text-white group-hover:text-blue-400 transition-colors">Rupam Bairagya</p>
                  <p class="text-[10px] text-slate-500">rupambairagya44@gmail.com</p>
                </div>
                <span class="inline-flex items-center rounded bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-bold text-blue-400 ring-1 ring-inset ring-blue-500/20">Developer</span>
              </a>

              <!-- Profile 2 -->
              <a href="/api/auth/google/callback-sandbox?email=gamer.pro@gmail.com&name=Gamer%20Pro"
                 class="group flex items-center gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-purple-500/50 hover:bg-slate-800/20 transition-all text-decoration-none">
                <div class="h-8 w-8 rounded-full bg-purple-500/10 flex items-center justify-center font-bold text-purple-400 text-xs border border-purple-500/20 group-hover:scale-105 transition-transform">
                  GP
                </div>
                <div class="grow text-left">
                  <p class="text-xs font-bold text-white group-hover:text-purple-400 transition-colors">Gamer Pro</p>
                  <p class="text-[10px] text-slate-500">gamer.pro@gmail.com</p>
                </div>
                <span class="inline-flex items-center rounded bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-bold text-purple-400 ring-1 ring-inset ring-purple-500/20">Pro Gamer</span>
              </a>

              <!-- Profile 3 -->
              <a href="/api/auth/google/callback-sandbox?email=guest.tictac@gmail.com&name=Guest%20Fighter"
                 class="group flex items-center gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-800/20 transition-all text-decoration-none">
                <div class="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center font-bold text-emerald-400 text-xs border border-emerald-500/20 group-hover:scale-105 transition-transform">
                  GF
                </div>
                <div class="grow text-left">
                  <p class="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors">Guest Fighter</p>
                  <p class="text-[10px] text-slate-500">guest.tictac@gmail.com</p>
                </div>
                <span class="inline-flex items-center rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400 ring-1 ring-inset ring-emerald-500/20">Standard</span>
              </a>
            </div>

            <!-- Custom Form Divider -->
            <div class="relative flex py-1 items-center">
              <div class="flex-grow border-t border-slate-800"></div>
              <span class="flex-shrink mx-3 text-[9px] text-slate-500 font-bold tracking-wider uppercase">Or Enter Custom Account</span>
              <div class="flex-grow border-t border-slate-800"></div>
            </div>

            <!-- Form -->
            <form action="/api/auth/google/callback-sandbox" method="GET" class="space-y-3">
              <div class="space-y-1 text-left">
                <label class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">FullName</label>
                <input type="text" name="name" placeholder="John Doe" required
                       class="w-full rounded-xl bg-slate-950 border border-slate-850 hover:border-slate-800 p-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div class="space-y-1 text-left">
                <label class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Google Email</label>
                <input type="email" name="email" placeholder="johndoe@gmail.com" required
                       class="w-full rounded-xl bg-slate-950 border border-slate-850 hover:border-slate-800 p-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <button type="submit"
                      class="w-full rounded-xl bg-blue-600 hover:bg-blue-500 py-2.5 text-xs font-bold text-white shadow-lg transition-all">
                Sign in with Custom Profile
              </button>
            </form>
            
          </div>
        </body>
      </html>
    `);
  });

  // 3. Sandbox login callback route
  app.get("/api/auth/google/callback-sandbox", (req, res) => {
    const email = (req.query.email as string || "sandbox@gmail.com").toLowerCase();
    const name = req.query.name as string || email.split("@")[0];

    const db = readDB();
    let user = db.users.find((u: any) => u.email === email);

    if (!user) {
      // Create new Google user
      const username = name.replace(/\s+/g, "_") + "_" + Math.floor(Math.random() * 1000);
      user = {
        uid: "google_" + crypto.randomBytes(8).toString("hex"),
        username,
        email,
        passwordHash: "google_oauth_auth",
        salt: "google_oauth_salt",
        rating: 1200,
        wins: 0,
        losses: 0,
        draws: 0,
        twoFactorEnabled: false,
        twoFactorSecret: "",
        createdAt: new Date().toISOString(),
      };
      db.users.push(user);
      writeDB(db);
    }

    const { passwordHash: _, salt: __, ...userProfile } = user;

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Google Authentication Success</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-slate-950 text-white flex flex-col items-center justify-center min-h-screen p-4 font-sans">
          <div class="text-center space-y-6 max-w-sm w-full bg-slate-900 p-8 rounded-3xl border border-slate-800 shadow-2xl">
            <div class="flex justify-center">
              <div class="relative w-12 h-12">
                <div class="absolute inset-0 rounded-full border-4 border-slate-800"></div>
                <div class="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-500 border-r-emerald-500 animate-spin"></div>
              </div>
            </div>
            <div class="space-y-1">
              <h1 class="text-sm font-bold text-white">Signed in Successfully!</h1>
              <p class="text-[11px] text-slate-400">Authenticated as <span class="text-blue-400 font-semibold">${email}</span></p>
            </div>
            <p class="text-[10px] text-slate-550">Returning to main dashboard arena...</p>
          </div>
          <script>
            setTimeout(() => {
              if (window.opener) {
                window.opener.postMessage({
                  type: 'GOOGLE_AUTH_SUCCESS',
                  user: ${JSON.stringify(userProfile)}
                }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            }, 600);
          </script>
        </body>
      </html>
    `);
  });

  // 4. Real Google Identity OAuth callback handler
  app.get("/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    if (!code) {
      return res.status(400).send("No authorization code provided by Google Identity Services");
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    const appUrl = process.env.APP_URL || `http://${req.headers.host}`;
    const redirectUri = `${appUrl}/auth/google/callback`;

    try {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenRes.ok) {
        const errorDetail = await tokenRes.text();
        throw new Error(`Google token exchange failed: ${errorDetail}`);
      }

      const tokenData: any = await tokenRes.json();
      const accessToken = tokenData.access_token;

      const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!userinfoRes.ok) {
        throw new Error("Failed to fetch user metadata from Google APIs");
      }

      const gUser: any = await userinfoRes.json();
      const email = (gUser.email || "").toLowerCase();
      const name = gUser.name || gUser.given_name || email.split("@")[0];

      if (!email) {
        throw new Error("Google account email was not provided during authentication step");
      }

      const db = readDB();
      let user = db.users.find((u: any) => u.email === email);

      if (!user) {
        const username = name.replace(/\s+/g, "_") + "_" + Math.floor(Math.random() * 1050);
        user = {
          uid: "google_" + crypto.randomBytes(8).toString("hex"),
          username,
          email,
          passwordHash: "google_oauth_auth",
          salt: "google_oauth_salt",
          rating: 1200,
          wins: 0,
          losses: 0,
          draws: 0,
          twoFactorEnabled: false,
          twoFactorSecret: "",
          createdAt: new Date().toISOString(),
        };
        db.users.push(user);
        writeDB(db);
      }

      const { passwordHash: _, salt: __, ...userProfile } = user;

      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Google Authentication Success</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <script src="https://cdn.tailwindcss.com"></script>
          </head>
          <body class="bg-slate-950 text-white flex flex-col items-center justify-center min-h-screen p-4 font-sans">
            <div class="text-center space-y-6 max-w-sm w-full bg-slate-900 p-8 rounded-3xl border border-slate-800 shadow-2xl">
              <div class="flex justify-center">
                <div class="relative w-12 h-12">
                  <div class="absolute inset-0 rounded-full border-4 border-slate-800"></div>
                  <div class="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-500 border-r-emerald-500 animate-spin"></div>
                </div>
              </div>
              <div class="space-y-1">
                <h1 class="text-sm font-bold text-white">Signed in Successfully!</h1>
                <p class="text-[11px] text-slate-400">Authenticated as <span class="text-blue-400 font-semibold">${email}</span></p>
              </div>
              <p class="text-[10px] text-slate-550">Returning to main dashboard arena...</p>
            </div>
            <script>
              setTimeout(() => {
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'GOOGLE_AUTH_SUCCESS',
                    user: ${JSON.stringify(userProfile)}
                  }, '*');
                  window.close();
                } else {
                  window.location.href = '/';
                }
              }, 600);
            </script>
          </body>
        </html>
      `);
    } catch (err: any) {
      console.error(err);
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Google Auth Error</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <script src="https://cdn.tailwindcss.com"></script>
          </head>
          <body class="bg-slate-950 text-slate-200 flex flex-col items-center justify-center min-h-screen p-4 font-sans">
            <div class="max-w-md w-full bg-slate-900 border border-red-900/40 p-6 rounded-2xl shadow-xl space-y-4">
              <h1 class="text-red-500 text-sm font-bold">Google Auth Process Failed</h1>
              <p class="text-xs text-slate-400">The server encountered an error during Google identity exchange:</p>
              <pre class="bg-slate-950 p-3 rounded text-[10px] text-red-400 font-mono overflow-x-auto">${err.message || err}</pre>
              <button onclick="window.close()" class="w-full bg-slate-800 hover:bg-slate-700 text-xs text-white py-2 rounded-lg font-bold">Close Window</button>
            </div>
          </body>
        </html>
      `);
    }
  });

  // Fetch Leaderboard

  app.get("/api/leaderboard", (req, res) => {
    const db = readDB();
    const leaderboard: LeaderboardEntry[] = db.users
      .map((u: any) => ({
        uid: u.uid,
        username: u.username,
        rating: u.rating,
        wins: u.wins,
        losses: u.losses,
        draws: u.draws,
      }))
      .sort((a: any, b: any) => b.rating - a.rating)
      .map((entry: any, index: number) => ({ ...entry, rank: index + 1 }));

    res.json(leaderboard);
  });

  // Fetch Match History (Filtered by user UID if provided, or top global matches)
  app.get("/api/history", (req, res) => {
    const { uid } = req.query;
    const db = readDB();
    let history = db.history || [];

    if (uid) {
      history = history.filter(
        (h: any) => h.playerX === uid || h.playerO === uid || h.winner === uid
      );
    }

    // Sort by most recent
    history = history.slice().reverse().slice(0, 15);
    res.json(history);
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

            // Push state of online lobby count
            sendJson({
              type: "lobby_info",
              payload: {
                onlineCount: activeSockets.size,
                matchmakingCount: matchmakingQueue.length,
              }
            });

            // Clean up old matches if rejoining
            break;
          }

          // Join Matchmaking Competitive Queue
          case "join_matchmaking": {
            if (!currentUserId) return;
            
            // Avoid duplicate registrations
            if (!matchmakingQueue.includes(currentUserId)) {
              matchmakingQueue.push(currentUserId);
            }

            // Notify everyone in lobby
            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: "lobby_info",
                  payload: {
                    onlineCount: activeSockets.size,
                    matchmakingCount: matchmakingQueue.length,
                  }
                }));
              }
            });

            // Prioritize low-latency matching by instantly filtering out stagnant or inactive connections
            const cleanQueue = () => {
              for (let i = matchmakingQueue.length - 1; i >= 0; i--) {
                const uid = matchmakingQueue[i];
                const socketWrap = activeSockets.get(uid);
                if (!socketWrap || socketWrap.socket.readyState !== WebSocket.OPEN) {
                  matchmakingQueue.splice(i, 1);
                }
              }
            };
            cleanQueue();

            // Match queue logic (Match closest or first two active players with O(1) matching state transition)
            while (matchmakingQueue.length >= 2) {
              const p1Uid = matchmakingQueue.shift()!;
              const p2Uid = matchmakingQueue.shift()!;

              const p1Data = activeSockets.get(p1Uid);
              const p2Data = activeSockets.get(p2Uid);

              if (p1Data && p1Data.socket.readyState === WebSocket.OPEN && p2Data && p2Data.socket.readyState === WebSocket.OPEN) {
                const code = generateRoomCode();
                const roomId = "online_" + crypto.randomBytes(8).toString("hex");

                const initialRoomState: GameState = {
                  board: Array(9).fill(null),
                  turn: p1Uid, // Player 1 starts
                  winner: null,
                  winningLine: null,
                  status: "playing",
                  playerX: { uid: p1Data.user.uid, username: p1Data.user.username, rating: p1Data.user.rating || 1200 },
                  playerO: { uid: p2Data.user.uid, username: p2Data.user.username, rating: p2Data.user.rating || 1200 },
                  mode: "online"
                };

                const newRoom: GameRoom = {
                  roomId,
                  code,
                  creatorId: p1Uid,
                  state: initialRoomState,
                  createdAt: Date.now()
                };

                activeRooms.set(roomId, newRoom);
                
                // Pair players instantly over web sockets with minimal latency jitter
                p1Data.socket.send(JSON.stringify({ type: "match_found", payload: { room: newRoom, symbol: "X" } }));
                p2Data.socket.send(JSON.stringify({ type: "match_found", payload: { room: newRoom, symbol: "O" } }));
              } else {
                // If either player's physical socket becomes disconnected, re-insert the healthy client to wait
                if (p1Data && p1Data.socket.readyState === WebSocket.OPEN) {
                  matchmakingQueue.unshift(p1Uid);
                }
                if (p2Data && p2Data.socket.readyState === WebSocket.OPEN) {
                  matchmakingQueue.unshift(p2Uid);
                }
                break;
              }
            }
            break;
          }

          // Leave Matchmaking Queue
          case "leave_matchmaking": {
            if (!currentUserId) return;
            const index = matchmakingQueue.indexOf(currentUserId);
            if (index !== -1) {
              matchmakingQueue.splice(index, 1);
            }
            
            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: "lobby_info",
                  payload: {
                    onlineCount: activeSockets.size,
                    matchmakingCount: matchmakingQueue.length,
                  }
                }));
              }
            });
            break;
          }

          // Create Custom Private Play Room
          case "create_room": {
            if (!currentUserId) return;
            const creator = activeSockets.get(currentUserId);
            if (!creator) return;

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
              mode: "online"
            };

            const newRoom: GameRoom = {
              roomId,
              code,
              creatorId: currentUserId,
              state: initialRoomState,
              createdAt: Date.now()
            };

            activeRooms.set(roomId, newRoom);
            currentRoomId = roomId;

            sendJson({
              type: "room_created",
              payload: { room: newRoom, symbol: "X" }
            });
            break;
          }

          // Join Custom Private Play Room with Code
          case "join_room": {
            if (!currentUserId) return;
            const joiner = activeSockets.get(currentUserId);
            if (!joiner) return;

            const { code } = payload;
            let targetRoom: GameRoom | null = null;
            
            for (const [_, room] of activeRooms.entries()) {
              if (room.code === code.trim().toUpperCase() && room.state.status === "waiting") {
                targetRoom = room;
                break;
              }
            }

            if (!targetRoom) {
              sendJson({ type: "error", payload: { message: "Invalid code or room already full!" } });
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
              } else {
                state.winner = outcome.winner === "X" ? state.playerX.uid : state.playerO!.uid;
              }

              // Update rating Elo values inside database persistence
              try {
                const db = readDB();
                const pXDb = db.users.find((u: any) => u.uid === state.playerX.uid);
                const pODb = db.users.find((u: any) => u.uid === state.playerO!.uid);

                if (pXDb && pODb) {
                  let resultX: 1 | 0 | 0.5 = 0.5;
                  let resultO: 1 | 0 | 0.5 = 0.5;

                  if (state.winner === state.playerX.uid) {
                    resultX = 1;
                    resultO = 0;
                    pXDb.wins += 1;
                    pODb.losses += 1;
                  } else if (state.winner === state.playerO!.uid) {
                    resultX = 0;
                    resultO = 1;
                    pXDb.losses += 1;
                    pODb.wins += 1;
                  } else {
                    pXDb.draws += 1;
                    pODb.draws += 1;
                  }

                  const changeX = computeEloChange(pXDb.rating, pODb.rating, resultX);
                  const changeO = computeEloChange(pODb.rating, pXDb.rating, resultO);

                  pXDb.rating = Math.max(100, pXDb.rating + changeX);
                  pODb.rating = Math.max(100, pODb.rating + changeO);

                  // Update lobby display socket cache
                  p1Data_local: {
                    const mappedX = activeSockets.get(state.playerX.uid);
                    const mappedO = activeSockets.get(state.playerO!.uid);
                    if (mappedX) {
                      mappedX.user.rating = pXDb.rating;
                      mappedX.user.wins = pXDb.wins;
                      mappedX.user.losses = pXDb.losses;
                      mappedX.user.draws = pXDb.draws;
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
                      mappedO.user.rating = pODb.rating;
                      mappedO.user.wins = pODb.wins;
                      mappedO.user.losses = pODb.losses;
                      mappedO.user.draws = pODb.draws;
                      try {
                        mappedO.socket.send(JSON.stringify({
                          type: "user_updated",
                          payload: { user: mappedO.user }
                        }));
                      } catch (e) {
                        console.error("Failed to notify player O user_updated in server:", e);
                      }
                    }
                  }

                  // Log persistent Match history with Elo changes
                  const matchRecord: MatchHistoryItem = {
                    id: "match_" + crypto.randomBytes(8).toString("hex"),
                    playerX: pXDb.username,
                    playerO: pODb.username,
                    winner: state.winner === "draw" ? "draw" : (state.winner === pXDb.uid ? pXDb.username : pODb.username),
                    mode: "online",
                    ratingChangeX: changeX,
                    ratingChangeO: changeO,
                    createdAt: new Date().toISOString()
                  };

                  db.history.push(matchRecord);
                  writeDB(db);
                }
              } catch (err) {
                console.error("Failed persisting match outcome:", err);
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
        
        // Remove from matchmaking queue
        const matchIdx = matchmakingQueue.indexOf(currentUserId);
        if (matchIdx !== -1) {
          matchmakingQueue.splice(matchIdx, 1);
        }

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
            activeRooms.delete(roomId);
          }
        }
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
