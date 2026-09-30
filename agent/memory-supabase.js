// Coach memory in Supabase (tables from supabase/migrations/..._coach_memory.sql).

import { getSupabase } from "./supabase.js";

const MAX_NOTES = 60;
const HISTORY_FOR_SEARCH = 500;

function check(error, what) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

export async function getMemory(userId) {
  const db = await getSupabase();
  const [notes, msgs] = await Promise.all([
    db.from("coach_notes").select("id, text, created_at").eq("user_id", userId).order("created_at", { ascending: true }).limit(MAX_NOTES),
    db.from("coach_messages").select("role, content, created_at").eq("user_id", userId).order("id", { ascending: false }).limit(50),
  ]);
  check(notes.error, "Reading coach notes");
  check(msgs.error, "Reading coach messages");
  return {
    notes: notes.data.map((n) => ({ id: n.id, text: n.text, createdAt: n.created_at })),
    conversation: msgs.data.reverse().map((m) => ({ role: m.role, content: m.content, at: m.created_at })),
  };
}

export async function addNote(userId, text) {
  const db = await getSupabase();
  const { data, error } = await db.from("coach_notes").insert({ user_id: userId, text: String(text).slice(0, 300) }).select("id, text, created_at").single();
  check(error, "Saving coach note");
  // Keep only the newest MAX_NOTES.
  const { data: old } = await db.from("coach_notes").select("id").eq("user_id", userId).order("created_at", { ascending: false }).range(MAX_NOTES, MAX_NOTES + 50);
  if (old?.length) await db.from("coach_notes").delete().in("id", old.map((o) => o.id));
  return { id: data.id, text: data.text, createdAt: data.created_at };
}

export async function removeNote(userId, noteId) {
  const db = await getSupabase();
  const { data, error } = await db.from("coach_notes").delete().eq("user_id", userId).eq("id", noteId).select("id");
  check(error, "Removing coach note");
  return data.length > 0;
}

export async function appendTurns(userId, turns) {
  const db = await getSupabase();
  const { error } = await db.from("coach_messages").insert(turns.map((t) => ({ user_id: userId, role: t.role, content: t.content })));
  check(error, "Saving coach messages");
}

export async function searchConversation(userId, query, limit = 8) {
  const db = await getSupabase();
  const { data, error } = await db.from("coach_messages").select("role, content, created_at").eq("user_id", userId).order("id", { ascending: false }).limit(HISTORY_FOR_SEARCH);
  check(error, "Searching coach messages");
  const convo = data.reverse();
  const words = String(query).toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const hits = [];
  for (let i = convo.length - 1; i >= 0 && hits.length < limit; i--) {
    const t = convo[i];
    if (t.role !== "user" || !words.some((w) => t.content.toLowerCase().includes(w))) continue;
    const answer = convo[i + 1]?.role === "assistant" ? convo[i + 1].content : "";
    hits.push({ date: t.created_at.slice(0, 10), question: t.content.slice(0, 500), answer: answer.slice(0, 800) });
  }
  return hits;
}

export async function countUserMessagesSince(userId, sinceIso) {
  const db = await getSupabase();
  const { count, error } = await db.from("coach_messages").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("role", "user").gte("created_at", sinceIso);
  check(error, "Counting messages");
  return count ?? 0;
}

export async function clearMemory(userId) {
  const db = await getSupabase();
  const [a, b] = await Promise.all([
    db.from("coach_notes").delete().eq("user_id", userId),
    db.from("coach_messages").delete().eq("user_id", userId),
  ]);
  check(a.error, "Clearing coach notes");
  check(b.error, "Clearing coach messages");
}
