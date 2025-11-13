// /api/analyze.js – stabile Node.js Version mit Bild-Analyse

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Body auslesen (Vercel parsed JSON automatisch, falls Content-Type: application/json)
    const { imageBase64 } = req.body || {};

    if (!imageBase64) {
      return res.status(400).json({ error: "No image provided" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OpenAI key missing" });
    }

    // Anfrage an OpenAI schicken
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Du bewertest den KI-Anteil in Bildern und gibst NUR ein gültiges JSON-Objekt zurück. Kein Text davor oder danach.",
          },
          {
            role: "user",
            // multimodales Format: Text + Bild
            content: [
              {
                type: "text",
                text: `
Analysiere dieses Bild. Gib NUR JSON zurück in diesem Format:

{
  "score": 0-100,
  "reasons": ["kurzer Grund 1", "kurzer Grund 2"]
}

Erklärung:
- 0 = sicher echtes, nicht KI-generiertes Bild
- 100 = sicher KI-generiertes Bild.
                `,
              },
              {
                type: "input_image",
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
    console.log("OpenAI-Rohantwort:", JSON.stringify(data).slice(0, 500));

    // Falls OpenAI selbst einen Fehler zurückgibt
    if (data.error) {
      return res.status(500).json({
        error: "OpenAI-Fehler: " + data.error.message,
      });
    }

    const text = data?.choices?.[0]?.message?.content || "";

    if (!text) {
      // Nichts Sinnvolles zurückbekommen
      return res.status(200).json({
        score: 50,
        reasons: ["Keine gültige Antwort von OpenAI erhalten."],
      });
    }

    // Versuch, JSON aus dem Text zu extrahieren
    let result;
    try {
      // manchmal hängt noch Text dran – wir suchen die erste {...}-Struktur
      const match = text.match(/\{[\s\S]*\}/);
      const jsonString = match ? match[0] : text;
      result = JSON.parse(jsonString);
    } catch (e) {
      console.error("JSON-Parse-Fehler:", e, "Antworttext:", text);

      return res.status(200).json({
        score: 50,
        reasons: [
          "Antwort konnte nicht als JSON gelesen werden.",
          text.slice(0, 120) + (text.length > 120 ? "..." : ""),
        ],
      });
    }

    // Sicherheitscheck
    if (typeof result.score !== "number" || !Array.isArray(result.reasons)) {
      return res.status(200).json({
        score: 50,
        reasons: ["Antwort hatte nicht das erwartete Format.", JSON.stringify(result).slice(0, 120)],
      });
    }

    // Alles gut – Ergebnis zurückgeben
    return res.status(200).json(result);
  } catch (err) {
    console.error("Serverfehler in /api/analyze:", err);
    return res.status(500).json({
      error: "Fehler bei API-Aufruf",
      details: err.message,
    });
  }
}
