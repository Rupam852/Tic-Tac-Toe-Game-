/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Trophy, History, Search, Share2, Award, Zap, TrendingUp, Check, X, Twitter, Send } from "lucide-react";
import { LeaderboardEntry, MatchHistoryItem } from "../types";
import { playSound } from "../utils/audio";

interface LeaderboardProps {
  backendUrl?: string;
  currentUserId?: string;
  soundVolume: number;
}

export default function Leaderboard({ backendUrl = "", currentUserId, soundVolume }: LeaderboardProps) {
  const [boardData, setBoardData] = useState<LeaderboardEntry[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchHistoryItem[]>([]);
  const [activeTab, setActiveTab] = useState<"ranks" | "history">("ranks");
  const [filterQuery, setFilterQuery] = useState("");
  const [shareTargetEntry, setShareTargetEntry] = useState<LeaderboardEntry | null>(null);
  const [shareSuccess, setShareSuccess] = useState(false);

  useEffect(() => {
    // Fetch data from restful routes
    const fetchStats = async () => {
      try {
        const resL = await fetch(`${backendUrl}/api/leaderboard`);
        if (resL.ok) {
          const datL = await resL.json();
          setBoardData(datL);
        }

        const resH = await fetch(`${backendUrl}/api/history`);
        if (resH.ok) {
          const datH = await resH.json();
          setMatchHistory(datH);
        }
      } catch (err) {
        console.error("Failed downloading leaderboard statistics:", err);
      }
    };

    fetchStats();
    // Fetch statistics periodically to remain real-time
    const interval = setInterval(fetchStats, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleShareClick = (entry: LeaderboardEntry) => {
    playSound("click", soundVolume);
    setShareTargetEntry(entry);
    setShareSuccess(false);
  };

  const executeShare = (platform: string) => {
    playSound("click", soundVolume);
    setShareSuccess(true);
    setTimeout(() => {
      setShareSuccess(false);
      setShareTargetEntry(null);
    }, 2000);
  };

  const filteredLeaderboard = boardData.filter((entry) =>
    entry.username.toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <div className="w-full rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 transition-colors duration-200">
      {/* Tab Switchers */}
      <div className="flex gap-2.5 p-1 bg-slate-50 dark:bg-[#0B1120] rounded-xl">
        <button
          id="leaderboard-tab-ranks"
          onClick={() => {
            playSound("click", soundVolume);
            setActiveTab("ranks");
          }}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold tracking-wide transition-all hover:scale-[1.01] active:scale-[0.99] duration-155 ${
            activeTab === "ranks"
              ? "bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white"
              : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <Trophy className="h-4 w-4 text-amber-500" />
          Global Leaderboard
        </button>
        <button
          id="leaderboard-tab-history"
          onClick={() => {
            playSound("click", soundVolume);
            setActiveTab("history");
          }}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold tracking-wide transition-all hover:scale-[1.01] active:scale-[0.99] duration-155 ${
            activeTab === "history"
              ? "bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white"
              : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <History className="h-4 w-4 text-blue-500" />
          Match Archive
        </button>
      </div>

      <div className="mt-4">
        {activeTab === "ranks" ? (
          <div>
            {/* Search Input */}
            <div className="relative mb-4">
              <Search className="absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
              <input
                id="leaderboard-search"
                type="text"
                placeholder="Search username..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pr-4 pl-10 text-xs focus:ring-1 focus:ring-blue-500 dark:border-slate-800 dark:bg-[#0B1120] dark:text-white"
              />
            </div>

            {/* List Row */}
            <div className="overflow-y-auto max-h-96 space-y-2 pr-1">
              {filteredLeaderboard.length === 0 ? (
                <p className="text-center text-xs text-slate-500 py-6 dark:text-slate-400">
                  No matches or players found. Be the first!
                </p>
              ) : (
                filteredLeaderboard.map((entry, idx) => {
                  const isCur = entry.uid === currentUserId;
                  return (
                    <motion.div
                      key={entry.uid}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(idx * 0.05, 0.4) }}
                      className={`flex items-center justify-between rounded-xl p-3 border transition-all ${
                        isCur
                          ? "bg-blue-50/50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900/50"
                          : "bg-slate-50/50 border-slate-200/50 dark:bg-slate-950/20 dark:border-slate-850"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Rank Badge */}
                        <div className="flex h-6 w-6 items-center justify-center rounded-lg font-mono text-xs font-bold">
                          {entry.rank === 1 ? (
                            <span className="text-lg">🥇</span>
                          ) : entry.rank === 2 ? (
                            <span className="text-lg">🥈</span>
                          ) : entry.rank === 3 ? (
                            <span className="text-lg">🥉</span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-505">#{entry.rank}</span>
                          )}
                        </div>

                        <div>
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 leading-normal">
                            {entry.username}
                            {isCur && (
                              <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[9px] font-medium text-white">
                                You
                              </span>
                            )}
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            W:{entry.wins} · L:{entry.losses} · D:{entry.draws}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                            <Zap className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                            {entry.rating}
                          </span>
                          <span className="text-[9px] text-green-500 font-medium">Rating</span>
                        </div>

                        <button
                          id={`share-btn-${entry.uid}`}
                          onClick={() => handleShareClick(entry)}
                          className="rounded-lg p-1.5 text-slate-405 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-850 dark:hover:text-slate-350 transition-all hover:scale-110 duration-155 active:scale-95"
                          title="Share score"
                        >
                          <Share2 className="h-4 w-4" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          /* Match Archives */
          <div className="overflow-y-auto max-h-[440px] space-y-2.5 pr-1">
            {matchHistory.length === 0 ? (
              <p className="text-center text-xs text-slate-500 py-6 dark:text-slate-400">
                No local or online records recorded yet.
              </p>
            ) : (
              matchHistory.map((item) => {
                const wasDraw = item.winner === "draw";
                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-slate-205 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-[#0B1120]/40"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-705 dark:text-slate-300">
                          <span className="text-slate-905 dark:text-white">{item.playerX}</span>
                          <span className="text-[10px] text-slate-400">vs</span>
                          <span className="text-slate-905 dark:text-slate-200">{item.playerO}</span>
                        </div>
                        <span className="text-[9px] text-slate-400 font-mono">
                          {new Date(item.createdAt).toLocaleDateString()} at{" "}
                          {new Date(item.createdAt).toLocaleTimeString()}
                        </span>
                      </div>

                      <div className="text-right">
                        {wasDraw ? (
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-650 dark:bg-slate-800 dark:text-slate-400">
                            Draw match
                          </span>
                        ) : (
                          <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                            {item.winner} won
                          </span>
                        )}

                        {/* rating differential tags */}
                        {item.ratingChangeX !== undefined && (
                          <div className="mt-1 flex justify-end gap-1 text-[9px] font-mono font-medium">
                            <span className="text-emerald-500">+{item.ratingChangeX} Elo</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Social Scoring Drawer Dialog */}
      <AnimatePresence>
        {shareTargetEntry && (
          <div id="share-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
            >
              <div className="flex items-center justify-between border-b pb-3 dark:border-slate-800">
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  Share Competitive Score
                </span>
                <button
                  id="close-share-btn"
                  onClick={() => {
                    playSound("click", soundVolume);
                    setShareTargetEntry(null);
                  }}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-150 dark:hover:bg-slate-800 hover:text-rose-500 transition-all hover:scale-110 duration-155 active:scale-90"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Share card visualization */}
              <div className="mt-4 rounded-xl bg-linear-to-br from-blue-600 to-indigo-700 p-5 text-white shadow-md text-center">
                <Award className="h-8 w-8 mx-auto text-amber-300 animate-bounce" />
                <h4 className="mt-2 font-bold tracking-tight text-lg">Tic-Tac-Toe Live Match card</h4>
                <p className="mt-1 font-mono text-xl font-black text-amber-300">
                  ELO: {shareTargetEntry.rating}
                </p>
                <p className="mt-3 text-xs leading-relaxed opacity-90">
                  🏆 Player <span className="font-bold">{shareTargetEntry.username}</span> registered {shareTargetEntry.wins} victories in global matchups!
                </p>
              </div>

              <div className="mt-5 space-y-2.5">
                {shareSuccess ? (
                  <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-600 dark:bg-emerald-950/20">
                    <Check className="h-4 w-4" />
                    Success! Published on Feed
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      id="share-twitter-btn"
                      onClick={() => executeShare("Twitter")}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-705 dark:border-slate-800 dark:text-slate-300 transition-all hover:bg-slate-50 dark:hover:bg-slate-800 hover:scale-[1.02] active:scale-[0.98] duration-155"
                    >
                      <Twitter className="h-4 w-4 text-sky-500 fill-sky-500" />
                      Twitter / X
                    </button>
                    <button
                      id="share-feed-btn"
                      onClick={() => executeShare("Lobby")}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white transition-all hover:bg-blue-500 hover:scale-[1.02] active:scale-[0.98] duration-155 shadow-md shadow-blue-500/10"
                    >
                      <Send className="h-4 w-4" />
                      Share to Feed
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
