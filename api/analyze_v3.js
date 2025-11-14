// api/analyze_v3.js – Premium mit o3-mini (Vision-Analyse, ohne 'temperature')
export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    let body;
    try {
      body = await req.json();
    } catch (_) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const imageBase64 = body?.imageBase64;
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return new Response(
        JSON.stringify({ error: "imageBase64 missing" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY missing" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // --- OpenAI-Aufruf mit o3-mini (Vision) ------------------------------
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "o3-mini",
        messages: [
          {
            role: "system",
            content:
              "Du bist ein Experte für KI-Bilderkennung. Deine Aufgabe ist es, einzuschätzen, wie wahrscheinlich es ist, dass ein Bild von einer KI generiert oder stark mit KI bearbeitet wurde. Antworte ausschließlich mit einem JSON-Objekt {\"score\": Zahl, \"reasons\": [...] }."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Analysiere dieses Bild. Liefere score 0-100 + reasons als Liste. Nur JSON."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                },
              },
            ],
          },
        ]
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("OpenAI o3-mini error:", openaiRes.status, errText);
      return new Response(
        JSON.stringify({
          error: "OpenAI o3-mini request failed",
          status: openaiRes.status,
          details: errText,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const completion = await openaiRes.json();

    let content = completion?.choices?.[0]?.message?.content;
    if (!content) {
      return new Response(
        JSON.stringify({
          error: "No content in OpenAI response",
          raw: completion,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (Array.isArray(content)) {
      const textPart = content.find((c) => c?.type === "text") || content[0];
      content = textPart?.text || "";
    }

    if (typeof content !== "string") {
      content = String(content || "");
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      console.error("JSON parse error:", content);
      parsed = {
        score: 50,
        reasons: ["Antwort konnte nicht geparst werden.", String(content)],
      };
    }

    const rawScore = Number(parsed.score);
    const score = Number.isFinite(rawScore)
      ? Math.max(0, Math.min(100, rawScore))
      : 50;

    const reasons = Array.isArray(parsed.reasons)
      ? parsed.reasons.map((r) => String(r))
      : [];

    return new Response(
      JSON.stringify({ score, reasons }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Fehler in analyze_v3:", err);
    return new Response(
      JSON.stringify({
        error: "Fehler bei API-Aufruf",
        details: String(err?.message || err),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
