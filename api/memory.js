// POST /api/memory        { userToken }                   -> { notes, messageCount }  (for a "What the coach remembers" screen)
// POST /api/memory        { userToken, action: "clear" }  -> { cleared: true }        (erases coach notes + chat history;
//                                                                                     your app's own data is not touched)
import { prepare, requireUser } from "../agent/http.js";
import * as memory from "../agent/memory.js";

export default async function handler(req, res) {
  if (!prepare(req, res)) return;
  const userId = await requireUser(req, res);
  if (!userId) return;
  try {
    if (req.body?.action === "clear") {
      await memory.clearMemory(userId);
      return res.status(200).json({ cleared: true });
    }
    const { notes, conversation } = await memory.getMemory(userId);
    res.status(200).json({ notes: notes.map(({ text, createdAt }) => ({ text, createdAt })), recentMessageCount: conversation.length });
  } catch (err) {
    console.error("memory error:", err);
    res.status(500).json({ error: "Couldn't reach the coach's memory." });
  }
}
