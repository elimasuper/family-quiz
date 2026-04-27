export const config = { runtime: "edge" };

async function callClaude(apiKey, topic, useWebSearch) {
  var tools = useWebSearch ? [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }] : [];
  var prompt = useWebSearch
    ? "חפש באינטרנט מידע על הנושא: \"" + topic + "\"\n\nואז כתוב סקירה מקיפה ומעניינת בעברית (2000-3000 מילים) שמתאימה לחידון טריוויה.\n\nכללים:\n1. חפש קודם באינטרנט כדי למצוא עובדות מעניינות.\n2. התמקד במה שמעניין אנשים — לא בפרטים אנציקלופדיים יבשים.\n3. כלול: היסטוריה מרתקת, דמויות מפתח, מספרים מפתיעים, קשרים לתרבות פופולרית, עובדות מפתיעות.\n4. אם הנושא קשור לישראל או ליהדות — הרחב על ההיבטים הישראליים.\n5. כתוב טקסט רציף בלבד, ללא כותרות, ללא Markdown, ללא סעיפים ממוספרים.\n6. רק עובדות מאומתות מהחיפוש! אל תמציא."
    : "כתוב סקירה מקיפה ומעניינת בעברית על הנושא: \"" + topic + "\".\n\nכללים:\n1. כתוב 2000-3000 מילים.\n2. התמקד בעובדות מעניינות, סיפורים מפתיעים, שיאים, ומידע שרוב האנשים לא יודעים.\n3. כלול: היסטוריה, אנשים חשובים, מספרים ונתונים מעניינים, אנקדוטות, עובדות מפתיעות, קשרים לתרבות הפופולרית.\n4. אל תכתוב בסגנון אנציקלופדי יבש — כתוב בסגנון מעניין ומושך שמתאים לחידון טריוויה.\n5. רק עובדות אמיתיות ומוכחות! אסור להמציא.\n6. אם הנושא קשור לישראל או ליהדות — הרחב במיוחד על ההיבטים הישראליים.\n7. כתוב טקסט רציף בלבד, ללא כותרות, ללא סעיפים ממוספרים, ללא Markdown.";

  var bodyObj = {
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }]
  };
  if (tools.length > 0) bodyObj.tools = tools;

  var response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(bodyObj)
  });

  var data = await response.json();

  if (data.error) {
    throw new Error("Claude API error: " + JSON.stringify(data.error));
  }

  var aiText = "";
  if (data.content && data.content.length > 0) {
    for (var i = 0; i < data.content.length; i++) {
      if (data.content[i].type === "text") {
        aiText += data.content[i].text;
      }
    }
  }
  return aiText;
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type" } });
  }

  try {
    var body = await req.json();
    var topic = body.topic || "";
    if (!topic) return new Response(JSON.stringify({ error: "missing topic" }), { status: 400 });

    var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    var aiText = "";
    var source = "ai";

    // שלב 1: נסה עם web search
    try {
      aiText = await callClaude(ANTHROPIC_KEY, topic, true);
      source = "ai+web";
    } catch(e) {
      console.log("Web search failed, trying without:", e.message);
    }

    // שלב 2: אם web search נכשל או החזיר תוכן קצר, נסה בלעדיו
    if (!aiText || aiText.length < 300) {
      try {
        aiText = await callClaude(ANTHROPIC_KEY, topic, false);
        source = "ai";
      } catch(e2) {
        return new Response(JSON.stringify({ error: "Claude error: " + e2.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    if (!aiText || aiText.length < 300) {
      return new Response(JSON.stringify({ error: "תוכן קצר מדי על " + topic, length: aiText ? aiText.length : 0 }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    return new Response(JSON.stringify({ text: aiText, title: topic, source: source }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
}
