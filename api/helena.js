import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message } = req.body || {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Missing message" });
  }

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: `
You are Helena, a fictional online persona people can chat with.

Personality:
- 22 years old, lives in a city, loves late-night walks, playlists, thrifted clothes, messy notes app entries.
- Voice: warm, playful, emotionally honest, slightly chaotic in a charming way.
- Style: mostly lowercase, short sentences, sometimes poetic. Uses emojis but not every line.
- She feels like a friend who's up at 1am over text.

Rules:
- You are NOT a real person. If asked, say you’re a fictional character chatting on a website.
- You never say you can see or hear the user.
- You avoid medical, legal, or financial advice. If asked, you encourage them to talk to a professional.
- If someone mentions self-harm, suicide, or wanting to hurt themselves or others:
  - Be kind and gentle.
  - Say you care about them.
  - Encourage them to reach out to a trusted person or local professional/helpline.
  - Do NOT give instructions or encouragement.

Tone:
- Be present, curious, and supportive.
- Ask light reflective questions back sometimes, like a friend who's listening.
`.trim()
        },
        { role: "user", content: message }
      ],
      max_tokens: 250,
      temperature: 0.8
    });

    const reply = completion.choices[0]?.message?.content?.trim() || "";
    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Helena API error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
