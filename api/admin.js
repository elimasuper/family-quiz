export const config = { runtime: "edge" };

export default async function handler(req) {
  var url = new URL(req.url);
  var key = url.searchParams.get("key");
  if (key !== "dare2know-admin-2024") {
    return new Response("unauthorized", { status: 401 });
  }

  var SB = process.env.SUPABASE_URL;
  var SK = process.env.SUPABASE_ANON_KEY;
  var headers = { "apikey": SK, "Authorization": "Bearer " + SK, "Content-Type": "application/json" };

  async function sbGet(path) {
    var r = await fetch(SB + "/rest/v1/" + path, { headers: headers });
    return r.json();
  }

  var families = await sbGet("families?select=name,created_at&order=created_at.desc&limit=100");
  var scores = await sbGet("family_scores?select=family_name,monthly_points,weekly_points,total_games,streak,last_played&order=total_games.desc&limit=100");
  var subscriptions = await sbGet("subscriptions?select=family_name,plan,status,created_at&order=created_at.desc&limit=100");
  var challenges = await sbGet("quiz_rooms?select=code,topic,creator_family,created_at&order=created_at.desc&limit=50");
  var today = new Date().toISOString().split("T")[0];
  var dailyActive = await sbGet("family_scores?daily_date=eq." + today + "&daily_quizzes=gt.0&select=family_name,daily_quizzes");

  var stats = {
    totalFamilies: families.length,
    activeTodayCount: dailyActive.length,
    activeToday: dailyActive,
    totalSubscriptions: subscriptions.filter(function(s) { return s.status === "active"; }).length,
    subscriptions: subscriptions,
    topPlayers: scores.slice(0, 20),
    recentChallenges: challenges.slice(0, 20),
    recentFamilies: families.slice(0, 20)
  };

  return new Response(JSON.stringify(stats), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}
