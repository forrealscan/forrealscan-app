// api/analyze_v2.js
export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    // Nur POST erlauben
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    // Body lesen
    const { imageBase64 } = await req.json();
    if (!imageBase64) {
      return jsonResponse({ error: "No image provided" }, 400);
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return jsonResponse({ error: "API key missing" }, 500);
    }

    // --- OpenAI-Aufruf ------------------------------------------------------
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
              "Du bist ein strenger KI-Bilddetektor. Gib IMMER nur gültiges JSON zurück.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Analysiere dieses Bild und gib JSON mit `score` (0-100) und `reasons` (Array aus kurzen Stichpunkten) zurück.",
              },
              {
                type: "input_image",
                image: {
                  data: imageBase64,
                  mime_type: "image/jpeg",
                },
              },
            ],
          },
        ],
      }),
    });

    const data = await openaiRes.json();
    console.log("OPENAI ROHDATEN analyze_v2:", data);

    const raw = data?.choices?.[0]?.message?.content;

    if (!raw) {
      // Kein Content von OpenAI -> Fallback
      return jsonResponse(
        {
          score: 50,
          reasons: ["Keine gültige Antwort von OpenAI erhalten."],
        },
        200
      );
    }

    // content kann entweder schon ein Objekt sein oder ein JSON-String
    let result;
    if (typeof raw === "string") {
      try {
        result = JSON.parse(raw);
      } catch (e) {
        console.error("JSON-Parse-Fehler (v2):", e, raw);
        return jsonResponse(
          {
            score: 50,
            reasons: ["OpenAI-Antwort konnte nicht als JSON gelesen werden."],
          },
          200
        );
      }
    } else if (typeof raw === "object" && raw !== null) {
      result = raw;
    } else {
      return jsonResponse(
        {
          score: 50,
          reasons: ["Unerwartetes Format der OpenAI-Antwort."],
        },
        200
      );
    }

    // Validierung
    if (typeof result.score !== "number") {
      return jsonResponse(
        {
          score: 50,
          reasons: ["Antwort von OpenAI enthielt keinen gültigen Score."],
        },
        200
      );
    }

    if (!Array.isArray(result.reasons)) {
      result.reasons = [];
    }

    return jsonResponse(result, 200);
  } catch (err) {
    console.error("Fehler in analyze_v2:", err);
    return jsonResponse(
      {
        error: "Fehler bei API-Aufruf",
        details: String(err?.message || err),
      },
      500
    );
  }
}

// Hilfsfunktion für einheitliche JSON-Antworten
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
