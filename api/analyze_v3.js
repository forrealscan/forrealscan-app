// api/analyze_v3.js – Premium mit gpt-4o (stärkste Vision-Analyse, stabil)
// Hinweis: o3-mini unterstützt aktuell keine Bild-Eingaben über /v1/chat/completions.
// Für ForRealScan Premium nutzen wir daher gpt-4o für die beste Bildanalyse.

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

    // --- OpenAI-Aufruf mit gpt-4o (Vision) ------------------------------
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "Du bist ForRealScan Premium – ein Experte für KI-Bilderkennung. " +
              "Deine Aufgabe ist es, einzuschätzen, wie wahrscheinlich es ist, dass ein Bild von einer KI generiert " +
              "oder stark mit KI bearbeitet wurde. Antworte ausschließlich mit einem JSON-Objekt der Form " +
              '{"score": Zahl zwischen 0 und 100, "reasons": ["Grund 1", "Grund 2", ...]} – ohne zusätzlichen Text.'
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Analysiere dieses Bild. Schätze, wie hoch in Prozent die Wahrscheinlichkeit ist, dass das Bild von einer KI generiert " +
                  "oder stark mit KI bearbeitet wurde. Gib score als Zahl zwischen 0 und 100 und reasons als kurze Stichpunkte an. " +
                  "Antworte nur als JSON."
              },
              {
                type: "image_url",
                image_url: {
                  // Wir schicken das Bild als Data-URL (Base64)
                  url: `data:image/jpeg;base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("OpenAI gpt-4o error:", openaiRes.status, errText);
      return new Response(
        JSON.stringify({
          error: "OpenAI gpt-4o request failed",
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

    // content kann String oder Array aus Textblöcken sein
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
      console.error("JSON parse error for OpenAI content:", content);
      // Fallback: score 50, reason mit Roh-Content
      parsed = {
        score: 50,
        reasons: ["Antwort konnte nicht als JSON geparst werden.", String(content)],
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
    console.error("Fehler in analyze_v3 (gpt-4o):", err);
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
