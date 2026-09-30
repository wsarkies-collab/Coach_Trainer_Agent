// Shared bits for the Vercel API functions: CORS, method check, sign-in, limits.

import { identifyUser } from "./auth.js";
import * as memory from "./memory.js";

const allowed = () => (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);

/** Handles CORS + method. Returns false if the request was already answered. */
export function prepare(req, res) {
  const origin = req.headers.origin;
  const list = allowed();
  if (origin && (list.length === 0 || list.includes(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") { res.status(204).end(); return false; }
  if (req.method !== "POST") { res.status(405).json({ error: "Use POST." }); return false; }
  if (origin && list.length && !list.includes(origin)) { res.status(403).json({ error: "This site isn't allowed to use the coach." }); return false; }
  return true;
}

/** Returns the signed-in user's id, or answers 401 and returns null. */
export async function requireUser(req, res) {
  let userId = null;
  try { userId = await identifyUser(req.body?.userToken); } catch (e) { console.error(e); }
  if (!userId) res.status(401).json({ error: "Please sign in to chat with your coach." });
  return userId;
}

/** Per-user limits so a runaway client (or user) can't run up your bill. */
export async function overLimit(userId) {
  const perMin = Number(process.env.RATE_LIMIT_PER_MIN || 6);
  const perDay = Number(process.env.DAILY_MESSAGE_LIMIT || 50);
  const now = Date.now();
  const [lastMin, lastDay] = await Promise.all([
    memory.countUserMessagesSince(userId, new Date(now - 60_000).toISOString()),
    memory.countUserMessagesSince(userId, new Date(now - 86_400_000).toISOString()),
  ]);
  if (lastDay >= perDay) return "You've reached today's message limit with your coach. Check back tomorrow.";
  if (lastMin >= perMin) return "Slow down a little and try again in a minute.";
  return null;
}
