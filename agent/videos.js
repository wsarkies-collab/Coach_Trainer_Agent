// Finds instructional videos for an exercise, from YOUR APP's saved videos.
//
// Point it at wherever your app keeps them (env vars, defaults shown):
//   EXERCISE_VIDEOS_TABLE=exercise_videos    the table (could also be your "exercises" table)
//   EXERCISE_VIDEOS_NAME_COLUMN=exercise     exercise name, e.g. "Romanian deadlift"
//   EXERCISE_VIDEOS_URL_COLUMN=url           YouTube link or video id (any format), or an .mp4/.webm URL
//   EXERCISE_VIDEOS_TITLE_COLUMN=title       optional
//   EXERCISE_VIDEOS_ALIASES_COLUMN=aliases   optional: other names ("RDL"), as an array or comma-separated text
//   VIDEO_FALLBACK=none                      when your library has no match: "none" (say so),
//                                            "search" (YouTube search button), or "youtube" (YouTube API, needs YOUTUBE_API_KEY)
//
// Without Supabase configured, videos/exercise-videos.json is used (for local testing).

import fs from "node:fs";
import path from "node:path";
import { getSupabase } from "./supabase.js";

const env = (k, d) => process.env[k] || d;
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// --- URLs: accept the formats apps usually store --------------------------------
/** Turns an 11-character id, youtu.be / shorts / embed / watch links, or a scheme-less link into a full URL. */
export function normalizeVideoUrl(raw) {
  let u = String(raw || "").trim();
  if (!u) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(u)) return `https://www.youtube.com/watch?v=${u}`;
  if (!/^https?:\/\//i.test(u)) u = "https://" + u.replace(/^\/+/, "");
  u = u.replace(/^http:\/\//i, "https://");
  const id = u.match(/^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([A-Za-z0-9_-]{11})/i);
  if (id) return `https://www.youtube.com/watch?v=${id[1]}`;
  if (/^https:\/\/[^\s]+\.(mp4|webm)(\?[^\s]*)?$/i.test(u)) return u;
  return null; // not something the chat can play
}

// --- Your library ----------------------------------------------------------------
function mapRow(row) {
  const aliasesRaw = row[env("EXERCISE_VIDEOS_ALIASES_COLUMN", "aliases")];
  const aliases = Array.isArray(aliasesRaw) ? aliasesRaw : typeof aliasesRaw === "string" ? aliasesRaw.split(",") : [];
  const exercise = row[env("EXERCISE_VIDEOS_NAME_COLUMN", "exercise")];
  return {
    exercise,
    aliases: aliases.map((a) => String(a).trim()).filter(Boolean),
    title: row[env("EXERCISE_VIDEOS_TITLE_COLUMN", "title")] || exercise,
    url: normalizeVideoUrl(row[env("EXERCISE_VIDEOS_URL_COLUMN", "url")]),
  };
}

let cache = { at: 0, list: null };
const CACHE_MS = 5 * 60 * 1000;

export async function loadLibrary() {
  if (cache.list && Date.now() - cache.at < CACHE_MS) return cache.list;
  const db = await getSupabase();
  let rows = [];
  if (db) {
    const table = env("EXERCISE_VIDEOS_TABLE", "exercise_videos");
    const { data, error } = await db.from(table).select("*").limit(5000);
    if (error) throw new Error(`Reading ${table}: ${error.message}`);
    rows = data || [];
  } else {
    try { rows = JSON.parse(fs.readFileSync(path.resolve("videos/exercise-videos.json"), "utf8")); } catch { rows = []; }
  }
  const list = rows.map(mapRow).filter((v) => v.exercise && v.url);
  cache = { at: Date.now(), list };
  return list;
}
export function clearLibraryCache() { cache = { at: 0, list: null }; }

// --- Matching ----------------------------------------------------------------------
const FILLER = new Set("how to do a an the i my me show video videos demo tutorial form proper technique exercise exercises for of on with perform performing correct correctly properly can you please".split(" "));
const singular = (w) => (w.length > 2 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const wordSet = (s) => new Set(norm(s).split(" ").filter((w) => w && !FILLER.has(w)).map(singular));

function score(query, entry) {
  const q = wordSet(query);
  let best = 0;
  for (const name of [entry.exercise, ...entry.aliases]) {
    const n = wordSet(name);
    if (!n.size || !q.size) continue;
    const shared = [...n].filter((w) => q.has(w)).length;
    best = Math.max(best, shared / new Set([...n, ...q]).size); // 1 = same words
  }
  return best;
}

/** Best match (more than half the words in common), or close names to suggest. */
export function matchVideos(query, library) {
  const scored = library.map((e) => ({ e, s: score(query, e) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  const top = scored[0]?.s ?? 0;
  if (top > 0.5) {
    return {
      videos: scored.filter((x) => x.s === top).slice(0, 2).map(({ e }) => ({ exercise: e.exercise, title: e.title, url: e.url })),
      suggestions: [],
    };
  }
  return { videos: [], suggestions: [...new Set(scored.slice(0, 5).map((x) => x.e.exercise))] };
}

// --- Optional fallbacks when your library has nothing -----------------------------
export function searchLink(query) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${query} exercise form tutorial`)}`;
}

const ytCache = new Map();
async function youtubeSearch(query) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];
  if (ytCache.has(norm(query))) return ytCache.get(norm(query));
  const q = new URLSearchParams({ part: "snippet", type: "video", maxResults: "5", safeSearch: "strict", videoEmbeddable: "true", q: `${query} exercise proper form tutorial`, key });
  const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${q}`);
  if (!r.ok) throw new Error(`YouTube search failed (${r.status})`);
  const found = ((await r.json()).items || []).filter((i) => i.id?.videoId).slice(0, 1)
    .map((i) => ({ exercise: query, title: String(i.snippet.title).replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"'), url: `https://www.youtube.com/watch?v=${i.id.videoId}` }));
  ytCache.set(norm(query), found);
  return found;
}

/**
 * Returns one of:
 *  { source: "app", videos: [{exercise, title, url}] }
 *  { source: "app", videos: [], suggestions: [...names], ... }   (nothing matched; maybe a fallback)
 */
export async function findExerciseVideos(exercise) {
  const query = String(exercise || "").trim().slice(0, 80);
  if (!query) throw new Error("exercise is required");

  const { videos, suggestions } = matchVideos(query, await loadLibrary());
  if (videos.length) return { source: "app", videos };

  const result = { source: "app", videos: [], suggestions, note: "The app has no saved video for this exercise." };
  const fallback = env("VIDEO_FALLBACK", "none");
  if (fallback === "youtube") {
    try {
      const yt = await youtubeSearch(query);
      if (yt.length) return { source: "youtube", videos: yt, note: "Not from the app's library; found on YouTube." };
    } catch (e) { console.error("video fallback:", e.message); }
  }
  if (fallback === "search" || fallback === "youtube") result.searchUrl = searchLink(query);
  return result;
}

// --- Keep the coach from sharing video links it wasn't given ------------------------
const VIDEO_URL = /https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com|vimeo\.com)\/[^\s)\]]+|https?:\/\/[^\s)\]]+\.(?:mp4|webm)\b/gi;

/** Removes lines with video links in `text` that aren't in `allowed` (URLs the video tool returned). */
export function stripUnverifiedVideoLinks(text, allowed) {
  const ok = new Set(allowed);
  return text
    .split("\n")
    .filter((line) => (line.match(VIDEO_URL) || []).every((u) => ok.has(u)))
    .join("\n")
    .trim();
}
