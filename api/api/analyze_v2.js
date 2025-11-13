// api/analyze_v2.js – ForRealScan API v2 (Edge Function)

export const config = { runtime: "edge" };

// Helper for consistent JSON output
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
    /** 1) METHOD CHECK */
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    /** 2) READ INPUT */
    const { imageBase64, mimeType } = await req.json();
    if (!imageBase64) {
      return jsonResponse({ error: "No image provided" }, 400);
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return jsonResponse({ error: "Missing OpenAI API Key" }, 500);
    }

    const safeMime = mimeType || "image/jpeg";

    /** 3) SEND TO OPENAI */
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
              "Du bist ein extrem strenger KI-Detektor. Du gibst ausschließlich gültiges JSON aus."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Analysiere dieses Bild extrem genau und gib NUR sauberes JSON zurück:\n" +
                  "- score: Zahl 0–100 (0=real, 100=AI)\n" +
                  "- reasons: Liste von 1–5 kurzen Begründungen\n" +
                  "- detected_model: Name des vermuteten KI-Modells oder 'unknown'\n" +
                  "- uncertainty: 0–1 (0=sicher, 1=unsicher)\n" +
                  "KEIN anderer Text!"
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${safeMime};base64,${imageBase64}`,
                }
              }
            ]
          }
        ]
      })
    });

    /** 4) HANDLE OPENAI ERRORS */
    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("OpenAI Error:", errText);

      return jsonResponse(
        {
          score: 50,
          reasons: ["OpenAI request failed"],
          detected_model: "unknown",
          uncertainty: 1
        },
        200
      );
    }

    const data = await openaiRes.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      return jsonResponse(
        {
          score: 50,
          reasons: ["Invalid OpenAI response"],
          detected_model: "unknown",
          uncertainty: 1
        },
        200
      );
    }

    /** 5) SAFE JSON PARSING */
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return jsonResponse(
        {
          score: 50,
          reasons: ["JSON parsing error"],
          detected_model: "unknown",
          uncertainty: 1
        },
        200
      );
    }

    /** 6) RETURN VALID RESULT */
    return jsonResponse(parsed, 200);

  } catch (err) {
    return jsonResponse(
      {
        error: "Critical server error",
        details: err.message
      },
      500
    );
  }
}
