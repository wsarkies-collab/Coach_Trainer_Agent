// The coach's OWN memory for each user (separate from your app's data):
//  - notes:        short coaching notes it chose to keep ("left shoulder cranky on OHP")
//  - conversation: every question and answer, so it remembers what you've talked about
//
// Uses Supabase when configured; otherwise a local JSON file (for testing only).

import { supabaseConfigured, isProduction } from "./supabase.js";

async function backend() {
  if (supabaseConfigured()) return import("./memory-supabase.js");
  if (isProduction()) throw new Error("Supabase is not configured, so the coach has nowhere to store memory.");
  return import("./memory-file.js");
}

export const getMemory = async (...a) => (await backend()).getMemory(...a);
export const addNote = async (...a) => (await backend()).addNote(...a);
export const removeNote = async (...a) => (await backend()).removeNote(...a);
export const appendTurns = async (...a) => (await backend()).appendTurns(...a);
export const searchConversation = async (...a) => (await backend()).searchConversation(...a);
export const countUserMessagesSince = async (...a) => (await backend()).countUserMessagesSince(...a);
export const clearMemory = async (...a) => (await backend()).clearMemory(...a);
