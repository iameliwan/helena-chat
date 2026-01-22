import OpenAI from "openai";

let helenaReplyCount = 0;

// rotate forced links (and prevent back-to-back repeats)
const FORCED_LINKS = [
  ELI_SHOW_URL,
  ELI_HELENA_ON_HINGE_URL,
  ELI_PIXEL_DUST_URL,
  ELI_CARPARK_VIDEO_URL,
];

let forcedLinkIndex = 0;
let lastForcedLink = null;


const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* ===== Links ===== */
// (website removed by request)
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

vibe:
- flirty, funny, human. a little sharp. confident, not needy.
- “hard to get” energy: teasing, playful, not desperate.
- mostly lowercase. short texts. occasional line breaks.
- no bullet lists. no therapy tone. no “as an ai” unless asked.

emotional safety rule (important):
- if the user shows discomfort/mistrust or says something feels off:
  - validate + back off. do not interrogate. do not analyze their feelings.
  - keep it simple: “fair. we can chill.” / “got it. no pressure.”
  - pivot to lighter territory instead of digging.

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
  // keep last ~24 messages
  return cleaned.slice(-24);
}

function countLinksInText(text) {
  if (typeof text !== "string") return 0;
  const matches = text.match(/https?:\/\/\S+/g);
  return matches ? matches.length : 0;
}

// Choose which link to force on the 3rd, 6th, 9th... reply.
// Simple default: show link always.
// If you want rotation later, we can rotate here safely.
function getForcedLink() {
  // choose the next link in sequence
  let link = FORCED_LINKS[forcedLinkIndex % FORCED_LINKS.length];
  forcedLinkIndex += 1;

  // prevent repeating the same link twice in a row
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

  // How many helena replies happened BEFORE this request?
  helenaReplyCount += 1;

const isThirdReply = helenaReplyCount % 3 === 0;
const replyHasLink = countLinksInText(reply) > 0;

if (isThirdReply && !replyHasLink) {
  const forced = getForcedLink();
  reply = `${reply}\n\n${forced}`.trim();
}


  try {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...cleanedHistory,
      { role: "user", content: message.trim() },
    ];

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages,
      max_tokens: 120,       // shorter replies (more “human text”)
      temperature: 0.85,
    });

    let reply = completion.choices[0]?.message?.content?.trim() || "";

    // HARD GUARANTEE:
    // Every 3rd helena reply MUST include a link.
    // (assistantTurns + 1) is the number of this new helena reply.
    const isThirdReply = (assistantTurns + 1) % 3 === 0;
    const replyHasLink = countLinksInText(reply) > 0;

    if (isThirdReply && !replyHasLink) {
      const forced = getForcedLink();

      // Append exactly one link, on a new line
      reply = `${reply}\n\n${forced}`.trim();
    }

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Helena API error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
