export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { messages, max_tokens } = req.body || {};

  // Basic validation
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Missing messages" });
  }

  // Safety limits — always use Haiku, cap tokens
  const body = {
    model: "claude-haiku-4-5-20251001",
    max_tokens: Math.min(max_tokens || 3000, 3000),
    messages,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8s — under Vercel's 10s limit

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const data = await response.json();
    return res.status(response.status).json(data);

  } catch (error) {
    if (error.name === "AbortError") {
      return res.status(504).json({ error: "timeout" });
    }
    return res.status(500).json({ error: error.message });
  }
}
