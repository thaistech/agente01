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
        "CLOUDFLARE_RAW_TEXT=" + rawText
      );

      return res.status(502).json({
        ok: false,
        error: "INVALID_CLOUDFLARE_JSON"
      });
    }

    // =========================================================
    // LOGS DE DIAGNÓSTICO
    // =========================================================

    console.log(
      "CLOUDFLARE_RESPONSE=" +
      JSON.stringify(data)
    );

    console.log(
      "RESULT_JSON=" +
      JSON.stringify(data?.result ?? null)
    );

    const choice =
      data?.result?.choices?.[0] ??
      data?.choices?.[0] ??
      null;

    console.log(
      "CHOICE_0_JSON=" +
      JSON.stringify(choice)
    );

    if (!response.ok) {
      console.error(
        "CLOUDFLARE_ERROR=" +
        JSON.stringify(data)
      );

      return res.status(response.status).json({
        ok: false,
        error: "CLOUDFLARE_AI_ERROR",
        details: data
      });
    }

    // =========================================================
    // FUNÇÕES PARA EXTRAIR TEXTO
    // =========================================================

    function normalizeText(value) {
      if (typeof value === "string") {
        const text = value.trim();
        return text || null;
      }

      if (Array.isArray(value)) {
        const text = value
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

            if (
              part?.text &&
              typeof part.text.value === "string"
            ) {
              return part.text.value;
            }

            return "";
          })
          .filter(Boolean)
          .join("\n")
          .trim();

        return text || null;
      }

      return null;
    }

    function extractText(payload) {
      const result = payload?.result;

      const firstChoice =
        result?.choices?.[0] ??
        payload?.choices?.[0];

      const candidates = [
        result?.response,

        result?.text,

        result?.content,

        firstChoice?.message?.content,

        firstChoice?.message?.text,

        firstChoice?.message?.response,

        firstChoice?.text,

        firstChoice?.content,

        firstChoice?.response,

        firstChoice?.delta?.content,

        firstChoice?.delta?.text,

        payload?.response,

        payload?.text,

        payload?.content
      ];

      for (const candidate of candidates) {
        const text = normalizeText(candidate);

        if (text) {
          return text;
        }
      }

      return null;
    }

    // =========================================================
    // TENTA EXTRAIR A RESPOSTA
    // =========================================================

    const answer = extractText(data);

    // =========================================================
    // SE AINDA NÃO ENCONTRAR, DEVOLVE O FORMATO REAL
    // =========================================================

    if (!answer) {
      console.error(
        "TEXT_NOT_FOUND_CHOICE=" +
        JSON.stringify(choice)
      );

      console.error(
        "TEXT_NOT_FOUND_RESULT=" +
        JSON.stringify(data?.result ?? null)
      );

      return res.status(502).json({
        ok: false,
        error: "INVALID_AI_RESPONSE",
        message:
          "A IA respondeu, mas o conteúdo textual ainda não foi localizado.",

        debug: {
          result: data?.result ?? null,
          choice0: choice
        }
      });
    }

    // =========================================================
    // SUCESSO
    // =========================================================

    console.log(
      "AI_TEXT=" +
      JSON.stringify(answer)
    );

    return res.status(200).json({
      ok: true,
      message: answer,
      reply: answer,
      response: answer
    });

  } catch (error) {
    console.error(
      "CHAT_ERROR=" +
      (
        error instanceof Error
          ? error.stack || error.message
          : String(error)
      )
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
