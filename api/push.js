export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" },
    });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    var body = await req.json();
    var challengeCode = body.code;
    var beaterFamily = body.beater_family;
    var beaterPct = body.beater_pct;
    var topic = body.topic;

    if (!challengeCode || !beaterFamily) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 });
    }

    var SUPABASE_URL = process.env.SUPABASE_URL;
    var SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
    var VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
    var VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;

    // מצא את כל המשפחות שהשתתפו באתגר הזה ושהציון שלהן נמוך יותר
    var challengesRes = await fetch(SUPABASE_URL + "/rest/v1/quiz_challenges?code=eq." + challengeCode + "&family_pct=lt." + beaterPct + "&select=family_name", {
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY },
    });
    var beaten = await challengesRes.json();
    if (!beaten || !beaten.length) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }

    // מצא subscriptions של המשפחות שנעקפו
    var familyNames = beaten.map(function(r) { return r.family_name; });
    var subsRes = await fetch(SUPABASE_URL + "/rest/v1/push_subscriptions?family_name=in.(" + familyNames.map(encodeURIComponent).join(",") + ")&select=*", {
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY },
    });
    var subs = await subsRes.json();
    if (!subs || !subs.length) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }

    // שלח push לכל subscription
    var sent = 0;
    for (var i = 0; i < subs.length; i++) {
      var sub = subs[i];
      var payload = JSON.stringify({
        title: "⚔️ עקפו אותכם!",
        body: "משפחת " + beaterFamily + " השיגה " + beaterPct + "% ב" + (topic || "אתגר") + "! תחזירו להם?",
        url: "/?code=" + challengeCode,
        tag: "beaten-" + challengeCode,
      });

      try {
        var pushRes = await sendWebPush(sub.subscription, payload, VAPID_PUBLIC, VAPID_PRIVATE);
        if (pushRes.ok) sent++;
        else if (pushRes.status === 410) {
          // subscription expired — מחק
          await fetch(SUPABASE_URL + "/rest/v1/push_subscriptions?id=eq." + sub.id, {
            method: "DELETE",
            headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY },
          });
        }
      } catch(e) {
        console.error("Push failed for", sub.family_name, e);
      }
    }

    return new Response(JSON.stringify({ sent: sent }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
}

// ─── Web Push without npm (Edge-compatible) ────────────────────────────────
async function sendWebPush(subscriptionJson, payload, vapidPublic, vapidPrivate) {
  var sub = typeof subscriptionJson === "string" ? JSON.parse(subscriptionJson) : subscriptionJson;
  var endpoint = sub.endpoint;
  var audience = new URL(endpoint).origin;

  // Create VAPID JWT
  var header = btoa(JSON.stringify({ typ: "JWT", alg: "ES256" })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  var now = Math.floor(Date.now() / 1000);
  var claimSet = btoa(JSON.stringify({ aud: audience, exp: now + 43200, sub: "mailto:push@family-quiz.app" })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  var unsignedToken = header + "." + claimSet;

  // Import private key
  var privateKeyBytes = Uint8Array.from(atob(vapidPrivate.replace(/-/g, "+").replace(/_/g, "/")), function(c) { return c.charCodeAt(0); });
  var cryptoKey = await crypto.subtle.importKey("raw", privateKeyBytes, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);

  // Sign
  var signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, cryptoKey, new TextEncoder().encode(unsignedToken));
  var sigB64 = btoa(String.fromCharCode.apply(null, new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  var jwt = unsignedToken + "." + sigB64;

  // Encrypt payload (simplified — use aes128gcm)
  var p256dh = sub.keys.p256dh;
  var auth = sub.keys.auth;

  // Import subscriber public key
  var subPubKeyBytes = Uint8Array.from(atob(p256dh.replace(/-/g, "+").replace(/_/g, "/")), function(c) { return c.charCodeAt(0); });
  var authBytes = Uint8Array.from(atob(auth.replace(/-/g, "+").replace(/_/g, "/")), function(c) { return c.charCodeAt(0); });

  // Generate local keypair
  var localKey = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  var localPubExported = await crypto.subtle.exportKey("raw", localKey.publicKey);

  // Import subscriber key for ECDH
  var subPubKey = await crypto.subtle.importKey("raw", subPubKeyBytes, { name: "ECDH", namedCurve: "P-256" }, false, []);

  // Derive shared secret
  var sharedSecret = await crypto.subtle.deriveBits({ name: "ECDH", public: subPubKey }, localKey.privateKey, 256);

  // HKDF to derive encryption key and nonce
  var sharedSecretKey = await crypto.subtle.importKey("raw", sharedSecret, { name: "HKDF" }, false, ["deriveBits"]);

  // PRK = HKDF-Extract(auth, sharedSecret)
  var authInfo = new TextEncoder().encode("Content-Encoding: auth\0");
  var prkBits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: authBytes, info: authInfo }, sharedSecretKey, 256);

  var prkKey = await crypto.subtle.importKey("raw", prkBits, { name: "HKDF" }, false, ["deriveBits"]);

  // Context for key and nonce derivation
  var keyInfo = createInfo("aesgcm", subPubKeyBytes, new Uint8Array(localPubExported));
  var nonceInfo = createInfo("nonce", subPubKeyBytes, new Uint8Array(localPubExported));

  var salt = crypto.getRandomValues(new Uint8Array(16));

  var saltKey = await crypto.subtle.importKey("raw", prkBits, { name: "HKDF" }, false, ["deriveBits"]);

  var keyBits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: salt, info: keyInfo }, saltKey, 128);
  var nonceBits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: salt, info: nonceInfo }, saltKey, 96);

  var contentKey = await crypto.subtle.importKey("raw", keyBits, { name: "AES-GCM" }, false, ["encrypt"]);

  // Pad and encrypt
  var payloadBytes = new TextEncoder().encode(payload);
  var padded = new Uint8Array(2 + payloadBytes.length);
  padded.set([0, 0]);
  padded.set(payloadBytes, 2);

  var encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonceBits }, contentKey, padded);

  // Build body: salt(16) + rs(4) + idlen(1) + keyid(65) + encrypted
  var rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  var localPubBytes = new Uint8Array(localPubExported);
  var body = new Uint8Array(16 + 4 + 1 + localPubBytes.length + encrypted.byteLength);
  body.set(salt, 0);
  body.set(rs, 16);
  body.set([localPubBytes.length], 20);
  body.set(localPubBytes, 21);
  body.set(new Uint8Array(encrypted), 21 + localPubBytes.length);

  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "TTL": "86400",
      "Authorization": "vapid t=" + jwt + ", k=" + vapidPublic,
    },
    body: body,
  });
}

function createInfo(type, clientPublicKey, serverPublicKey) {
  var typeBytes = new TextEncoder().encode("Content-Encoding: " + type + "\0P-256\0");
  var info = new Uint8Array(typeBytes.length + 2 + clientPublicKey.length + 2 + serverPublicKey.length);
  var offset = 0;
  info.set(typeBytes, offset); offset += typeBytes.length;
  info.set([0, clientPublicKey.length], offset); offset += 2;
  info.set(clientPublicKey, offset); offset += clientPublicKey.length;
  info.set([0, serverPublicKey.length], offset); offset += 2;
  info.set(serverPublicKey, offset);
  return info;
}
