// READ-ONLY access to YOUR APP's data in Supabase: the user's profile and workout logs.
// The coach never changes anything in your app.
//
// healthandfitness doesn't fit the generic PROFILE_TABLE/WORKOUTS_TABLE shape
// this file usually reads from env vars, so both functions below are
// hand-written for its actual schema instead (per the README's "if your
// schema needs more than this, edit the two functions below"):
//
// - Everything lives in a single-row `settings` table (id = true), not a
//   per-user `profiles` row keyed some other way — see healthandfitness's
//   supabase/setup.sql. A `user_id` column was added there (see
//   supabase/add-coach-auth.sql) purely so this file has something real to
//   filter on now that trainer-agent requires a real Supabase Auth user.
// - getAppProfile selects an explicit allowlist of genuinely profile-like
//   columns (goal, level, body stats, program setup) rather than `*` —
//   the rest of that row is operational state (workout_logs,
//   workout_custom_exercises, workout_chat_log, etc.), not profile info,
//   and would just bloat/confuse the coach's system prompt if dumped in.
// - getWorkoutLogs reads and unpacks `workout_logs`, a JSONB blob keyed
//   "<date>::<slotKey>" -> [{reps, weight, name, repRange}], rather than
//   querying a real per-session WORKOUTS_TABLE (there isn't one) — see
//   parseWorkoutLogs below.
//
// Without Supabase configured, demo/app-data.json is used so you can test locally.

import fs from "node:fs";
import path from "node:path";
import { getSupabase } from "./supabase.js";

const env = (k, d) => process.env[k] || d;

// Columns the coach doesn't need (and shouldn't see).
const HIDE = /^(id|.*_id|email|phone.*|avatar.*|.*token.*|.*password.*|stripe.*|.*customer.*|updated_at|inserted_at)$/i;
export function stripPrivate(value) {
  if (Array.isArray(value)) return value.map(stripPrivate);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) if (!HIDE.test(k) && v !== null) out[k] = stripPrivate(v);
    return out;
  }
  return value;
}

function demo() {
  try { return JSON.parse(fs.readFileSync(path.resolve("demo/app-data.json"), "utf8")); } catch { return {}; }
}

const PROFILE_TABLE = "settings";
const PROFILE_USER_COLUMN = "user_id";
// The genuinely "profile" columns on that row (goals, body stats, program
// setup, experience level) — everything else on `settings` is operational
// app state, not something a coach describes back to a user as their profile.
const PROFILE_COLUMNS = [
  "goal", "steps_goal", "goal_weight", "target_date", "gender", "height_cm", "age",
  "workout_sessions_per_week", "workout_focus", "workout_split_style", "workout_lifter_level",
];

/** The user's profile as your app stores it. */
export async function getAppProfile(userId) {
  const supabase = await getSupabase();
  if (!supabase) return demo()[userId]?.profile ?? null;
  const { data, error } = await supabase
    .from(PROFILE_TABLE)
    .select(PROFILE_COLUMNS.join(","))
    .eq(PROFILE_USER_COLUMN, userId)
    .maybeSingle();
  if (error) throw new Error(`Reading profile: ${error.message}`);
  return data ? stripPrivate(data) : null;
}

// workout_logs keys look like "2026-09-25::chestBack::Machine Chest Press"
// (date::sessionSlot::exerciseName) -> an array of sets logged that day for
// that slot, e.g. [{ reps: "8", weight: "60", name: "Machine Chest Press" }].
// Grouped here into the {date, exercises:[{name, sets}]} shape
// systemPrompt.js's formatLogs() renders specially (reps x weight per set);
// anything malformed just falls through to its generic JSON fallback.
export function parseWorkoutLogs(rawLogs, { limit = 10, exercise, since } = {}) {
  const wanted = exercise ? String(exercise).toLowerCase() : null;
  const byDate = new Map();
  for (const [key, entries] of Object.entries(rawLogs || {})) {
    const date = key.slice(0, 10);
    if (since && date < since) continue;
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || (!entry.reps && !entry.weight)) continue; // a blank logged-but-empty set
      const name = String(entry.name || "Exercise");
      if (wanted && !name.toLowerCase().includes(wanted)) continue;
      if (!byDate.has(date)) byDate.set(date, new Map());
      const exercises = byDate.get(date);
      if (!exercises.has(name)) exercises.set(name, []);
      exercises.get(name).push({
        reps: entry.reps != null && entry.reps !== "" ? Number(entry.reps) : null,
        weightKg: entry.weight != null && entry.weight !== "" ? Number(entry.weight) : null,
      });
    }
  }
  return [...byDate.entries()]
    .map(([date, exercises]) => ({ date, exercises: [...exercises.entries()].map(([name, sets]) => ({ name, sets })) }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, limit);
}

/** The user's logged workouts, newest first. */
export async function getWorkoutLogs(userId, { limit = 10, exercise, since } = {}) {
  const supabase = await getSupabase();

  if (!supabase) {
    const wanted = exercise ? String(exercise).toLowerCase() : null;
    const hasExercise = (w) => JSON.stringify(w).toLowerCase().includes(wanted);
    let list = [...(demo()[userId]?.workouts ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1));
    if (since) list = list.filter((w) => w.date >= since);
    if (wanted) list = list.filter(hasExercise);
    return list.slice(0, limit);
  }

  const { data, error } = await supabase
    .from(PROFILE_TABLE)
    .select("workout_logs")
    .eq(PROFILE_USER_COLUMN, userId)
    .maybeSingle();
  if (error) throw new Error(`Reading workouts: ${error.message}`);
  return parseWorkoutLogs(data?.workout_logs, { limit, exercise, since });
}
