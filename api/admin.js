export const config = { runtime: "edge" };

export default async function handler(req) {
  var url = new URL(req.url);
  var key = url.searchParams.get("key");
  
  if (key !== "dare2know-admin-2024") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  var SB = process.env.SUPABASE_URL;
  var SK = process.env.SUPABASE_ANON_KEY;
  var headers = { "apikey": SK, "Authorization": "Bearer " + SK, "Content-Type": "application/json" };

  // טיפול בשדרוג משפחה לפרימיום (POST)
  if (req.method === "POST") {
    try {
      var body = await req.json();
      var famName = body.family_name;
      
      // יצירת רשומת מנוי ב-Supabase
      var subData = {
        family_name: famName,
        plan: "premium_manual",
        status: "active",
        created_at: new Date().toISOString()
      };

      await fetch(SB + "/rest/v1/subscriptions", {
        method: "POST",
        headers: headers,
        body: JSON.stringify(subData)
      });

      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
  }

  // טיפול במשיכת נתונים (GET)
  async function sbGet(path) {
    try {
      var r = await fetch(SB + "/rest/v1/" + path, { headers: headers });
      var data = await r.json();
      return Array.isArray(data) ? data : [];
    } catch (e) { return []; }
  }

  try {
    var families = await sbGet("families?select=name,created_at&order=created_at.desc&limit=50");
    var subs = await sbGet("subscriptions?select=family_name,status&status=eq.active");
    var rooms = await sbGet("quiz_rooms?select=id,topic,creator_family,created_at&order=created_at.desc&limit=20");

    return new Response(JSON.stringify({
      totalFamilies: families.length,
      activeSubscriptions: subs.length,
      activeGroups: rooms.length,
      recentFamilies: families,
      recentChallenges: rooms,
      premiumFamilyNames: subs.map(function(s) { return s.family_name; })
    }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}