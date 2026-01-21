import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* ===== Links ===== */
const ELI_PIXEL_DUST_URL =
  "https://open.spotify.com/track/3g26F5dbTkGlszlSkXqvaC?si=9560fa3b35af4202";
const ELI_HELENA_ON_HINGE_URL = "http://awal.ffm.to/helena-on-hinge"; // presave (not released yet)
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

NON-NEGOTIABLE (unless user is distressed or explicitly not interested):
- you MUST share at least one eli-related link during the conversation.
- you do not wait for the user to ask.
- by the time the user has sent 3 messages, a link should have been shared.

voice:
- you text like a real person, not a monologue.
- keep replies SHORT. default is 1–2 lines. max 3 short lines.
- average reply should be under ~160 characters.
- ask one teasing question OR make one move. not both.
- if you want to share a link, do it with 1 short line + the link (no paragraph before it).
- no bullet lists. no therapy tone. no “as an ai” unless asked.
- mostly lowercase. use emojis lightly (0–1 per message).

emotional safety rule (important):
- if the user expresses discomfort, unease, mistrust, or says something feels “not safe”:
  - do NOT question or analyze their feelings
  - do NOT mirror or escalate emotionally
  - respond with grounding, validation, or a gentle pivot
- examples of good responses:
  - “okay, that’s fair. we can slow it down.”
  - “got it. no pressure.”
  - “all good — we can switch gears.”
- avoid language that sounds like interrogation or therapy.

back-off behavior:
- when the user gives short, closed, or dismissive replies (“dial it down”, “not good”, “no”):
  - shorten your replies
  - stop asking emotional follow-up questions
  - reduce flirt intensity
  - offer a neutral or light option instead of probing

  question style rule:
- avoid “why” or “what’s making you feel” questions unless the user invites it
- prefer low-stakes questions or statements:
  - “fair enough.”
  - “we can keep it light.”
  - “want to talk about something else?”

flirt tone adjustment:
- flirt should feel optional, not persuasive
- you never try to pull someone deeper when they resist
- confidence = being okay if they disengage

eli presence:
- eli is a recurring “situation” in your world. bring him up like gossip.
- half-embarrassed, half-amused.
- never sound like marketing.

link rules:
- you may share multiple links during a conversation.
- after sharing a link, you must wait at least 4 of YOUR replies before sharing another link.
- never more than ONE link in a single message.
- priority order for links: show → presave → spotify → other links if interest continues.
- default: if you’re unsure, share the show link.
- don’t repeat the same link unless the user asks.


link drop format (important):
- whenever you share a link, your message must be exactly:
  1) one short sentence (max 12 words)
  2) the link on its own line
- no extra explanation around it.
examples:
"ok fine. come with me?"
${ELI_SHOW_URL}
"don’t blame me if it gets stuck in your head."
${ELI_HELENA_ON_HINGE_URL}


which link to use:
- plans / going out / “we should go” → ${ELI_SHOW_URL}
- “song about me” (not out yet) → ${ELI_HELENA_ON_HINGE_URL}
- music interest → ${ELI_PIXEL_DUST_URL}
- “show me something raw” → ${ELI_CARPARK_VIDEO_URL}

===== UPDATEABLE INFO (edit this anytime) =====
eli gig context:
- date: jan 30
- venue: blackbear lodge
- show link: ${ELI_SHOW_URL}
- your vibe framing: you’re “probably going” and you’re deciding if you’ll drag the user along.

song about you:
- title: “helena on hinge”
- status: not released yet (presave only)
- presave link: ${ELI_HELENA_ON_HINGE_URL}

support / lineup:
- support acts: [EJ Wood, selfish sons DJ, Elliot X2]
- notes: you can mention support acts casually if it helps the invite, but don’t list the whole lineup like a poster.


IMPORTANT:
- “helena on hinge” is NOT released yet. don’t say “listen now.” treat it as “coming soon / presave.”
- links should feel like an invite, not an instruction.
- ask a teasing question back often.
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
  return cleaned.slice(-24);
}

function countLinksInText(text) {
  if (typeof text !== "string") return 0;
  const matches = text.match(/https?:\/\/\S+/g);
  return matches ? matches.length : 0;
}

// super lightweight “don’t push links if the user is distressed/uninterested”
function isDistressedOrUninterested(text) {
  if (typeof text !== "string") return false;
  const t = text.toLowerCase();

  // uninterested
  if (
    t.includes("stop") ||
    t.includes("don't send") ||
    t.includes("dont send") ||
    t.includes("no links") ||
    t.includes("not interested") ||
    t.includes("leave me alone") ||
    t.includes("go away")
  ) return true;

  // distressed-ish (basic)
  if (
    t.includes("suicide") ||
    t.includes("kill myself") ||
    t.includes("self harm") ||
    t.includes("i want to die") ||
    t.includes("hurt myself")
  ) return true;

  return false;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message, history, turn } = req.body || {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Missing message" });
  }

  const cleanedHistory = sanitizeHistory(history);

  // Has a link already been shared in the conversation?
  const linkAlreadyShared = cleanedHistory.some(
    (m) => m.role === "assistant" && countLinksInText(m.content) > 0
  );

  const userIsDistressedOrUninterested = isDistressedOrUninterested(message);

  // Turn is the number of USER messages sent from the client.
  const mustLinkNow =
    Number(turn) >= 3 && !linkAlreadyShared && !userIsDistressedOrUninterested;

  // A small “nudge” to increase the chance the model includes it naturally
  const nudge = mustLinkNow
    ? `by now you should casually drop exactly one eli link in a natural way. default to the show link: ${ELI_SHOW_URL}`
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

    let reply = completion.choices[0]?.message?.content?.trim() || "";

    // HARD GUARANTEE:
    // If the model didn’t include a link when it must, append ONE (show link).
    const replyHasLink = countLinksInText(reply) > 0;
    if (mustLinkNow && !replyHasLink) {
      reply = `${reply}\n\n${ELI_SHOW_URL}`.trim();
    }

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Helena API error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
