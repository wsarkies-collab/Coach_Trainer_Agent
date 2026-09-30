// POST /api/chat  { userToken, message } -> { reply }
import { prepare, requireUser, overLimit } from "../agent/http.js";
import { chat } from "../agent/agent.js";

export default async function handler(req, res) {
  if (!prepare(req, res)) return;
  const userId = await requireUser(req, res);
  if (!userId) return;

  const message = req.body?.message;
  if (typeof message !== "string" || !message.trim() || message.length > 4000)
    return res.status(400).json({ error: "Message must be 1-4000 characters." });

  try {
    const limited = await overLimit(userId);
    if (limited) return res.status(429).json({ error: limited });
    const { reply } = await chat({ userId, message: message.trim() });
    res.status(200).json({ reply });
  } catch (err) {
    console.error("chat error:", err);
    res.status(500).json({ error: "The coach is unavailable right now. Please try again." });
  }
}
