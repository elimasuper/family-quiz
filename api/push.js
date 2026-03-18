import webpush from "web-push";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    var body = req.body;
    var challengeCode = body.code;
    var beaterFamily = body.beater_family;
    var beaterPct = body.beater_pct;
    var topic = body.topic;

    if (!challengeCode || !beaterFamily) {
      return res.status(400).json({ error: "Missing fields" });
    }

    var SUPABASE_URL = process.env.SUPABASE_URL;
    var SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
    var VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
    var VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;

    webpush.setVapidDetails("mailto:push@family-quiz.app", VAPID_PUBLIC, VAPID_PRIVATE);

    // מצא משפחות שנעקפו
    var url1 = SUPABASE_URL + "/rest/v1/quiz_challenges?code=eq." + challengeCode + "&family_pct=lt." + beaterPct + "&select=family_name";
    var challengesRes = await fetch(url1, {
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY }
    });
    var beaten = await challengesRes.json();
    if (!beaten || !beaten.length) return res.json({ sent: 0 });

    // מצא subscriptions
    var familyNames = beaten.map(function(r) { return r.family_name; });
    var url2 = SUPABASE_URL + "/rest/v1/push_subscriptions?family_name=in.(" + familyNames.map(encodeURIComponent).join(",") + ")&select=*";
    var subsRes = await fetch(url2, {
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY }
    });
    var subs = await subsRes.json();
    if (!subs || !subs.length) return res.json({ sent: 0 });

    // שלח push
    var sent = 0;
    for (var i = 0; i < subs.length; i++) {
      var sub = subs[i];

      var payload = JSON.stringify({
        title: "⚔️ עקפו אותכם!",
        body: "משפחת " + beaterFamily + " השיגה " + beaterPct + "% ב" + (topic || "אתגר") + "! תחזירו להם?",
        url: "/?code=" + challengeCode,
        tag: "beaten-" + challengeCode
      });

      try {
        await webpush.sendNotification(sub.subscription, payload);
        sent++;
      } catch(e) {
        console.error("Push failed:", sub.family_name, e.statusCode || e.message);

        // מחיקת subscription לא תקין
        if (e.statusCode === 410 || e.statusCode === 404) {
          var delUrl = SUPABASE_URL + "/rest/v1/push_subscriptions?id=eq." + sub.id;
          await fetch(delUrl, {
            method: "DELETE",
            headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY }
          }).catch(function(){});
        }
      }
    }

    return res.json({ sent: sent });
  } catch(e) {
    console.error("Push handler error:", e);
    return res.status(500).json({ error: e.message });
  }
}