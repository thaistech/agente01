export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  // Mantemos o GET para testar a API pelo navegador
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      route: "/api/chat",
      message: "API do agente está ativa",
      provider: "Cloudflare Workers AI"
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");

    return res.status(405).json({
      ok: false,
      error: "METHOD_NOT_ALLOWED"
    });
  }

  try {
    const ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
    const API_TOKEN = process.env.CF_API_TOKEN;

    const MODEL =
      process.env.CF_AI_MODEL ||
      "@cf/zai-org/glm-4.7-flash";

    if (!ACCOUNT_ID || !API_TOKEN) {
      return res.status(500).json({
        ok: false,
        error: "AI_NOT_CONFIGURED",
        message:
          "CF_ACCOUNT_ID ou CF_API_TOKEN não estão configurados no Vercel."
      });
    }

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};

    /*
      Aceita:
      {
        "message": "Olá"
      }

      ou:
      {
        "messages": [...]
      }
    */

    let messages = [];

    if (Array.isArray(body.messages)) {
      messages = body.messages
        .filter(
          (item) =>
            item &&
            typeof item.content === "string" &&
            ["user", "assistant", "system"].includes(item.role)
        )
        .slice(-24);
    }

    if (!messages.length && typeof body.message === "string") {
      messages = [
        {
          role: "user",
          content: body.message
        }
      ];
    }

    if (!messages.length) {
      return res.status(400).json({
        ok: false,
        error: "EMPTY_MESSAGE",
        message: "Nenhuma mensagem foi enviada."
      });
    }

    // Instrução principal do agente
    const systemPrompt = `
Você é o agente virtual da Inkly Solutions.

Converse de maneira natural, humana, profissional e consultiva.

Seu objetivo é entender o que a pessoa precisa antes de tentar encaminhá-la para uma solução.

Não responda como um menu.
Não use respostas engessadas.
Não fique repetindo opções.
Não invente informações.
Não diga que é ChatGPT.
Não diga que é um modelo de linguagem.

Faça perguntas apenas quando forem necessárias para compreender a necessidade da pessoa.

Mantenha contexto durante a conversa e considere as mensagens anteriores.

Quando apropriado, explique soluções da Inkly Solutions de forma clara e objetiva.

Evite respostas excessivamente longas.

Se a pessoa demonstrar intenção real de contratar, solicitar orçamento, falar com especialista ou continuar atendimento comercial, conduza naturalmente para a próxima etapa de atendimento.
`.trim();

    const finalMessages = [
      {
        role: "system",
        content: systemPrompt
      },
      ...messages
    ];

    const endpoint =
      `https://api.cloudflare.com/client/v4/accounts/` +
      `${ACCOUNT_ID}/ai/run/${MODEL}`;

    const response = await fetch(endpoint, {
      method: "POST",

      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        messages: finalMessages,
        max_tokens: 700,
        temperature: 0.7
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Cloudflare Workers AI:", data);

      return res.status(response.status).json({
        ok: false,
        error: "CLOUDFLARE_AI_ERROR",
        details: data
      });
    }

    /*
      Workers AI pode retornar a resposta em formatos
      ligeiramente diferentes dependendo do modelo.
    */

    const answer =
      data?.result?.response ||
      data?.result?.choices?.[0]?.message?.content ||
      data?.result?.choices?.[0]?.text ||
      data?.response ||
      null;

    if (!answer) {
      console.error("Resposta inesperada Workers AI:", data);

      return res.status(502).json({
        ok: false,
        error: "INVALID_AI_RESPONSE",
        details: data
      });
    }

    return res.status(200).json({
      ok: true,

      // Mais de um nome propositalmente:
      // aumenta compatibilidade com o frontend existente.
      message: answer,
      reply: answer,
      response: answer
    });

  } catch (error) {
    console.error("Erro /api/chat:", error);

    return res.status(500).json({
      ok: false,
      error: "CHAT_ERROR",
      message:
        error instanceof Error
          ? error.message
          : "Erro interno do agente."
    });
  }
}
