export const config = {
  runtime: "edge"
};

export default async function handler(req) {
  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405 }
      );
    }

    // Body auslesen
    const { imageBase64 } = await req.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "No image provided" }),
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing OpenAI API Key" }),
        { status: 500 }
      );
    }

    // OpenAI API Request (Vision)
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Du bist ein zuverlässiger KI-Detektor. Antworte **immer** mit gültigem JSON: {\"score\": Zahl, \"reasons\": [..]}"
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Analysiere dieses Bild und gib ein JSON zurück mit 'score' (0–100) und 'reasons' (Liste)."
              },
              {
                type: "input_image",
                image: {
                  data: imageBase64,
                  mime_type: "image/jpeg"
                }
              }
            ]
          }
        ]
      })
    });

    const apiData = await openaiRes.json();

    // Fehler von OpenAI
    if (!openaiRes.ok) {
      console.error("OPENAI ERROR:", apiData);

      return new Response(
        JSON.stringify({
          error: "OpenAI error",
          details: apiData?.error?.message || "Unknown error"
        }),
        { status: 500 }
      );
    }

    // Inhalt extrahieren
    const content = apiData?.choices?.[0]?.message?.content || "";

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return new Response(
        JSON.stringify({
          score: 50,
          reasons: ["Ungültige JSON-Antwort von OpenAI."]
        }),
        { status: 200 }
      );
    }

    // Saubere Erfolgsausgabe
    return new Response(JSON.stringify(parsed), { status: 200 });

  } catch (err) {
    console.error("SERVER ERROR:", err);

    return new Response(
      JSON.stringify({
        error: "Server error",
        details: err.message
      }),
      { status: 500 }
    );
  }
}
