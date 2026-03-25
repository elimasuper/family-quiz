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

  async function sbGet(path) {
    try {
      var r = await fetch(SB + "/rest/v1/" + path, { headers: headers });
      var data = await r.json();
      return Array.isArray(data) ? data : [];
    } catch (e) { return []; }
  }

  try {
    // משיכת נתונים מהטבלאות השונות
    var families = await sbGet("families?select=name,created_at&order=created_at.desc&limit=20");
    var subs = await sbGet("subscriptions?select=family_name,plan,status,created_at&status=eq.active&order=created_at.desc");
    var rooms = await sbGet("quiz_rooms?select=topic,creator_family,code,created_at&order=created_at.desc&limit=20");
    
    // ספירות כלליות (ללא הגבלת limit לצורך המונים)
    var totalFam = await sbGet("families?select=name");
    var totalRooms = await sbGet("quiz_rooms?select=id");

    var stats = {
      totalFamilies: totalFam.length,
      activeSubscriptions: subs.length,
      activeGroups: totalRooms.length,
      recentFamilies: families,
      recentSubs: subs,
      recentChallenges: rooms
    };

    return new Response(JSON.stringify(stats), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}