// api/analyze_v2.js
export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    // Nur POST erlauben
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Body lesen
    const body = await req.json().catch(() => null);
    const imageBase64 = body?.imageBase64;

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return new Response(
        JSON.stringify({ error: "No image provided" }),
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

    // --- OpenAI-Aufruf ----------------------------------------------------
    // Wir nutzen /v1/chat/completions mit gpt-4o-mini und image_url (Data-URL).
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Du bist ein strenger KI-Detektor. Analysiere Bilder und gib NUR gültiges JSON zurück.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Bewerte dieses Bild. Gib ein JSON-Objekt zurück im Format " +
                  '{"score": 0-100, "reasons": ["kurze Begründung 1", "kurze Begründung 2", ...]}. ' +
                  "score = geschätzter KI-Anteil in Prozent.",
              },
              {
                // WICHTIG: 'image_url' + Data-URL (Base64)
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
      }),
    });

    const data = await openaiRes.json();

    // Vollständige Rohantwort ins Log schreiben
    console.log("OPENAI RAW:", JSON.stringify(data, null, 2));

    // Falls OpenAI selbst einen Fehler liefert
    if (!openaiRes.ok || data?.error) {
      const msg = data?.error?.message || "Unknown OpenAI error.";
      return new Response(
        JSON.stringify({
          score: 50,
          reasons: [
            "Keine gültige Antwort von OpenAI erhalten.",
            `OpenAI-Fehler: ${msg}`,
          ],
        }),
        {
          status: 200, // 200, damit die App nicht komplett rot wird
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const content = data?.choices?.[0]?.message?.content;

    if (!content || typeof content !== "string") {
      return new Response(
        JSON.stringify({
          score: 50,
          reasons: [
            "Keine gültige Antwort von OpenAI erhalten.",
            "message.content war leer oder kein String.",
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Versuchen, das JSON aus dem Text zu parsen
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      // Falls das Model doch Text drum herum liefert
      // versuchen wir, den JSON-Teil herauszuschneiden
      try {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) {
          parsed = JSON.parse(match[0]);
        }
      } catch {
        // Ignorieren, wir fallen unten auf den Fallback zurück
      }
    }

    if (
      !parsed ||
      typeof parsed.score !== "number" ||
      !Array.isArray(parsed.reasons)
    ) {
      return new Response(
        JSON.stringify({
          score: 50,
          reasons: [
            "Antwort von OpenAI konnte nicht als gültiges JSON ausgewertet werden.",
            "Roh-Content: " + content.slice(0, 200) + "...",
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Alles ok → Ergebnis direkt zurückgeben
    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Fehler in analyze_v2:", err);
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
