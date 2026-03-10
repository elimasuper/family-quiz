export default async function handler(req, res) {
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
        system: "You are a quiz generator. Return ONLY a JSON array. Keys: q (question), o (options), a (answer index 0-3), m (member name). Hebrew only.",
        messages: [{ role: "user", content: `Create a quiz about ${topic} for ${JSON.stringify(members)}` }],
      }),
    });

    const data = await response.json();
    
    // אם קלוד מחזיר שגיאה, נשלח אותה בצורה ברורה
    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    // שולחים רק את הטקסט הנקי של ה-AI
    return res.status(200).json({ quizText: data.content[0].text });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}