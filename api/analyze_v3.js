// analyze_v3.js - Fehlerfreie Ultra-Details Version

export const config = { runtime: “edge” };

export default async function handler(req) { try { if (req.method !==
“POST”) { return new Response(JSON.stringify({ error: “Method not
allowed” }), { status: 405, headers: { “Content-Type”:
“application/json” }, }); }

    let body;
    try {
      body = await req.json();
    } catch (_) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const imageBase64 = body?.imageBase64;
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return new Response(JSON.stringify({ error: "imageBase64 missing" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY missing" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "Du bist ForRealScan Premium – KI-Forensik. JSON-Ausgabe: {score, reasons, details}."
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Analysiere dieses Bild maximal forensisch. JSON zurückgeben." },
              { type: "image_url", image_url: { url: "data:image/jpeg;base64," + imageBase64 } }
            ]
          }
        ]
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      return new Response(JSON.stringify({
        error: "OpenAI request failed",
        status: openaiRes.status,
        details: errText
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const completion = await openaiRes.json();
    let content = completion?.choices?.[0]?.message?.content || "";

    if (Array.isArray(content)) {
      const textPart = content.find(c => c?.type === "text") || content[0];
      content = textPart?.text || "";
    }

    if (typeof content !== "string") content = String(content);

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {
        score: 50,
        reasons: ["Konnte nicht geparst werden."],
        details: [content]
      };
    }

    return new Response(JSON.stringify({
      score: parsed.score ?? 50,
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
      details: Array.isArray(parsed.details) ? parsed.details : []
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

} catch (err) { return new Response(JSON.stringify({ error: “Fehler bei
API-Aufruf”, details: String(err?.message || err) }), { status: 500,
headers: { “Content-Type”: “application/json” }, }); } }
