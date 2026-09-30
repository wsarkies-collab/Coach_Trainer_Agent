// Tools the coach can call. It can READ your app's workout logs and manage its
// OWN memory. It cannot change anything in your app.

import * as appData from "./appData.js";
import * as memory from "./memory.js";
import { findExerciseVideos } from "./videos.js";

export const toolDefinitions = [
  {
    name: "get_workout_logs",
    description:
      "Reads the user's workout logs from the app (read-only), newest first. Each log has a date, optional title, exercises with sets (reps, weightKg, optional rpe) and notes. The most recent few sessions are already in your instructions; use this tool when you need older sessions or the full history of a specific exercise, e.g. to judge progress, spot a plateau, or suggest what weight to try next. You cannot add or edit logs; users do that in the app.",
    input_schema: {
      type: "object",
      properties: {
        exercise: { type: "string", description: "Only return sessions that include this exercise, e.g. 'bench press'. Partial names match." },
        since: { type: "string", description: "Only sessions on or after this date (YYYY-MM-DD)." },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Maximum sessions to return (default 10)." },
      },
    },
  },
  {
    name: "search_past_conversations",
    description:
      "Searches earlier questions this user asked you, and your answers, by keyword. Your most recent messages are already in the conversation; use this when the user refers to something discussed longer ago ('what did you say about my knee last month?') or when an earlier answer would help you stay consistent. Returns up to 8 matches with date, question and answer.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Keywords, e.g. 'knee pain lunges' or 'creatine'." } },
      required: ["query"],
    },
  },
  {
    name: "coach_memory",
    description:
      "Adds or removes a note in your own long-term memory about this user. Save durable things that will help you coach them in future chats and that the app's profile doesn't already hold: recurring issues ('left knee aches on deep lunges'), preferences ('likes short answers', 'trains early morning'), progress milestones, or what you advised on an ongoing issue. Keep each note to one short sentence. Don't save one-off chit-chat or anything already in the app profile or logs. Remove a note when it is no longer true (use its id from your instructions).",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["add", "remove"] },
        note: { type: "string", description: "For add: the note, one short sentence." },
        noteId: { type: "string", description: "For remove: the id of the note to delete." },
      },
      required: ["action"],
    },
  },
  {
    name: "find_exercise_video",
    description:
      "Looks up the app's own saved instructional video for an exercise. Use it whenever the user asks how to do an exercise, asks about an exercise's form or technique, looks up an exercise by name, or asks for a demo or video. Returns { videos: [{exercise, title, url}] } when the app has one. If nothing matched, videos is empty and suggestions lists the closest exercise names the app does have: if one is clearly the same exercise under another name, call the tool again with that name. A searchUrl may be included when there's no saved video. Never share a video link this tool didn't return.",
    input_schema: {
      type: "object",
      properties: { exercise: { type: "string", description: "Just the exercise name, e.g. 'Romanian deadlift' or 'goblet squat'." } },
      required: ["exercise"],
    },
  },
];

const handlers = {
  find_exercise_video: (_userId, input) => findExerciseVideos(input.exercise),
  get_workout_logs: (userId, input) =>
    appData.getWorkoutLogs(userId, { limit: Math.min(50, Number(input.limit) || 10), exercise: input.exercise, since: input.since }),
  search_past_conversations: (userId, input) => memory.searchConversation(userId, input.query),
  coach_memory: async (userId, input) => {
    if (input.action === "add") {
      if (!input.note?.trim()) throw new Error("note is required for add");
      return { saved: await memory.addNote(userId, input.note.trim()) };
    }
    if (input.action === "remove") return { removed: await memory.removeNote(userId, input.noteId) };
    throw new Error("action must be add or remove");
  },
};

export async function runTool(name, input, userId) {
  const handler = handlers[name];
  if (!handler) throw new Error(`Unknown tool: ${name}`);
  return handler(userId, input || {});
}
