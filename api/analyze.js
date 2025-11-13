// api/analyze.js – ForRealScan API v2 (Edge Function)

// Vercel Edge Runtime
export const config = { runtime: "edge" };

// Kleiner Helper für JSON-Antworten
function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export default async function handler(req) {
  try {
    // Nur POST erlauben
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    // Body lesen
    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const imageBase64 = body?.imageBase64;
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return jsonResponse({ error: "No image provided" }, 400);
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return jsonResponse(
        { error: "OPENAI_API_KEY is missing on the server" },
        500
      );
    }

    // 🔍 Prompt für Version 2 – strukturiertere Antwort
    const prompt = `
Du bist ein sehr strenger Detektor für KI-generierte Bilder.

Analysiere das Bild und gib eine JSON-Antwort im GENAU folgenden Format zurück:

{
  "score": 0-100,
  "label": "likely_human" | "uncertain" | "likely_ai",
  "confidence": "low" | "medium" | "high",
  "category": "kurze Beschreibung des Bildtyps",
  "artifacts": ["kurzer Punkt zu Auffälligkeit 1", "..."],
  "reasons": ["kurze Begründung 1", "kurze Begründung 2"],
  "advice": "1-2 kurze Sätze, was der Nutzer beachten sollte."
}

Definitionen:
- "score": 0 = sehr sicher menschlich, 100 = sehr sicher KI-generiert.
- "label": auf Basis des Scores:
    - 0-30 -> "likely_human"
    - 31-69 -> "uncertain"
    - 70-100 -> "likely_ai"
- "artifacts": Konkrete visuelle Auffälligkeiten oder typische KI-Fehler (wenn keine klar erkennbar sind, ein Eintrag mit "Keine deutlichen KI-Artefakte erkennbar").

WICHTIG:
- Gib NUR gültiges JSON zurück, ohne Erklärtext davor oder danach.
- Verwende immer doppelte Anführungszeichen für alle Strings.
- Alle Felder müssen vorhanden sein.
`;

    // 📡 OpenAI-Aufruf (Chat Completions, gpt-4o-mini)
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
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "Du bist ein strenger KI-Detektor für Bilder und gibst ausschließlich gültiges JSON entsprechend der Anweisung zurück.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: prompt.trim(),
                },
                // Bild als Data-URL übergeben (funktioniert mit gpt-4o-mini)
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
      }
    );

    // Falls OpenAI mit Fehlerstatus antwortet
    if (!openaiRes.ok) {
      const errText = await openaiRes.text().catch(() => "");
      console.error("OpenAI HTTP Error:", openaiRes.status, errText);

      return jsonResponse(
        {
          error: "OpenAI request failed",
          status: openaiRes.status,
          details: errText.slice(0, 400), // etwas kürzen
        },
        502
      );
    }

    const data = await openaiRes.json();
    console.log("OPENAI RESPONSE:", data);

    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      // Fallback: neutrale Antwort
      return jsonResponse(
        {
          score: 50,
          label: "uncertain",
          confidence: "low",
          category: "Unklar",
          artifacts: ["Keine verwertbare Analyse von OpenAI erhalten."],
          reasons: ["Ungültige oder leere Antwort von OpenAI."],
          advice:
            "Versuche es mit einem anderen Bild oder später erneut. Falls der Fehler anhält, könnte ein Serverproblem vorliegen.",
        },
        200
      );
    }

    // JSON aus dem Content parsen
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      console.error("JSON parse error:", err, "Content war:", content);

      return jsonResponse(
        {
          score: 50,
          label: "uncertain",
          confidence: "low",
          category: "Unklar",
          artifacts: ["Antwort konnte nicht als JSON geparst werden."],
          reasons: ["OpenAI hat kein gültiges JSON geliefert."],
          advice:
            "Bitte später erneut versuchen. Falls der Fehler dauerhaft auftritt, sollte der Prompt überarbeitet werden.",
        },
        200
      );
    }

    // 🧹 Ergebnis aufräumen & fallback-sicher machen
    const rawScore = Number(parsed.score);
    let score = Number.isFinite(rawScore) ? rawScore : 50;
    if (score < 0) score = 0;
    if (score > 100) score = 100;

    // label ggf. aus Score ableiten
    let label = parsed.label;
    if (label !== "likely_human" && label !== "uncertain" && label !== "likely_ai") {
      if (score <= 30) label = "likely_human";
      else if (score >= 70) label = "likely_ai";
      else label = "uncertain";
    }

    // confidence fallback
    let confidence = parsed.confidence;
    if (!["low", "medium", "high"].includes(confidence)) {
      if (score <= 20 || score >= 80) confidence = "high";
      else if (score <= 40 || score >= 60) confidence = "medium";
      else confidence = "low";
    }

    const category =
      typeof parsed.category === "string" && parsed.category.trim().length > 0
        ? parsed.category.trim()
        : "Nicht eindeutig klassifizierbar";

    const artifacts = Array.isArray(parsed.artifacts)
      ? parsed.artifacts.map((a) => String(a))
      : [];

    const reasons = Array.isArray(parsed.reasons)
      ? parsed.reasons.map((r) => String(r))
      : ["Keine expliziten Begründungen vorhanden."];

    const advice =
      typeof parsed.advice === "string" && parsed.advice.trim().length > 0
        ? parsed.advice.trim()
        : "Prüfe das Bild im Kontext (Quelle, Datum, Metadaten), um eine fundierte Einschätzung zu treffen.";

    // 👇 Rückgabeobjekt – kompatibel mit v1 (score & reasons bleiben!)
    const result = {
      score,
      label,
      confidence,
      category,
      artifacts,
      reasons,
      advice,
    };

    return jsonResponse(result, 200);
  } catch (err) {
    console.error("UNHANDLED API ERROR:", err);
    return jsonResponse(
      {
        error: "Fehler bei API-Aufruf",
        details: String(err?.message || err),
      },
      500
    );
  }
}
