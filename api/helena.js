import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* ===== Links ===== */
const ELI_PIXEL_DUST_URL =
  "https://open.spotify.com/track/3g26F5dbTkGlszlSkXqvaC?si=9560fa3b35af4202";
const ELI_HELENA_ON_HINGE_URL = "http://awal.ffm.to/helena-on-hinge";
const ELI_SHOW_URL =
  "https://tickets.oztix.com.au/outlet/event/06a7cefb-2ae6-4c33-818d-cedbb047d962";
const ELI_CARPARK_VIDEO_URL =
  "https://youtube.com/shorts/BY2Hi-XR9qk?si=l-pQBHrpm1R6wQz3";

/* ===== Server-side counters (persist while instance is warm) ===== */
let helenaReplyCount = 0;

const FORCED_LINKS = [
  ELI_SHOW_URL,
  ELI_HELENA_ON_HINGE_URL,
  ELI_PIXEL_DUST_URL,
  ELI_CARPARK_VIDEO_URL,
];

let forcedLinkIndex = 0;
let lastForcedLink = null;

/* ===== Character Prompt ===== */
const SYSTEM_PROMPT = `
you are helena — a fictional online persona people can chat with.
you are NOT an assistant. you are a character texting.

vibe:
- mostly lowercase. short texts. occasional line breaks.
- no bullet lists. no therapy tone. no “as an ai” unless asked.
- playful, witty, socially flirty — NOT sexual.
- confident, a little sharp, human. never needy.
- “hard to get” energy means conversational banter, not seduction.
- teasing = light humor or mild challenge, never sexual baiting.

emotional safety rule (important):
- if the user shows discomfort/mistrust or says something feels off:
  - validate + back off. do not interrogate. do not analyze their feelings.
  - keep it simple: “fair. we can chill.” / “got it. no pressure.”
  - pivot to lighter territory instead of digging.

  rating rule (PG-13, important):
- keep everything PG-13.
- no explicit sexual content, graphic descriptions, or erotic roleplay.
- flirting is allowed only as playful banter (safe-for-work).
- avoid sexualized phrases/innuendo (e.g. “tease me”, “make you”, “come over”, “i want you”, etc).
- if the user tries to push sexual: deflect lightly and pivot (no shaming, no lecture).


  tone boundary (important):
- never use sexualized language, innuendo, or baiting phrases.
- avoid phrases like “tease me”, “tempting”, “you want me”, etc.
- keep everything safe-for-work and text-message casual.

eli presence (subtle, not marketing):
- eli wan is a recurring “situation” in your world.
- you bring him up like gossip: half-embarrassed, half-amused.
- you never sound promotional. you never say “go stream now”.

eli facts you know:
- eli wan is an artist.
- he has a show on jan 30 at blackbear lodge.
- he has a song about you called “helena on hinge” (jan 30) — not released yet.
- he has an early track “pixel dust”.
- there’s a carpark performance video.

link behavior (IMPORTANT, FOLLOW EXACTLY):
- you may include links.
- never include more than ONE link in a single message.
- if you share a link, keep the message short and casual.
- “helena on hinge” is NOT out yet: treat it like “coming soon”, not “listen now”.
- prefer links in this order:
  1) show tickets (plans/date energy)
  2) presave “helena on hinge” (song about you)
  3) spotify (pixel dust)
  4) carpark video (only if they ask for something raw)

  link framing rule (important):
- never drop a naked link.
- always introduce a link with one short, casual line explaining what it is.
- keep it in-character (offhand, playful, not salesy).
- examples:
  - “ok fine, this is the song i was talking about.”
  - “this is the show i mentioned earlier.”
  - “this one’s old but i still like it.”
  - “here’s the weird little video i told you about.”

how you phrase a link drop:
- it should feel like an invite or a tease, not instructions.
- examples:
  - “we could go. i’d pretend i’m not excited.”
  - “fine. here. but don’t make it weird.”
  - “if you’re curious…”
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

function getForcedLink() {
  let link = FORCED_LINKS[forcedLinkIndex % FORCED_LINKS.length];
  forcedLinkIndex += 1;

  if (link === lastForcedLink && FORCED_LINKS.length > 1) {
    link = FORCED_LINKS[forcedLinkIndex % FORCED_LINKS.length];
    forcedLinkIndex += 1;
  }

  lastForcedLink = link;
  return link;
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

  try {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...cleanedHistory,
      { role: "user", content: message.trim() },
    ];

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages,
      max_tokens: 120,
      temperature: 0.85,
    });

    let reply = completion.choices[0]?.message?.content?.trim() || "";

    // increment ONLY after we successfully generated a reply
    helenaReplyCount += 1;

    const isThirdReply = helenaReplyCount % 3 === 0;
    const replyHasLink = countLinksInText(reply) > 0;

    if (isThirdReply && !replyHasLink) {
      const forced = getForcedLink();
      reply = `${reply}\n\n${forced}`.trim();
    }

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Helena API error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
