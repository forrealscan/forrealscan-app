// api/analyze.js – Edge Function für Vercel
export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    // 1. Nur POST erlauben
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Body auslesen
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const imageBase64 = body?.imageBase64;
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return new Response(
        JSON.stringify({ error: "No image provided" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. API-Key prüfen
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "API key missing" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4. Request an OpenAI – korrektes Vision-Format
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
          response_format: { type: "json_object" }, // erzwingt JSON

          messages: [
            {
              role: "system",
              content:
                "Du bist ein KI-Detektor. Du antwortest IMMER mit gültigem JSON: { \"score\": Zahl 0-100, \"reasons\": [\"Grund 1\", \"Grund 2\"] }",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    "Bewerte dieses Bild. Gib JSON mit score (0–100) und reasons zurück. " +
                    "score = Wahrscheinlichkeit, dass das Bild KI-generiert ist.",
                },
                {
                  type: "image_url",
                  image_url: {
                    // wir bekommen nur den nackten Base64-String aus dem Frontend
                    url: `data:image/jpeg;base64,${imageBase64}`,
                    // detail ist optional, kann aber die Qualität verbessern
                    detail: "high",
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    // 5. Fehler von OpenAI abfangen
    if (!openaiRes.ok) {
      let errText = "";
      try {
        const errJson = await openaiRes.json();
        errText = errJson?.error?.message || JSON.stringify(errJson);
        console.error("OpenAI-Fehler:", errJson);
      } catch {
        errText = await openaiRes.text();
        console.error("OpenAI-Fehler (Text):", errText);
      }

      return new Response(
        JSON.stringify({
          score: 50,
          reasons: [
            "Fehler bei OpenAI: " + errText,
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await openaiRes.json();
    console.log("OPENAI RESPONSE:", data);

    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(
        JSON.stringify({
          score: 50,
          reasons: ["Ungültige Antwort von OpenAI."],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 6. Inhalt parsen (response_format: json_object => content ist String mit JSON)
    let result;
    try {
      result = typeof content === "string" ? JSON.parse(content) : content;
    } catch (parseErr) {
      console.error("JSON-Parse-Fehler:", parseErr, "content:", content);
      return new Response(
        JSON.stringify({
          score: 50,
          reasons: ["Antwort von OpenAI konnte nicht als JSON gelesen werden."],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 7. Minimal validieren und zurückgeben
    if (
      typeof result.score !== "number" ||
      !Array.isArray(result.reasons)
    ) {
      return new Response(
        JSON.stringify({
          score: 50,
          reasons: ["Antwort von OpenAI hatte nicht das erwartete Format."],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("UNGEFANGENER SERVER-FEHLER:", err);
    return new Response(
      JSON.stringify({
        error: "Fehler bei API-Aufruf",
        details: err.message,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
