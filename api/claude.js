export default async function handler(req, res) {
  // הגדרות CORS כדי שהדפדפן לא יחסום את הבקשה
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { topic, members } = req.body;

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "Missing API Key in Vercel settings" });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307", // מודל מהיר וזול
        max_tokens: 2000,
        system: "You are a quiz generator. Return ONLY a minified JSON array. Keys: q, o, a, m. Hebrew language.",
        messages: [{ role: "user", content: `Create a quiz about ${topic} for ${JSON.stringify(members)}` }],
      }),
    });

    const data = await response.json();

    // בדיקה אם קלוד החזיר שגיאה
    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}