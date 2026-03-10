export default async function handler(req, res) {
  // הגדרות CORS - קריטי למניעת חסימות
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { topic, members } = req.body;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 1500,
        system: "You are a quiz generator. Return ONLY a JSON array. Keys: q (question), o (options array), a (correct index), m (member name). Use Hebrew.",
        messages: [{ role: "user", content: `Create a family quiz about ${topic} for ${JSON.stringify(members)}` }],
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error("Anthropic Error:", data.error);
      return res.status(500).json({ error: data.error.message });
    }

    // אנחנו שולחים אובייקט עם שדה בשם quizData
    return res.status(200).json({ quizData: data.content[0].text });

  } catch (error) {
    console.error("Server Crash:", error);
    return res.status(500).json({ error: error.message });
  }
}