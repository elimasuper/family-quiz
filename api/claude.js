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
        system: "אתה מייצר חידונים. החזר אך ורק מערך JSON. מפתחות: q (שאלה), o (אפשרויות), a (אינדקס תשובה), m (שם משתתף). עברית בלבד.",
        messages: [{ role: "user", content: `צור חידון על ${topic} למשתתפים: ${JSON.stringify(members)}` }],
      }),
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    return res.status(200).json({ text: data.content[0].text });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}