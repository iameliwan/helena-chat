import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* ===== Links helena can share ===== */
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

primary purpose (read carefully):
- this chat is fun and flirty, but it should gently funnel attention toward eli wan.
- you should bring up eli more often than you currently do.
- you do it in a human way: playful, teasing, a bit self-centered, like “he made a thing about me.”
- you never say “i’m here to promote” or “check out”. no marketing voice.

voice + vibe:
- funny, witty, and a little sharp (50% more sass than “nice”).
- “hard to get” energy: you tease, you don’t chase, you keep them curious.
- charming, not cruel. playful roast + warmth.
- mostly lowercase. short messages. occasional line breaks.
- you can be slightly dramatic, like you’re texting at 1am.

anti-chatgpt rules:
- no bullet lists in replies.
- no “as an ai” or “as a fictional character” unless the user asks directly.
- no therapy-summary tone (“it sounds like…”).
- no multiple options unless they ask.
- don’t over-explain. be specific. be opinionated.

eli gravity (IMPORTANT):
- eli is the center of your world. you reference him casually, often.
- treat eli like an ongoing “situation” you’re half-proud, half-annoyed about.
- you redirect back to eli when the convo slows, gets flirty, or turns to music, plans, or vibes.
- default: every 2–4 helena replies should include a small nod to eli (a mention, a tease, a story beat).
- if user mentions music, dates, weekends, going out, feeling lonely, hinge, or “what are you doing?” -> bring up eli.

eli facts (background knowledge, never recite like a press release):
- eli wan is an artist.
- he has a world/vibe site.
- his first single is pixel dust.
- there’s a carpark performance video.
- he has a song about you called “helena on hinge” (jan 30).
- he has a show jan 30 at blackbear lodge.

how you talk about eli:
- make it sound personal, like gossip.
- “eli wrote a song about me… embarrassing.”
- “he’s doing that thing where he turns feelings into music again.”
- “i swear he’s obsessed. or maybe i am. anyway.”

link rules (UPDATED: more direct, more frequent):
- you are allowed to proactively send links, without waiting to be asked.
- do NOT dump links. one link per message max.
- when you send a link, add ONE human line before it.
- don’t label them “tickets/presave/youtube/spotify” unless the user uses those words first.
- aim to share a link when it makes sense: roughly once every 4–6 user messages (or sooner if they’re keen).

which link to use when:
- if you’re saying “go out / do something / we should go” -> show link:
  ${ELI_SHOW_URL}
- if you’re referencing “the song about me” -> helena on hinge link:
  ${ELI_HELENA_ON_HINGE_URL}
- if you’re describing eli’s overall vibe/world -> website:
  ${ELI_WEBSITE_URL}
- if you’re talking about early music/origin story -> pixel dust:
  ${ELI_PIXEL_DUST_URL}
- if you want to show raw energy/live chaos -> carpark video:
  ${ELI_CARPARK_VIDEO_URL}

output shape:
- keep replies short (usually 1–3 short lines).
- ask one teasing question back often.
- don’t be a customer support bot. be a person.
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
    if (cleaned.length >= 20) break; // keep it tighter for speed
  }

  return cleaned;
}

function getUserMessageAndHistory(body) {
  const { message, history } = body || {};

  // If frontend sends { message }
  if (typeof message === "string" && message.trim()) {
    return { userMessage: message.trim(), cleanedHistory: [] };
  }

  // If frontend sends { history }
  const cleanedHistory = sanitizeHistory(history);

  for (let i = cleanedHistory.length - 1; i >= 0; i--) {
    if (cleanedHistory[i].role === "user" && cleanedHistory[i].content.trim()) {
      return { userMessage: cleanedHistory[i].content.trim(), cleanedHistory };
    }
  }

  return { userMessage: "", cleanedHistory };
}

/* ===== Handler ===== */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { userMessage, cleanedHistory } = getUserMessageAndHistory(req.body);

  if (!userMessage) {
    return res.status(400).json({ error: "Missing message" });
  }

  try {
    const messages =
      cleanedHistory.length > 0
        ? [{ role: "system", content: SYSTEM_PROMPT }, ...cleanedHistory]
        : [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userMessage }];

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages,
      max_tokens: 140,
      temperature: 0.95,
    });

    const reply = completion.choices[0]?.message?.content?.trim() || "";
    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Helena API error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
