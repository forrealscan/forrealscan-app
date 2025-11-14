// api/analyze_v3.js – Premium-Analyse mit gpt-4o + erweiterten Details
// Gibt zurück: { score, reasons, details }

export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

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

    // ---- GPT‑4o Vision-Analyse ----
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
              "Du bist ForRealScan Premium – ein forensischer KI-Bildanalyst. " +
              "Analysiere Bilder extrem präzise. Finde subtile KI-Artefakte, wie: " +
              "Porenlosigkeit, Renderhaut, unnatürliche Texturglätte, Augen-Reflex-Symmetrie, " +
              "Bokeh-Artefakte, KI-Noise, Hintergrundfehler, Haartextur-Symmetrie, " +
              "Anatomie-Ungereimtheiten, Lichtphysik, Pupillenform, Übergangsunschärfen, " +
              "Depth-of-Field-Konsistenz, Schärfeverteilung, JPEG-Kompressionsmuster, " +
              "Hautmikrodetails, unnatürlich perfekte Proportionen." +
              "Gib die Antwort ausschließlich im JSON-Format zurück."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Analysiere dieses Bild maximal forensisch. " +
                  "Gib ein JSON zurück mit diesen Feldern: " +
                  "{ "score": Zahl 0-100, " +
                  ""reasons": [kurze Gründe], " +
                  ""details": [lange technische Erklärungen der KI-Artefakte] }"
              },
              {
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
    let content = completion?.choices?.[0]?.message?.content || "";

    if (Array.isArray(content)) {
      const textPart = content.find(c => c?.type === "text") || content[0];
      content = textPart?.text || "";
    }

    if (typeof content !== "string") content = String(content);

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      parsed = {
        score: 50,
        reasons: ["Konnte JSON nicht parsen."],
        details: [content]
      };
    }

    return new Response(
      JSON.stringify({
        score: parsed.score ?? 50,
        reasons: parsed.reasons ?? [],
        details: parsed.details ?? [],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
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
