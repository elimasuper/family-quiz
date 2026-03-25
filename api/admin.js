export const config = { runtime: "edge" };

export default async function handler(req) {
  var url = new URL(req.url);
  var key = url.searchParams.get("key");
  
  if (key !== "dare2know-admin-2024") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  var SB = process.env.SUPABASE_URL;
  var SK = process.env.SUPABASE_ANON_KEY;

  if (!SB || !SK) {
    return new Response(JSON.stringify({ error: "Missing Env Vars" }), { status: 500 });
  }

  var headers = { 
    "apikey": SK, 
    "Authorization": "Bearer " + SK, 
    "Content-Type": "application/json" 
  };

  async function sbGet(path) {
    try {
      var r = await fetch(SB + "/rest/v1/" + path, { headers: headers });
      var data = await r.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  try {
    var families = await sbGet("families?select=name,created_at&order=created_at.desc&limit=50");
    var subs = await sbGet("subscriptions?select=family_name,status&status=eq.active");
    var rooms = await sbGet("quiz_rooms?select=id,topic,created_at&order=created_at.desc&limit=50");

    var stats = {
      totalFamilies: families.length,
      activeSubscriptions: subs.length,
      activeGroups: rooms.length,
      recentFamilies: families,
      recentChallenges: rooms
    };

    return new Response(JSON.stringify(stats), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}