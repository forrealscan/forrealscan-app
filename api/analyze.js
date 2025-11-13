// /api/analyze.js – stabile Version

export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    }

    const { imageBase64 } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No image provided" }), { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "OpenAI key missing" }), { status: 500 });
    }

    // Anfrage an OpenAI senden
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" }, // zwingt JSON!
        messages: [
          {
            role: "system",
            content: "Du gibst IMMER nur gültiges JSON zurück. Keine Erklärungen.",
          },
          {
            role: "user",
            content: `Analysiere dieses Bild (Base64) und gib JSON zurück:
            {
              "score": 0-100,
              "reasons": ["Grund 1", "Grund 2"]
            }

            Bild: ${imageBase64}`,
          },
        ],
      }),
    });

    const data = await openaiRes.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(JSON.stringify({
        score: 50,
        reasons: ["Keine gültige Antwort von OpenAI."],
      }), { status: 200 });
    }

    const result = JSON.parse(content);
    return new Response(JSON.stringify(result), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({
      error: "Serverfehler",
      details: err.message,
    }), { status: 500 });
  }
}
