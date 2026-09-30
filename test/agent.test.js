// Checks the coach end-to-end with a fake Claude client (no API key needed):
// app data in the prompt, tools, memory notes, and remembered conversations.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.MEMORY_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "coach-")), "memory.json");
const { chat } = await import("../agent/agent.js");
const memory = await import("../agent/memory.js");

// Fake Claude. Turn 1: reads bench logs + saves a note, then answers.
// Turn 2: plain answer (lets us check the history it was sent).
const requests = [];
let script = [];
const fakeClient = { messages: { create: async (req) => { requests.push(structuredClone(req)); return script.shift(); } } };

script = [
  { stop_reason: "tool_use", content: [
    { type: "tool_use", id: "t1", name: "get_workout_logs", input: { exercise: "bench" } },
    { type: "tool_use", id: "t2", name: "coach_memory", input: { action: "add", note: "Bench stalled at 55kg for 3 weeks." } },
  ]},
  { stop_reason: "end_turn", content: [{ type: "text", text: "Your bench has been at 55kg for 3 weeks." }] },
];
const r1 = await chat({ userId: "demo-user", message: "How's my bench going?", client: fakeClient });
assert.equal(r1.reply, "Your bench has been at 55kg for 3 weeks.");
assert.deepEqual(r1.toolsUsed, ["get_workout_logs", "coach_memory"]);

// App profile + recent logs were in the instructions (read from demo/app-data.json).
const sys1 = requests[0].system[0].text;
assert.deepEqual(requests[0].system[0].cache_control, { type: "ephemeral" });
assert.match(sys1, /experienceLevel: beginner/);
assert.match(sys1, /This user is beginner/);
assert.match(sys1, /2026-09-24 \(Full Body A\): Barbell back squat: 8x60kg/);
assert.match(sys1, /No notes yet/);

// Tool results were real: bench-only logs came back.
const toolResults = requests[1].messages.at(-1).content;
const logs = JSON.parse(toolResults[0].content);
assert.ok(logs.length > 0 && logs.every((w) => w.exercises.some((e) => /bench/i.test(e.name))));
assert.equal(JSON.parse(toolResults[1].content).saved.text, "Bench stalled at 55kg for 3 weeks.");

// Turn 2: the note and the previous exchange are remembered.
script = [{ stop_reason: "end_turn", content: [{ type: "text", text: "You asked about your bench." }] }];
await chat({ userId: "demo-user", message: "What did I ask earlier?", client: fakeClient });
const req2 = requests.at(-1);
assert.match(req2.system[0].text, /Bench stalled at 55kg for 3 weeks\./);
assert.deepEqual(req2.messages.map((m) => m.content), [
  "How's my bench going?", "Your bench has been at 55kg for 3 weeks.", "What did I ask earlier?",
]);

// Searching old conversations works.
const found = await memory.searchConversation("demo-user", "bench");
assert.equal(found[0].question, "How's my bench going?");

// A user with no app data still works, and users' memories are separate.
script = [{ stop_reason: "end_turn", content: [{ type: "text", text: "Hi!" }] }];
await chat({ userId: "someone-else", message: "Hello", client: fakeClient });
assert.match(requests.at(-1).system[0].text, /app has no profile for this user yet/);
assert.equal(requests.at(-1).messages.length, 1);

// Clearing memory erases notes and history.
await memory.clearMemory("demo-user");
const after = await memory.getMemory("demo-user");
assert.equal(after.notes.length + after.conversation.length, 0);

// Any shape of app workout row still reaches the coach.
const { formatLogs } = await import("../agent/systemPrompt.js");
assert.match(formatLogs([{ date: "2026-09-01", workout_name: "Push", exercises: [{ exercise: "Bench", reps: [8, 8] }] }]), /workout_name":"Push/);
const { stripPrivate } = await import("../agent/appData.js");
assert.deepEqual(stripPrivate({ id: 1, user_id: "u", email: "a@b.c", goal: "strength", sets: [{ id: 2, reps: 5 }] }), { goal: "strength", sets: [{ reps: 5 }] });

