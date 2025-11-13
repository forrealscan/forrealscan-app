// api/analyze_v2.js
export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { imageBase64 } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key missing" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

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
              "Du bist ein strenger KI-Detektor. Gib ausschließlich gültiges JSON mit 'score' (0–100), 'reasons' (Array) und 'explanation' (kurzer Text) zurück.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Bewerte dieses Bild. Gib ein JSON mit den Feldern 'score', 'reasons' und 'explanation' zurück.",
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
    console.log("OPENAI RESPONSE v2:", data);

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      return new Response(
        JSON.stringify({
          score: 50,
          reasons: ["Ungültige Antwort von OpenAI."],
          explanation: "Es konnte keine sinnvolle Antwort vom Modell gelesen werden.",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const json = JSON.parse(content);

    return new Response(JSON.stringify(json), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Fehler in analyze_v2:", err);
    return new Response(
      JSON.stringify({
        error: "Fehler bei API-Aufruf",
        details: err.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
