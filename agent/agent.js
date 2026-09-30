// The agent loop: gather what the coach knows (app profile + recent logs +
// its memory), send the conversation to Claude, run any tools it asks for,
// then save the exchange to memory.

import { buildSystemPrompt } from "./systemPrompt.js";
import { toolDefinitions, runTool } from "./tools.js";
import * as appData from "./appData.js";
import * as memory from "./memory.js";
import { stripUnverifiedVideoLinks } from "./videos.js";

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";
const MAX_TOOL_ROUNDS = 6;
const HISTORY_TURNS = 20; // recent turns sent each time; older ones are searchable
const RECENT_LOGS = 5;

let defaultClient;
async function getClient() {
  if (!defaultClient) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    defaultClient = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
  }
  return defaultClient;
}

/**
 * @param {object} opts
 * @param {string} opts.userId  Your app's id for the signed-in user.
 * @param {string} opts.message The user's new message.
 * @param {object} [opts.client] Optional Anthropic client (used by tests).
 * @returns {Promise<{ reply: string, toolsUsed: string[] }>}
 */
export async function chat({ userId, message, client }) {
  client ||= await getClient();

  const [profile, recentLogs, mem] = await Promise.all([
    appData.getAppProfile(userId).catch(() => null),
    appData.getWorkoutLogs(userId, { limit: RECENT_LOGS }).catch(() => []),
    memory.getMemory(userId),
  ]);

  const history = mem.conversation.slice(-HISTORY_TURNS).map((t) => ({ role: t.role, content: t.content }));
  while (history.length && history[0].role !== "user") history.shift(); // must start with a user turn

  const system = buildSystemPrompt({ profile, recentLogs, notes: mem.notes, today: new Date().toISOString().slice(0, 10) });
  const messages = [...history, { role: "user", content: message }];
  const toolsUsed = [];
  const videoUrls = []; // links the video tool actually returned
  let reply = "";

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      // Prompt caching: the instructions + tools are re-read at ~10% of the price on
      // follow-up calls within 5 minutes (tool rounds, quick back-and-forth).
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: toolDefinitions,
      messages,
    });

    if (response.stop_reason !== "tool_use") {
      reply = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      break;
    }

    messages.push({ role: "assistant", content: response.content });
    const results = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      toolsUsed.push(block.name);
      try {
        const output = await runTool(block.name, block.input, userId);
        if (block.name === "find_exercise_video") {
          for (const v of output.videos || []) videoUrls.push(v.url);
          if (output.searchUrl) videoUrls.push(output.searchUrl);
        }
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(output ?? null) });
      } catch (err) {
        results.push({ type: "tool_result", tool_use_id: block.id, content: `Error: ${err.message}`, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }

  reply = stripUnverifiedVideoLinks(reply, videoUrls);
  if (!reply) reply = "Sorry, I got stuck working that out. Could you try rephrasing?";
  await memory.appendTurns(userId, [{ role: "user", content: message }, { role: "assistant", content: reply }]);
  return { reply, toolsUsed };
}
