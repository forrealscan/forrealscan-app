// api/analyze_v3.js
export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  try {
    // Nur POST zulassen
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405 }
      );
    }

    // Body lesen
    const { imageBase64 } = await req.json();
    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "No image provided" }),
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "API key missing" }),
        { status: 500 }
      );
    }

    // ---------- OpenAI-Aufruf (V3-Logik) ----------

    const openaiRes = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0,
          max_tokens: 256,
          response_format: { type: "json_object" },

          messages: [
            {
              role: "system",
              content:
                "Du bist ein extrem strenger KI-Detektor. " +
                "Du analysierst Bilder und gibst NUR gültiges JSON zurück " +
                "mit einem Score und kurzen Begründungen.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    "Analysiere dieses Bild. " +
                    "Schätze, wie wahrscheinlich es von einer KI generiert wurde. " +
                    "0 = sicher menschlich, 100 = sicher KI-generiert. " +
                    "Gib NUR folgendes JSON aus (ohne zusätzlichen Text):\n\n" +
                    '{ "score": Zahl von 0 bis 100, "reasons": ["kurze Begründung 1", "kurze Begründung 2"] }',
                },
                {
                  // Wichtig: image_url – NICHT input_image
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${imageBase64}`,
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.log("OpenAI HTTP-Error:", openaiRes.status, errText);
      return new Response(
        JSON.stringify({
          error: "Fehler von OpenAI",
          details: errText.slice(0, 300),
        }),
        { status: 500 }
      );
    }

    const data = await openaiRes.json();
    console.log(
      "OPENAI RAW RESPONSE (V3):",
      JSON.stringify(data).slice(0, 400)
    );

    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      // Fallback, falls gar nichts zurückkommt
      return new Response(
        JSON.stringify({
          score: 50,
          reasons: ["Keine gültige Antwort von OpenAI erhalten."],
        }),
        { status: 200 }
      );
    }

    // content ist durch response_format eigentlich schon pures JSON
    let parsed;
    try {
      parsed = typeof content === "string" ? JSON.parse(content) : content;
    } catch (e) {
      console.log("JSON-Parse-Fehler in V3:", e, content);
      return new Response(
        JSON.stringify({
          score: 50,
          reasons: ["Antwort von OpenAI konnte nicht als JSON gelesen werden."],
        }),
        { status: 200 }
      );
    }

    // Defensive Normalisierung
    let score = Number(parsed.score);
    if (!Number.isFinite(score)) {
      score = 50;
    }

    const reasonsRaw = Array.isArray(parsed.reasons)
      ? parsed.reasons
      : [];

    const reasons = reasonsRaw.map((r) => String(r)).slice(0, 5);

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
        details: err?.message || String(err),
      }),
      { status: 500 }
    );
  }
}
