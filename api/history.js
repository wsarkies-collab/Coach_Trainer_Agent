// POST /api/history  { userToken } -> { messages: [{ role, content }] }  (last 50, for showing the chat)
import { prepare, requireUser } from "../agent/http.js";
import * as memory from "../agent/memory.js";

export default async function handler(req, res) {
  if (!prepare(req, res)) return;
  const userId = await requireUser(req, res);
  if (!userId) return;
  try {
    const { conversation } = await memory.getMemory(userId);
    res.status(200).json({ messages: conversation.slice(-50).map(({ role, content }) => ({ role, content })) });
  } catch (err) {
    console.error("history error:", err);
    res.status(500).json({ error: "Couldn't load your chat history." });
  }
}
