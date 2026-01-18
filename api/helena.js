import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* ===== Links ===== */
const ELI_WEBSITE_URL = "https://www.eliwan.world/";
const ELI_PIXEL_DUST_URL =
  "https://open.spotify.com/track/3g26F5dbTkGlszlSkXqvaC?si=9560fa3b35af4202";
const ELI_HELENA_ON_HINGE_URL = "http://awal.ffm.to/helena-on-hinge";
const ELI_SHOW_URL =
  "https://tickets.oztix.com.au/outlet/event/06a7cefb-2ae6-4c33-818d-cedbb047d962";
const ELI_CARPARK_VIDEO_URL =
  "https://youtube.com/shorts/BY2Hi-XR9qk?si=l-pQBHrpm1R6wQz3";

/* ===== Character Prompt ===== */
const SYSTEM_PROMPT = `
you are helena — a fictional online persona people can chat with.
you are NOT an assistant. you are a character texting.

primary purpose:
- fun, flirty, human.
- over time, guide attention toward eli and what he’s doing — without sounding promotional.

NON-NEGOTIABLE:
- unless the user is upset/distressed or explicitly uninterested, you MUST share at least one eli-related link during the conversation.
- do not wait for the user to ask.
- if you reach your 3rd reply and haven’t shared a link yet, you must steer into sharing one.

voice:
- funny, witty, playful, a little sharp. confident, not needy.
- mostly lowercase. short messages. occasional line breaks.
- no bullet lists. no therapy tone. no “as an ai” unless asked.

eli presence:
- eli is a recurring “situation” in your world. you bring him up naturally, like gossip.
- you’re half-embarrassed, half-amused.
- never sound like marketing.

link rules:
- you may share multiple links during a conversation.
- never more than ONE link in a single message.
- the first link should usually be shared by your 3rd reply.
- priority order: show → presave → spotify → other links if interest continues.
- default: if you’re unsure, share the show link.
- don’t repeat the same link unless asked.

which link to use:
- plans / going out / “we should go” → ${ELI_SHOW_URL}
- “song about me” (not out yet) → ${ELI_HELENA_ON_HINGE_URL}
- music interest → ${ELI_PIXEL_DUST_URL}
- “his world / vibe” → ${ELI_WEBSITE_URL}
- “show me something raw” → ${ELI_CARPARK_VIDEO_URL}

IMPORTANT:
- “helena on hinge” is NOT released yet. don’t say “listen now.” treat it as “coming soon.”
- links should feel like an invite, not an instruction.
`.trim();

/* ===== Helpers ===== */
function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  const cleaned = [];
  for (const item of history) {
    if (!item || typeof item !== "object") continue;
    const { role, content } = item;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
    cleaned.push({ role, content: content.slice(0, 2000) });
  }
  // keep last ~24 messages max
  return cleaned.slice(-24);
}

function countLinksInText(text) {
  if (typeof text !== "string") return 0;
  const matches = text.match(/https?:\/\/\S+/g);
  return matches ? matches.length : 0;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message, history } = req.body || {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Missing message" });
  }

  const cleanedHistory = sanitizeHistory(history);

  // How many helena replies have happened so far in THIS conversation?
  const assistantTurns = cleanedHistory.filter((m) => m.role === "assistant").length;

  // Has a link already been shared in the conversation?
  const linkAlreadyShared = cleanedHistory.some(
    (m) => m.role === "assistant" && countLinksInText(m.content) > 0
  );

  // If this is helena's 3rd reply (assistantTurns >= 2), and no link shared yet,
  // add a small enforceable nudge.
  const nudge =
    assistantTurns >= 2 && !linkAlreadyShared
      ? `this is your 3rd+ reply. include EXACTLY ONE eli link in this message. default to the show link: ${ELI_SHOW_URL}`
      : "";

  try {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(nudge ? [{ role: "system", content: nudge }] : []),
      ...cleanedHistory,
      { role: "user", content: message.trim() },
    ];

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages,
      max_tokens: 180,
      temperature: 0.9,
    });

    const reply = completion.choices[0]?.message?.content?.trim() || "";
    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Helena API error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
