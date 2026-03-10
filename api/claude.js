export default async function handler(req, res) {
  // הגדרות CORS למניעת חסימות
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // וידוא שהגוף (body) מפוענח נכון
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { topic, members } = body;

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("Missing ANTHROPIC_API_KEY in Vercel Settings");
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 2000,
        system: "You are a quiz generator. Return ONLY a minified JSON array of objects. Keys: m (member name), q (question), o (options array), a (correct index). Use Hebrew.",
        messages: [
          { role: "user", content: `צור חידון על ${topic} למשתתפים: ${JSON.stringify(members)}. 3 שאלות לכל אחד.` }
        ],
      }),
    });

    const data = await response.json();
    
    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    return res.status(200).json(data);

  } catch (error) {
    console.error("Server Error:", error);
    return res.status(500).json({ error: error.message });
  }
}