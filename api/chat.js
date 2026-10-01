export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  // =========================================================
  // GET — teste simples da rota
  // =========================================================
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
    // =========================================================
    // CONFIGURAÇÃO
    // =========================================================
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

    // =========================================================
    // CORPO DA REQUISIÇÃO
    // =========================================================
    let body = {};

    if (typeof req.body === "string") {
      try {
        body = JSON.parse(req.body);
      } catch {
        return res.status(400).json({
          ok: false,
          error: "INVALID_JSON",
          message: "O corpo da requisição não contém JSON válido."
        });
      }
    } else {
      body = req.body || {};
    }

    // =========================================================
    // HISTÓRICO DA CONVERSA
    // =========================================================
    let messages = [];

    if (Array.isArray(body.messages)) {
      messages = body.messages
        .filter(
          (item) =>
            item &&
            typeof item.content === "string" &&
            ["user", "assistant", "system"].includes(item.role)
        )
        .map((item) => ({
          role: item.role,
          content: item.content.trim()
        }))
        .filter((item) => item.content)
        .slice(-24);
    }

    // Compatibilidade com frontend que manda apenas "message"
    if (
      !messages.length &&
      typeof body.message === "string" &&
      body.message.trim()
    ) {
      messages = [
        {
          role: "user",
          content: body.message.trim()
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

    // =========================================================
    // PERSONALIDADE / COMPORTAMENTO DO AGENTE
    // =========================================================
    const systemPrompt = `
Você é o Agente Virtual da Inkly Solutions.

Você atende pessoas interessadas nos serviços da Inkly Solutions.

Converse como um atendente consultivo inteligente: natural, humano,
profissional, cordial e objetivo.

Sua prioridade é compreender a situação da pessoa antes de recomendar
qualquer solução.

REGRAS DE CONVERSA:

- Não responda como um menu.
- Não use respostas engessadas.
- Não repita frases desnecessariamente.
- Não faça várias perguntas de uma vez sem necessidade.
- Faça perguntas relevantes com base no que a pessoa acabou de dizer.
- Considere todo o histórico recebido nesta conversa.
- Não invente serviços, preços, prazos ou condições.
- Não diga que é ChatGPT.
- Não diga que é um modelo de linguagem.
- Não mencione Cloudflare, API, sistema interno ou implementação técnica.
- Evite respostas excessivamente longas.

Se a pessoa explicar um problema operacional, procure entender:
processo afetado, sintomas, frequência, impacto e informações necessárias
para identificar possíveis causas.

Não tente vender imediatamente.

Primeiro compreenda.
Depois oriente.
Somente então, quando fizer sentido, relacione a necessidade aos serviços
da Inkly Solutions.

Se a pessoa demonstrar intenção clara de contratar, solicitar orçamento,
falar com especialista ou avançar comercialmente, conduza naturalmente
para a próxima etapa do atendimento.
`.trim();

    // Remove system antigo enviado pelo frontend para não duplicar instruções
    const conversationMessages = messages.filter(
      (item) => item.role !== "system"
    );

    const finalMessages = [
      {
        role: "system",
        content: systemPrompt
      },
      ...conversationMessages
    ];

    // =========================================================
    // CLOUDFLARE WORKERS AI
    // =========================================================
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

    const rawText = await response.text();

    let data;

    try {
      data = JSON.parse(rawText);
    } catch {
      console.error(
        "Cloudflare retornou conteúdo não JSON:",
        rawText
      );

      return res.status(502).json({
        ok: false,
        error: "INVALID_CLOUDFLARE_JSON"
      });
    }

    // Log completo — não transforma objetos internos em [Object]
    console.log(
      "Workers AI resposta completa:",
      JSON.stringify(data, null, 2)
    );

    if (!response.ok) {
      console.error(
        "Erro Cloudflare Workers AI:",
        JSON.stringify(data, null, 2)
      );

      return res.status(response.status).json({
        ok: false,
        error: "CLOUDFLARE_AI_ERROR",
        details: data
      });
    }

    // =========================================================
    // EXTRAÇÃO DA RESPOSTA
    // =========================================================
    // O glm-4.7-flash está retornando estrutura chat.completion.
    // Esta função aceita diferentes formatos para não ficarmos
    // presos a uma única estrutura do provider.
    // =========================================================

    function extractText(payload) {
      const candidates = [
        payload?.result?.response,

        payload?.result?.choices?.[0]?.message?.content,

        payload?.result?.choices?.[0]?.message?.text,

        payload?.result?.choices?.[0]?.text,

        payload?.result?.choices?.[0]?.content,

        payload?.result?.choices?.[0]?.response,

        payload?.response,

        payload?.choices?.[0]?.message?.content,

        payload?.choices?.[0]?.message?.text,

        payload?.choices?.[0]?.text,

        payload?.choices?.[0]?.content
      ];

      for (const candidate of candidates) {
        if (
          typeof candidate === "string" &&
          candidate.trim()
        ) {
          return candidate.trim();
        }

        // Alguns providers podem devolver content como array
        if (Array.isArray(candidate)) {
          const text = candidate
            .map((part) => {
              if (typeof part === "string") {
                return part;
              }

              if (
                part &&
                typeof part.text === "string"
              ) {
                return part.text;
              }

              if (
                part &&
                typeof part.content === "string"
              ) {
                return part.content;
              }

              return "";
            })
            .filter(Boolean)
            .join("\n")
            .trim();

          if (text) {
            return text;
          }
        }
      }

      return null;
    }

    const answer = extractText(data);

    // =========================================================
    // RESPOSTA NÃO ENCONTRADA
    // =========================================================
    if (!answer) {
      console.error(
        "Não foi possível extrair texto da resposta Workers AI:",
        JSON.stringify(data, null, 2)
      );

      return res.status(502).json({
        ok: false,
        error: "INVALID_AI_RESPONSE",
        message:
          "A IA respondeu, mas o conteúdo textual não foi localizado.",
        debug: {
          hasResult: !!data?.result,
          hasChoices: Array.isArray(data?.result?.choices),
          choicesLength:
            data?.result?.choices?.length || 0
        }
      });
    }

    // =========================================================
    // SUCESSO
    // =========================================================
    console.log(
      "Resposta extraída da IA:",
      answer
    );

    return res.status(200).json({
      ok: true,

      // Mantemos os três campos porque não vamos quebrar
      // o frontend existente.
      message: answer,
      reply: answer,
      response: answer
    });

  } catch (error) {
    console.error(
      "Erro interno /api/chat:",
      error
    );

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