// API functions: sign-in, validation and daily limit.
const call = async (name, body, method = "POST") => {
  const { default: handler } = await import(`../api/${name}.js`);
  const res = { code: 0, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } };
  await handler({ method, headers: {}, body }, res);
  return res;
};
assert.equal((await call("chat", { message: "hi" })).code, 401);
assert.equal((await call("chat", { userToken: "demo-user", message: "  " })).code, 400);
assert.equal((await call("chat", {}, "GET")).code, 405);
await memory.appendTurns("limit-user", [{ role: "user", content: "q" }, { role: "assistant", content: "a" }]);
process.env.DAILY_MESSAGE_LIMIT = "1";
const limited = await call("chat", { userToken: "limit-user", message: "another" });
assert.equal(limited.code, 429);
assert.match(limited.body.error, /today's message limit/);
delete process.env.DAILY_MESSAGE_LIMIT;
const hist = await call("history", { userToken: "limit-user" });
assert.deepEqual(hist.body.messages, [{ role: "user", content: "q" }, { role: "assistant", content: "a" }]);
assert.equal((await call("memory", { userToken: "limit-user", action: "clear" })).body.cleared, true);
assert.deepEqual((await call("history", { userToken: "limit-user" })).body.messages, []);

// Exercise videos from the app's library.
const videos = await import("../agent/videos.js");
const libFile = "videos/exercise-videos.json";
const original = fs.readFileSync(libFile, "utf8");
try {
  // Rows in the app's own shape: different column names, bare ids, short links, comma aliases.
  process.env.EXERCISE_VIDEOS_NAME_COLUMN = "name";
  process.env.EXERCISE_VIDEOS_URL_COLUMN = "youtube_url";
  process.env.EXERCISE_VIDEOS_ALIASES_COLUMN = "other_names";
  fs.writeFileSync(libFile, JSON.stringify([
    { name: "Romanian deadlift", other_names: "RDL, stiff leg deadlift", youtube_url: "youtu.be/AAAAAAAAAAA" },
    { name: "Deadlift", youtube_url: "BBBBBBBBBBB" },
    { name: "Barbell back squat", other_names: "squat, back squat", youtube_url: "https://www.youtube.com/shorts/CCCCCCCCCCC" },
    { name: "Broken row", youtube_url: "not a video" },
  ]));
  videos.clearLibraryCache();
  const rdl = await videos.findExerciseVideos("RDLs");
  assert.deepEqual(rdl.videos, [{ exercise: "Romanian deadlift", title: "Romanian deadlift", url: "https://www.youtube.com/watch?v=AAAAAAAAAAA" }]);
  assert.equal((await videos.findExerciseVideos("deadlift")).videos[0].url, "https://www.youtube.com/watch?v=BBBBBBBBBBB");
  assert.equal((await videos.findExerciseVideos("how to squat")).videos[0].url, "https://www.youtube.com/watch?v=CCCCCCCCCCC");
  const front = await videos.findExerciseVideos("front squat");
  assert.equal(front.videos.length, 0);
  assert.deepEqual(front.suggestions, ["Barbell back squat"]);
  assert.equal(front.searchUrl, undefined, "no YouTube fallback by default");
  process.env.VIDEO_FALLBACK = "search";
  assert.match((await videos.findExerciseVideos("front squat")).searchUrl, /search_query=front%20squat/);
  delete process.env.VIDEO_FALLBACK;
  assert.equal((await videos.findExerciseVideos("broken row")).videos.length, 0, "unplayable urls are skipped");

  // End to end: the coach's video link survives, an invented one is removed.
  script = [
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "v1", name: "find_exercise_video", input: { exercise: "RDL" } }] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "[Romanian deadlift](https://www.youtube.com/watch?v=AAAAAAAAAAA)\n- Hips back\n[Bonus](https://youtu.be/ZZZZZZZZZZZ)" }] },
  ];
  const rv = await chat({ userId: "video-user", message: "How do I do an RDL?", client: fakeClient });
  assert.match(rv.reply, /AAAAAAAAAAA/);
  assert.doesNotMatch(rv.reply, /ZZZZZZZZZZZ/);
} finally {
  fs.writeFileSync(libFile, original);
  for (const k of ["EXERCISE_VIDEOS_NAME_COLUMN", "EXERCISE_VIDEOS_URL_COLUMN", "EXERCISE_VIDEOS_ALIASES_COLUMN"]) delete process.env[k];
  videos.clearLibraryCache();
}
assert.equal(videos.normalizeVideoUrl("https://vimeo.com/1"), null);
assert.equal(videos.normalizeVideoUrl("https://x.supabase.co/storage/v1/object/public/v/a.mp4"), "https://x.supabase.co/storage/v1/object/public/v/a.mp4");
const cleaned = videos.stripUnverifiedVideoLinks("Watch:\n[Real](https://www.youtube.com/watch?v=AAAAAAAAAAA)\n[Made up](https://youtu.be/ZZZZZZZZZZZ)\nBack flat.", ["https://www.youtube.com/watch?v=AAAAAAAAAAA"]);
assert.equal(cleaned, "Watch:\n[Real](https://www.youtube.com/watch?v=AAAAAAAAAAA)\nBack flat.");

console.log("All agent tests passed.");
