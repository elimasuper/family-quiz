export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type" } });
  }

  try {
    const body = await req.json();
    const topic = body.topic || "";
    if (!topic) return new Response(JSON.stringify({ error: "missing topic" }), { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });

    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_KEY) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }

    const prompt = "כתוב סקירה מקיפה ומעניינת בעברית על הנושא: \"" + topic + "\".\n\nכללים:\n1. כתוב 2000-3000 מילים.\n2. התמקד בעובדות מעניינות, סיפורים מפתיעים, שיאים, ומידע שרוב האנשים לא יודעים.\n3. כלול: היסטוריה, אנשים חשובים, מספרים ונתונים מעניינים, אנקדוטות, עובדות מפתיעות, קשרים לתרבות הפופולרית.\n4. אל תכתוב בסגנון אנציקלופדי יבש — כתוב בסגנון מעניין ומושך שמתאים לחידון טריוויה.\n5. רק עובדות אמיתיות ומוכחות!\n6. אם הנושא קשור לישראל או ליהדות — הרחב במיוחד על ההיבטים הישראליים.\n7. כתוב טקסט רציף בלבד, ללא כותרות, ללא סעיפים ממוספרים, ללא Markdown.";

    // Gemini with Google Search grounding
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + GEMINI_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: {
            maxOutputTokens: 4000,
            temperature: 0.7,
          }
        }),
      }
    );

    const data = await response.json();

    if (data.error) {
      // Fallback without search
      const response2 = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + GEMINI_KEY,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 4000, temperature: 0.7 }
          }),
        }
      );
      const data2 = await response2.json();
      const text2 = data2.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (text2.length < 300) {
        return new Response(JSON.stringify({ error: "content too short", detail: data2.error }), { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
      }
      return new Response(JSON.stringify({ text: text2, title: topic, source: "gemini" }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!aiText || aiText.length < 300) {
      return new Response(JSON.stringify({ error: "content too short", length: aiText.length }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    return new Response(JSON.stringify({ text: aiText, title: topic, source: "gemini+search" }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
}
