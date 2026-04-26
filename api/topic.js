export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type" } });
  }

  try {
    var body = await req.json();
    var topic = body.topic || "";
    if (!topic) return new Response(JSON.stringify({ error: "missing topic" }), { status: 400 });

    var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

    // קריאה ל-Haiku עם web search tool — מביא מידע עדכני מהאינטרנט
    var response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20241022",
        max_tokens: 4000,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 3
          }
        ],
        messages: [{
          role: "user",
          content: "חפש באינטרנט מידע על הנושא: \"" + topic + "\"\n\nואז כתוב סקירה מקיפה ומעניינת בעברית (2000-3000 מילים) שמתאימה לחידון טריוויה.\n\nכללים:\n1. חפש קודם באינטרנט כדי למצוא עובדות מעניינות, מספרים, שיאים, ואנקדוטות.\n2. התמקד במה שמעניין אנשים — לא בפרטים אנציקלופדיים יבשים.\n3. כלול: היסטוריה מרתקת, דמויות מפתח, מספרים מפתיעים, קשרים לתרבות פופולרית, עובדות שרוב האנשים לא יודעים.\n4. אם הנושא קשור לישראל או ליהדות — הרחב על ההיבטים הישראליים.\n5. כתוב טקסט רציף בלבד, ללא כותרות, ללא Markdown, ללא סעיפים ממוספרים.\n6. רק עובדות מאומתות מהחיפוש! אל תמציא."
        }]
      })
    });

    var data = await response.json();

    // חלץ את הטקסט מתוך כל ה-content blocks
    var aiText = "";
    if (data.content && data.content.length > 0) {
      for (var i = 0; i < data.content.length; i++) {
        if (data.content[i].type === "text") {
          aiText += data.content[i].text;
        }
      }
    }

    if (!aiText || aiText.length < 300) {
      return new Response(JSON.stringify({ error: "לא הצלחתי ליצור תוכן על " + topic }), { status: 400 });
    }

    return new Response(JSON.stringify({ text: aiText, title: topic, source: "ai+web" }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
}
