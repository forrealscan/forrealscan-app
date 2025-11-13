// api/analyze.js
export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    }

    const { imageBase64, mimeType } = await req.json();
    if (!imageBase64 || !mimeType) {
      return new Response(JSON.stringify({ error: "No image or MIME type provided" }), { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key missing" }), { status: 500 });
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
            content: "Du bist ein strenger KI-Detektor. Gib NUR gültiges JSON aus."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analysiere dieses Bild. Gib JSON mit score (0–100) und reasons zurück."
              },
              {
                type: "image_url",
                image_url: `data:${mimeType};base64,${imageBase64}`
              }
            ]
          }
        ]
      })
    });

    const data = await openaiRes.json();
    console.log("OPENAI RESPONSE:", data);

    if (!data.choices || !data.choices[0].message) {
      return new Response(JSON.stringify({
        score: 50,
        reasons: ["Keine gültige Antwort von OpenAI erhalten."]
      }), { status: 200 });
    }

    const content = data.choices[0].message.content;

    let result;
    try {
      result = JSON.parse(content);
    } catch {
      return new Response(JSON.stringify({
        score: 50,
        reasons: ["Antwort war kein gültiges JSON."]
      }), { status: 200 });
    }

    return new Response(JSON.stringify(result), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({
      error: "Fehler bei API-Aufruf",
      details: err.message
    }), { status: 500 });
  }
}
