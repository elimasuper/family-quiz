export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { topic, members } = req.body; // מקבל רק נושא ורשימת משתתפים

    const systemPrompt = `אתה עוזר חכם שיוצר חידון טריוויה משפחתי בעברית.
הנחיות קשיחות:
1. מקור: הסתמך אך ורק על מידע אמין מויקיפדיה בעברית. אל תמציא עובדות (במיוחד לא על קיבוצים או מקומות קטנים).
2. פורמט: החזר אך ורק מערך JSON מכווץ (Minified). בלי הקדמות ובלי סיומות.
3. קיצורי מפתחות (לחיסכון בכסף):
   - "m": שם המשתתף (מתוך הרשימה שקיבלת)
   - "q": השאלה
   - "o": מערך של 4 אפשרויות
   - "a": אינדקס התשובה הנכונה (0-3)
4. חלוקה: 5 שאלות לילד, 8 למבוגר.
5. שפה: עברית טבעית, שאלות ותשובות קצרות מאוד (עד 6 מילים).`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307", // מעבר למודל הזול ביותר
        max_tokens: 4000,
        system: systemPrompt,
        messages: [
          { role: "user", content: `נושא: ${topic}. משתתפים: ${JSON.stringify(members)}` }
        ],
      }),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}