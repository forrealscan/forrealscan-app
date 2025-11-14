// analyze_v3.js – Premium V3 mit extra Details (stabil, ohne Sonderzeichen)

export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    // Nur POST zulassen
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Body lesen
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Bilddaten prüfen
    const imageBase64 =
      body && typeof body.imageBase64 === "string" ? body.imageBase64 : null;

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "imageBase64 missing" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // API-Key prüfen
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

    // --- OpenAI Aufruf: o3-mini für Premium V3 ---
    const openaiRes = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey,
        },
        body: JSON.stringify({
          model: "o3-mini",
          temperature: 0,
          // Optional: mehr Denkzeit für bessere Forensik
          // reasoning_effort: "medium",
          messages: [
            {
              role: "system",
              content:
                "Du bist ForRealScan Premium – ein KI-Forensik-Experte. Antworte NUR mit gültigem JSON der Form: {\n  \"score\": Zahl zwischen 0 und 100,\n  \"reasons\": [Liste kurzer deutscher Sätze],\n  \"details\": [Liste detaillierter Beobachtungen, z.B. verdächtige Bildbereiche, Artefakte, Unstimmigkeiten]\n}. Keine zusätzliche Erklärung außerhalb des JSON.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    "Analysiere dieses Bild maximal forensisch. Erkenne KI-Anteil, Artefakte, unnatürliche Details und Inkonsistenzen. Gib NUR JSON zurück.",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: "data:image/jpeg;base64," + imageBase64,
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
      return new Response(
        JSON.stringify({
          error: "OpenAI request failed",
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

    // content aus Antwort holen (String oder Array)
    let content = null;
    if (
      completion &&
      completion.choices &&
      completion.choices[0] &&
      completion.choices[0].message
    ) {
      content = completion.choices[0].message.content;
    }

    if (Array.isArray(content)) {
      // Einige Modelle geben ein Array aus Text-Blöcken zurück
      let text = "";
      for (let i = 0; i < content.length; i++) {
        const part = content[i];
        if (part && typeof part.text === "string") {
          text += part.text;
        }
      }
      content = text;
    }

    if (typeof content !== "string") {
      content = String(content);
    }

    // JSON aus dem Model-Output parsen
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      parsed = {
        score: 50,
        reasons: ["Antwort konnte nicht als JSON geparst werden."],
        details: [content],
      };
    }

    // Score normieren
    let score = 50;
    if (parsed && typeof parsed.score === "number") {
      score = parsed.score;
      if (score < 0) score = 0;
      if (score > 100) score = 100;
    }

    // Reasons & Details absichern
    let reasons = [];
    if (parsed && Array.isArray(parsed.reasons)) {
      reasons = parsed.reasons.map(function (r) {
        return String(r);
      });
    }

    let details = [];
    if (parsed && Array.isArray(parsed.details)) {
      details = parsed.details.map(function (d) {
        return String(d);
      });
    }

    // Antwort an Frontend
    return new Response(
      JSON.stringify({
        score: score,
        reasons: reasons,
        details: details,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    let msg = "";
    if (err && typeof err.message === "string") {
      msg = err.message;
    } else {
      msg = String(err);
    }

    return new Response(
      JSON.stringify({
        error: "Fehler bei API-Aufruf",
        details: msg,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
