export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  // Teste simples pelo navegador
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

    // =========================================================
    // LEITURA DO BODY
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

    // Compatibilidade com frontend que envia somente "message"
    if (!messages.length && typeof body.message === "string") {
      const text = body.message.trim();

      if (text) {
        messages = [
          {
            role: "user",
            content: text
          }
        ];
      }
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
Você é o Agente Inkly, agente virtual da Inkly Solutions.

Converse de maneira natural, humana, profissional e consultiva.

Seu objetivo principal é compreender o problema, necessidade ou objetivo
da pessoa e ajudá-la durante a conversa.

REGRAS DE CONVERSA:

- Não responda como um menu.
- Não use respostas engessadas.
- Não fique repetindo opções.
- Não transforme toda resposta em uma pergunta.
- Não invente informações.
- Não diga que é ChatGPT.
- Não diga que é um modelo de linguagem.
- Não diga que teve dificuldade para consultar informações apenas porque
  não conhece algum detalhe.
- Não encaminhe prematuramente a pessoa para um consultor.
- Não interrompa uma conversa que ainda pode ser conduzida por você.

Converse considerando todo o histórico recebido.

Quando a pessoa apresentar um problema, primeiro procure compreender
o contexto.

Faça perguntas somente quando elas realmente ajudarem a entender melhor
a situação.

Quando já houver informações suficientes, dê uma orientação útil,
explique possibilidades e avance naturalmente na conversa.

A Inkly Solutions trabalha com soluções empresariais, melhoria de
processos, operações, logística, melhoria contínua, Lean, treinamentos
e soluções digitais.

Quando o assunto envolver processos ou operações, você pode ajudar a
identificar sintomas, possíveis gargalos, desperdícios, retrabalho,
problemas de fluxo, organização, indicadores e oportunidades de melhoria.

Não invente preços, prazos, contratos, clientes, resultados ou condições
comerciais que não tenham sido fornecidos.

Se não souber uma informação específica da empresa, diga isso de maneira
natural e continue ajudando com aquilo que puder.

Somente conduza para atendimento humano quando houver intenção concreta,
como pedido de orçamento, contratação, reunião, proposta, contato com
especialista ou quando realmente for necessária intervenção humana.

As respostas devem ser claras, naturais e preferencialmente concisas.
`.trim();

    // Remove eventual system enviado pelo frontend para evitar
    // múltiplas instruções de sistema conflitantes.
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

    // Primeiro lemos como texto.
    // Isso evita perder a resposta caso a Cloudflare devolva
    // algo inesperado.
    const rawResponse = await response.text();

    let data;

    try {
      data = JSON.parse(rawResponse);
    } catch {
      console.error(
        "Cloudflare retornou resposta não JSON:",
        rawResponse
      );

      return res.status(502).json({
        ok: false,
        error: "INVALID_CLOUDFLARE_RESPONSE"
      });
    }

    if (!response.ok || data?.success === false) {
      console.error("Cloudflare Workers AI:", data);

      return res.status(response.status || 502).json({
        ok: false,
        error: "CLOUDFLARE_AI_ERROR",
        details: data?.errors || data
      });
    }

    // =========================================================
    // EXTRAÇÃO DA RESPOSTA DA IA
    // =========================================================

    function extractContent(content) {
      if (typeof content === "string") {
        return content.trim();
      }

      // Alguns modelos/APIs podem retornar content como array
      if (Array.isArray(content)) {
        return content
          .map((part) => {
            if (typeof part === "string") {
              return part;
            }

            if (
              part &&
              typeof part === "object" &&
              typeof part.text === "string"
            ) {
              return part.text;
            }

            return "";
          })
          .filter(Boolean)
          .join("\n")
          .trim();
      }

      // Outra possível estrutura
      if (
        content &&
        typeof content === "object" &&
        typeof content.text === "string"
      ) {
        return content.text.trim();
      }

      return "";
    }

    let answer = "";

    // Formato Chat Completions:
    // result.choices[0].message.content
    const choice = data?.result?.choices?.[0];

    if (choice?.message?.content !== undefined) {
      answer = extractContent(choice.message.content);
    }

    // Algumas implementações usam text diretamente no choice
    if (!answer && typeof choice?.text === "string") {
      answer = choice.text.trim();
    }

    // Formato tradicional de alguns modelos Workers AI
    if (!answer && data?.result?.response !== undefined) {
      answer = extractContent(data.result.response);
    }

    // Outros formatos possíveis
    if (!answer && data?.result?.output_text !== undefined) {
      answer = extractContent(data.result.output_text);
    }

    if (!answer && data?.response !== undefined) {
      answer = extractContent(data.response);
    }

    // =========================================================
    // VALIDAÇÃO
    // =========================================================

    if (!answer) {
      console.error(
        "Resposta inesperada Workers AI:",
        JSON.stringify(data, null, 2)
      );

      return res.status(502).json({
        ok: false,
        error: "INVALID_AI_RESPONSE",
        message:
          "A IA respondeu, mas o conteúdo da resposta não pôde ser interpretado."
      });
    }

    // =========================================================
    // RESPOSTA PARA O FRONTEND
    // =========================================================

    return res.status(200).json({
      ok: true,

      // Mantemos os três nomes para compatibilidade
      // com o frontend atual.
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
