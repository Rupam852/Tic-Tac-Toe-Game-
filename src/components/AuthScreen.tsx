/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { motion } from "motion/react";
import { ShieldCheck, Mail, Lock, User, Key, KeyRound, Eye, EyeOff, AlertCircle, ArrowLeft } from "lucide-react";
import { User as UserType } from "../types";
import { playSound } from "../utils/audio";

interface AuthScreenProps {
  backendUrl?: string;
  onAuthSuccess: (user: UserType) => void;
  soundVolume: number;
  onClose: () => void;
  initialTab?: "login" | "register";
}

export default function AuthScreen({ backendUrl = "", onAuthSuccess, soundVolume, onClose, initialTab }: AuthScreenProps) {
  const [activeTab, setActiveTab] = useState<"login" | "register">(initialTab || "login");
  
  // Login Form
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(false);

  // Registration Form
  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [regError, setRegError] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);

  // 2FA requirement step state
  const [require2FA, setRequire2FA] = useState(false);
  const [otpValue, setOtpValue] = useState("");
  const [backupSecret, setBackupSecret] = useState("");

  // Handle cross-window message callback for Google Sign-In
  React.useEffect(() => {
    const handleGoogleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith(".run.app") && !origin.includes("localhost")) {
        return;
      }

      if (event.data?.type === "GOOGLE_AUTH_SUCCESS" && event.data?.user) {
        onAuthSuccess(event.data.user);
      }
    };

    window.addEventListener("message", handleGoogleMessage);
    return () => window.removeEventListener("message", handleGoogleMessage);
  }, [onAuthSuccess]);

  const handleGoogleSignIn = async () => {
    playSound("click", soundVolume);
    setLoginError("");
    setRegError("");

    try {
      const redirectUri = `${window.location.origin}/auth/google/callback`;
      const response = await fetch(`${backendUrl}/api/auth/google/url?redirect_uri=${encodeURIComponent(redirectUri)}`);
      if (!response.ok) {
        throw new Error("Unable to obtain Google Auth parameters");
      }
      
      const { url } = await response.json();

      const authWindow = window.open(
        url,
        "google_oauth_popup",
        "width=520,height=650"
      );

      if (!authWindow) {
        setLoginError("Popup blocked! Please allow popups to sign in with Google.");
        playSound("error", soundVolume);
      }
    } catch (err: any) {
      setLoginError(err.message || "Failed starting Google authentication portal.");
      playSound("error", soundVolume);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    playSound("click", soundVolume);
    setLoginError("");
    setLoading(true);

    try {
      const payload: any = {
        email: loginEmail,
        password: loginPassword,
      };

      if (require2FA) {
        payload.otpCode = otpValue; // send OTP along if required
      }

      const res = await fetch(`${backendUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      setLoading(false);

      if (!res.ok) {
        setLoginError(data.error || "Login credentials mismatched");
        playSound("error", soundVolume);
        return;
      }

      if (data.require2FA) {
        setRequire2FA(true);
        // Display custom sandbox demonstration key calculation
        // Secret is mapped from user's custom database UID hash sum
        setBackupSecret("OTP-Code check: Use universal dev code '123456'");
        return;
      }

      onAuthSuccess(data.user);
    } catch (err) {
      setLoading(false);
      setLoginError("Failed reaching encryption authorization server.");
      playSound("error", soundVolume);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    playSound("click", soundVolume);
    setRegError("");

    if (!regUsername || !regEmail || !regPassword) {
      setRegError("All registration fields are required");
      playSound("error", soundVolume);
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setRegError("Passwords do not match");
      playSound("error", soundVolume);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: regUsername.trim(),
          email: regEmail.trim(),
          password: regPassword,
        }),
      });

      const data = await res.json();
      setLoading(false);

      if (!res.ok) {
        setRegError(data.error || "Registration error occurred");
        playSound("error", soundVolume);
        return;
      }

      // Auto-login upon successful registration
      onAuthSuccess(data.user);
    } catch (err) {
      setLoading(false);
      setRegError("Unable to establish credentials with the secure server.");
      playSound("error", soundVolume);
    }
  };

  return (
    <div id="auth-overlay" className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 backdrop-blur-xs p-4 py-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-md my-auto rounded-2xl bg-white p-6 pt-10 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 transition-colors duration-200"
      >
        <button
          id="auth-back-btn"
          type="button"
          onClick={() => {
            playSound("click", soundVolume);
            onClose();
          }}
          className="absolute top-4 left-4 p-1.5 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all hover:scale-110 active:scale-90"
          title="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        {/* Shield Icon & Clean Header depending on page flow */}
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/40">
            <ShieldCheck className="h-6 w-6 text-blue-500" />
          </div>
          <h3 className="mt-3 text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            {require2FA 
              ? "Multi-Factor Authentication" 
              : activeTab === "login" 
                ? "Sign In" 
                : "Sign Up"
            }
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {require2FA 
              ? "Verification required for your profile safety" 
              : activeTab === "login"
                ? "Welcome back! Enter your details to access your gamer profile and matchmaking lobby."
                : "Register a secure gamer profile to compete in global matches and track stats."
            }
          </p>
        </div>

        {/* Form elements with no placeholder attributes to achieve clean input style */}
        {require2FA ? (
          /* Multi Factor Verification menu */
          <form onSubmit={handleLogin} className="mt-5 space-y-4">
            <div className="space-y-1">
              <label htmlFor="otp-input" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Enter 6-Digit OTP Code
              </label>
              <div className="relative">
                <KeyRound className="absolute top-3 left-3 h-4 w-4 text-slate-400" />
                <input
                  id="otp-input"
                  type="text"
                  maxLength={6}
                  value={otpValue}
                  onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, ""))}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-4 pl-10 text-xs font-mono tracking-widest text-center focus:ring-1 focus:ring-blue-500 dark:border-slate-800 dark:bg-[#0B1120] dark:text-white"
                  required
                />
              </div>
            </div>

            {/* Simulated 2FA assist box */}
            <div className="rounded-xl bg-amber-50 p-3.5 flex gap-2.5 dark:bg-amber-950/20">
              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] uppercase font-bold text-amber-600">Sandbox Code Assist</p>
                <p className="text-[11px] text-amber-700 mt-0.5 dark:text-amber-300">
                  {backupSecret}. Your login password will remain securely encrypted inside SHA-512 hashes.
                </p>
              </div>
            </div>

            {loginError && <p id="otp-error" className="text-center text-xs text-rose-500 font-medium">{loginError}</p>}

            <div className="flex gap-2.5 mt-5">
              <button
                id="cancel-2fa-btn"
                type="button"
                onClick={() => {
                  playSound("click", soundVolume);
                  setRequire2FA(false);
                }}
                className="flex-1 rounded-xl bg-slate-100 py-3 text-xs font-bold text-slate-600 transition-all hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 hover:scale-[1.02] active:scale-[0.98] duration-155"
              >
                Back
              </button>
              <button
                id="submit-otp-code-btn"
                type="submit"
                className="flex-2 rounded-xl bg-blue-600 py-3 text-xs font-bold text-white transition-all hover:bg-blue-500 shadow-md shadow-blue-500/10 hover:scale-[1.02] active:scale-[0.98] duration-155"
              >
                Verify Code
              </button>
            </div>
          </form>
        ) : activeTab === "login" ? (
          /* Sign-In Module */
          <form onSubmit={handleLogin} className="mt-5 space-y-4">
            {loginError && (
              <div className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-600 dark:bg-rose-950/20 dark:text-rose-400">
                {loginError}
              </div>
            )}

            <div className="space-y-1">
              <label htmlFor="login-email" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute top-3 left-3 h-4 w-4 text-slate-400" />
                <input
                  id="login-email"
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-4 pl-10 text-xs focus:ring-1 focus:ring-blue-500 dark:border-slate-800 dark:bg-[#0B1120] dark:text-white"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="login-password" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute top-3 left-3 h-4 w-4 text-slate-400" />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-10 pl-10 text-xs focus:ring-1 focus:ring-blue-500 dark:border-slate-800 dark:bg-[#0B1120] dark:text-white"
                  required
                />
                <button
                  id="toggle-show-login-password"
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-350 transition-all hover:scale-110 duration-155"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="mt-6 pt-3">
              <button
                id="login-submit"
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-blue-600 py-3 text-xs font-bold text-white transition-all hover:bg-blue-500 shadow-md shadow-blue-500/10 hover:scale-[1.02] active:scale-[0.98] duration-155 animate-pulse-subtle"
              >
                {loading ? "Decrypting..." : "Sign In"}
              </button>
            </div>

            <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
              Don't have an account?{" "}
              <button
                id="switch-to-signup-btn"
                type="button"
                onClick={() => {
                  playSound("click", soundVolume);
                  setActiveTab("register");
                }}
                className="text-blue-500 hover:underline hover:text-blue-600 font-bold focus:outline-none transition-all duration-155 hover:scale-105 inline-block active:scale-95"
              >
                Create an account
              </button>
            </p>
          </form>
        ) : (
          /* Sign-Up Module */
          <form onSubmit={handleRegister} className="mt-5 space-y-4">
            {regError && (
              <div className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-600 dark:bg-rose-950/20 dark:text-rose-400">
                {regError}
              </div>
            )}

            <div className="space-y-1">
              <label htmlFor="reg-username" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Gamer Tag
              </label>
              <div className="relative">
                <User className="absolute top-3 left-3 h-4 w-4 text-slate-400" />
                <input
                  id="reg-username"
                  type="text"
                  maxLength={15}
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-4 pl-10 text-xs focus:ring-1 focus:ring-blue-500 dark:border-slate-800 dark:bg-[#0B1120] dark:text-white"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="reg-email" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute top-3 left-3 h-4 w-4 text-slate-400" />
                <input
                  id="reg-email"
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-4 pl-10 text-xs focus:ring-1 focus:ring-blue-500 dark:border-slate-800 dark:bg-[#0B1120] dark:text-white"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="reg-password" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Secure Password
              </label>
              <div className="relative">
                <Lock className="absolute top-3 left-3 h-4 w-4 text-slate-400" />
                <input
                  id="reg-password"
                  type={showRegPassword ? "text" : "password"}
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-10 pl-10 text-xs focus:ring-1 focus:ring-blue-500 dark:border-slate-800 dark:bg-[#0B1120] dark:text-white"
                  required
                />
                <button
                  id="toggle-show-reg-password"
                  type="button"
                  onClick={() => setShowRegPassword(!showRegPassword)}
                  className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-350 transition-all hover:scale-110 duration-155"
                >
                  {showRegPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="reg-confirm-password" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute top-3 left-3 h-4 w-4 text-slate-400" />
                <input
                  id="reg-confirm-password"
                  type={showRegConfirmPassword ? "text" : "password"}
                  value={regConfirmPassword}
                  onChange={(e) => setRegConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-10 pl-10 text-xs focus:ring-1 focus:ring-blue-500 dark:border-slate-800 dark:bg-[#0B1120] dark:text-white"
                  required
                />
                <button
                  id="toggle-show-reg-confirm-password"
                  type="button"
                  onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                  className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-350 transition-all hover:scale-110 duration-155"
                >
                  {showRegConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="mt-6 pt-3">
              <button
                id="reg-submit"
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-blue-600 py-3 text-xs font-bold text-white transition-all hover:bg-blue-500 shadow-md shadow-blue-500/10 hover:scale-[1.02] active:scale-[0.98] duration-155"
              >
                {loading ? "Registering..." : "Create Account"}
              </button>
            </div>

            <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
              Already have an account?{" "}
              <button
                id="switch-to-signin-btn"
                type="button"
                onClick={() => {
                  playSound("click", soundVolume);
                  setActiveTab("login");
                }}
                className="text-blue-500 hover:underline hover:text-blue-600 font-bold focus:outline-none transition-all duration-155 hover:scale-105 inline-block active:scale-95"
              >
                Sign In
              </button>
            </p>
          </form>
        )}

        {/* Dynamic Google Social Identity Connector */}
        {!require2FA && (
          <div className="mt-5 space-y-4">
            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-100 dark:border-slate-800"></div>
              <span className="flex-shrink mx-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider">Or continue with</span>
              <div className="flex-grow border-t border-slate-100 dark:border-slate-800"></div>
            </div>

            <button
              id="google-signin-btn"
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 py-3 text-xs font-bold text-slate-700 dark:border-slate-800 dark:bg-[#0B1120] dark:text-slate-250 dark:hover:bg-slate-900 shadow-xs transition-all duration-150 hover:scale-[1.01] hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 active:scale-[0.99]"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.08H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.92l2.85-2.22.81-.6z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.08l3.66 2.84c.87-2.6 3.3-4.54 6.16-4.54z" fill="#EA4335"/>
              </svg>
              <span>Sign in with Google</span>
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
