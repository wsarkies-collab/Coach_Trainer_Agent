// Coach memory in a local JSON file: used ONLY for local testing without Supabase.
// In production, memory-supabase.js is used (see memory.js).

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const FILE = process.env.MEMORY_FILE || path.resolve("data/memory.json");
const MAX_TURNS = 500; // per user, oldest dropped first
const MAX_NOTES = 60;

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {}; }
}
function save(db) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}
function user(db, userId) {
  return (db[userId] ||= { notes: [], conversation: [] });
}

export async function getMemory(userId) {
  const m = load()[userId];
  return { notes: m?.notes ?? [], conversation: m?.conversation ?? [] };
}

export async function addNote(userId, text) {
  const db = load();
  const u = user(db, userId);
  const note = { id: "n_" + crypto.randomBytes(4).toString("hex"), text: String(text).slice(0, 300), createdAt: new Date().toISOString() };
  u.notes.push(note);
  u.notes = u.notes.slice(-MAX_NOTES);
  save(db);
  return note;
}

export async function removeNote(userId, noteId) {
  const db = load();
  const u = user(db, userId);
  const before = u.notes.length;
  u.notes = u.notes.filter((n) => n.id !== noteId);
  save(db);
  return before !== u.notes.length;
}

export async function appendTurns(userId, turns) {
  const db = load();
  const u = user(db, userId);
  const at = new Date().toISOString();
  u.conversation.push(...turns.map((t) => ({ role: t.role, content: t.content, at })));
  u.conversation = u.conversation.slice(-MAX_TURNS);
  save(db);
}

/** Simple keyword search over past questions and answers, newest first. */
export async function searchConversation(userId, query, limit = 8) {
  const { conversation } = await getMemory(userId);
  const words = String(query).toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const hits = [];
  for (let i = conversation.length - 1; i >= 0 && hits.length < limit; i--) {
    const t = conversation[i];
    if (t.role !== "user") continue;
    const text = t.content.toLowerCase();
    if (words.length && words.some((w) => text.includes(w))) {
      const answer = conversation[i + 1]?.role === "assistant" ? conversation[i + 1].content : "";
      hits.push({ date: t.at.slice(0, 10), question: t.content.slice(0, 500), answer: answer.slice(0, 800) });
    }
  }
  return hits;
}

/** How many messages the user sent since a given time (for rate limits). */
export async function countUserMessagesSince(userId, sinceIso) {
  const { conversation } = await getMemory(userId);
  return conversation.filter((t) => t.role === "user" && t.at >= sinceIso).length;
}

/** Deletes everything the coach remembers about a user. */
export async function clearMemory(userId) {
  const db = load();
  delete db[userId];
  save(db);
}
