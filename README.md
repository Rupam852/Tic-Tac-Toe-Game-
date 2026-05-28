# 🎮 Tic-Tac-Toe Live: Premium Anonymous Gaming Arena

[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev/)
[![React](https://img.shields.io/badge/React-19.x-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.x-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![WebSockets](https://img.shields.io/badge/WebSockets-ws-blueviolet?style=for-the-badge&logo=socket.io&logoColor=white)](https://github.com/websockets/ws)
[![Render](https://img.shields.io/badge/Render-Backend-46E3B7?style=for-the-badge&logo=render&logoColor=white)](https://render.com/)
[![Vercel](https://img.shields.io/badge/Vercel-Frontend-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com/)

A state-of-the-art, zero-friction online multiplayer and offline practice Tic-Tac-Toe arena. Completely revamped into a premium, responsive gaming experience with a zero-barrier anonymous lobby. Play offline against a mathematically unbeatable **recursive Minimax AI bot**, practice locally in **Pass & Play**, or host secure **10-minute self-deleting private rooms** via real-time WebSockets to battle friends instantly.

<p align="center">
  <img src="public/logo.png" alt="Tic-Tac-Toe Live Arena Logo" width="160" style="border-radius: 32px; box-shadow: 0 20px 40px rgba(59, 130, 246, 0.3);" />
</p>

---

## 🌟 Core Features

### ⚡ Zero-Friction Guest Matching (No Login Walls)
* **Instant Guest Profile:** No email verification, no signup screens, and absolutely zero forms. Opening the app instantly generates a unique transient guest handle (`Gamer_xxxx`) stored securely in `sessionStorage` or `localStorage`.
* **In-Memory Session Elo:** Tracks match outcomes and calculates ratings dynamically using a real-time ELO formula. Points update instantly on the screen as you win or draw.

### 🔗 Frictionless Direct-Join URLs
* **Instant Direct Links:** Click the **Share Link** button to copy a special direct URL containing the room code (e.g., `https://your-domain.com?room=ROOM_CODE`).
* **Auto-Join Engine:** When a friend clicks the link, the app automatically parses the parameter, establishes the WebSocket connection, enters the lobby, and initiates the game instantly.
* **Clean Address Bar:** Cleans up the browser URL query parameter dynamically after joining to prevent page reload loops or stuck screens.

### ⏱️ 10-Minute Private Rooms & Automatic Expiry
* **Self-Deleting Server State:** Hosted private matches operate on a strict 10-minute countdown. The Node.js WebSocket backend tracks this and deletes rooms automatically.
* **Interactive Ticking Clock:** Displays a live countdown clock (`Expires in 09:59`) inside the match arena.
* **Active Expiry Shield:** Once the room expires, the game board is frozen with a beautifully blurred overlay, preventing further inputs and allowing players to return safely to the lobby.

### 🤖 Unbeatable recursive Minimax AI Bot
* **Easy Mode:** Makes purely random, unpredictable grid moves. Perfect for warmups.
* **Medium Mode:** Employs smart heuristics to capture quick wins, block immediate threats, prioritize center control, and snap up corners before choosing random grids.
* **Hard Mode (Unbeatable):** Runs a mathematically rigorous recursive Minimax tree search. Evaluates every future board possibility to play a completely perfect game. **Guaranteed to win or force a draw—always!**

### 🌓 Premium Adaptive High-Contrast UI
* **Dynamic Theme Switcher:** Fully responsive theme engine transitioning all backgrounds, interactive cards, status banners, icons, and ambient decorative elements smoothly between Dark and Light mode.
* **Seamless Micro-Animations:** Ultra-premium transitions, button hovers, turn indicators, and board animations powered by Framer Motion (`motion/react`).
* **Mobile-First Spacing:** Designed to look stunning on all screen sizes. Custom layouts dynamically shorten long player handles to `You`, `P1`, or `P2` on 320px–375px mobile viewports to prevent layout breakages.

### 🛡️ DoS Prevention & Resource Leak Safeguards
* **One Connection, One Room:** Each active socket connection is strictly limited to at most one hosted room at a time. Creating a new room automatically terminates the player's previously active hosted room.
* **Host-Exit Modal Cleanup:** If the host cancels the wait screen or exits the match lobby, a custom WebSocket trigger (`leave_room`) is pushed, dismantling the room on the server instantly.

---

## 🛠️ Technology Stack

* **Frontend:** React 19, Vite, Tailwind CSS v4, Lucide icons, Framer Motion (`motion/react`), HTML5 Audio Synthesis.
* **Backend:** Node.js, Express, WebSocket (`ws` module), Node Crypto.
* **Development Tooling:** TypeScript 5.8, tsx (TypeScript Execution), esbuild, Git.

---

## 💻 Local Installation & Setup

Follow these simple steps to run the complete full-stack project on your local machine:

### 1. Prerequisites
Ensure you have the following installed:
* [Node.js](https://nodejs.org/) (v18.x or newer)
* [npm](https://www.npmjs.com/) (v9.x or newer)

### 2. Clone the Repository & Install Dependencies
Open your terminal (PowerShell or Bash) and execute:
```bash
# Clone the repository
git clone https://github.com/Rupam852/Tic-Tac-Toe-Game-.git

# Navigate into the project folder
cd Tic-Tac-Toe-Game-

# Install the verified dependencies
npm install
```

### 3. Set Up Environment Variables
Create a `.env.local` file in the root of the project to tell the frontend where the backend server is running:
```env
VITE_BACKEND_URL=http://localhost:3000
```
*(A clean template is also available in `.env.example`)*

### 4. Run the Application
The package is pre-configured with concurrent full-stack dev support:
```bash
npm run dev
```
Vite mounts the development server directly into the Express app middleware. Open your browser and navigate to **[http://localhost:3000](http://localhost:3000)** to launch the game locally!

---

## 🌐 Production Deployment Guide

Deploy the entire app with premium production speed using this simple, cost-free setup:

### 1. Deploy the Backend on Render
1. Sign up/Log in to [Render](https://render.com/).
2. Create a new **Web Service** and connect this GitHub repository.
3. Configure the following settings:
   - **Environment/Runtime:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `node dist/server.cjs`
4. *Render automatically injects the necessary system `PORT` variables. No custom `.env` variables are required on Render!*

### 2. Configure Keep-Alive (Prevent Render Free-Tier Sleep)
Render's free tier spins down services after 15 minutes of inactivity, causing a 50-second "cold-start" delay when a new player attempts to join. To keep the server awake and maintain zero-lag responsiveness:
1. Copy your Render service URL (e.g., `https://tictactoe-backend.onrender.com`).
2. Register for a free account at [Cron-Job.org](https://cron-job.org/) or [UptimeRobot](https://uptimerobot.com/).
3. Add a new monitor or scheduled cron task pointing to your Render server's keep-alive route:
   ```text
   https://your-backend.onrender.com/ping
   ```
4. Schedule the cron job to ping the endpoint **every 10 minutes** to bypass sleep timers.

> [!WARNING]
> **Render Free Account Hour Warning:** Hosting multiple web services on the same free Render account with active keep-alive cron jobs will exceed your 750 free account hours monthly limit (`744 hours/project x 2 projects = 1488 hours`), leading to suspensions.
> 
> *Solution:* Always host separate services or backends on individual Render accounts to stay completely inside the 100% free threshold!

### 3. Deploy the Frontend on Vercel
1. Sign up/Log in to [Vercel](https://vercel.com/).
2. Create a new project and import your GitHub repository.
3. Under **Project Settings -> Environment Variables**, add:
   - **Key:** `VITE_BACKEND_URL`
   - **Value:** Your live Render backend URL (e.g., `https://your-backend.onrender.com` - *omit trailing `/ws` or `/`*)
4. Click **Deploy**. Vercel will bundle the frontend asset files with high-speed CDN hosting.

---

## 💡 System Design & Security

### WebSocket Event Protocol
Communication between the clients and the server uses robust, structured JSON messages:
* `register_socket`: Pairs the active socket with the visitor's anonymous `uid` profile.
* `create_room`: Generates a secure, 6-character alphabetic room code (omitting confusing characters like `O`, `0`, `I`, and `1`).
* `join_room`: Links the opponent to the active game board.
* `make_move`: Validates and propagates moves across both players instantly.
* `chat_send`: Safe real-time match chat with zero DB storage.
* `rematch_offer` / `rematch_accept`: Restarts active boards instantly.
* `leave_room`: Triggered on host exit, wait screen close, or logout to destroy lingering memory.

### Resource Safeguards
* **Anti-Memory Leak:** Room lists, ELO ratings, and active connections are held entirely in transient system memory. Strict socket close listeners prune all maps to keep RAM footprint minimal.
* **Automatic Room Expiry:** Room timers are monitored and cleared immediately when games end naturally or when players disconnect, keeping memory overhead at absolute zero.

---

## ⚖️ License
This project is open-source and licensed under the **Apache License, Version 2.0**. See the [LICENSE](LICENSE) file for more information.
