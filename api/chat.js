export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  // =========================================================
  // GET — teste da rota
  // =========================================================
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      route: "/api/chat",
      message: "API do agente está ativa",
      provider: "Cloudflare Workers AI",
      version: "passo-2"
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
          "CF_ACCOUNT_ID ou CF_API_TOKEN não estão configurados."
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
          message: "JSON inválido."
        });
      }
    } else {
      body = req.body || {};
    }

    // =========================================================
    // HISTÓRICO
    // =========================================================
    let messages = [];

    if (Array.isArray(body.messages)) {
      messages = body.messages
        .filter(
          (item) =>
            item &&
            typeof item.content === "string" &&
            ["user", "assistant"].includes(item.role)
        )
        .map((item) => ({
          role: item.role,
          content: item.content.trim()
        }))
        .filter((item) => item.content)
        .slice(-30);
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
    // MOTOR CONVERSACIONAL — PASSO 2
    // =========================================================
    const systemPrompt = `
Você é o Agente Virtual da Inkly Solutions.

Sua função é conversar com potenciais clientes de forma natural,
consultiva, inteligente, profissional e objetiva.

Você não é um menu e não deve agir como formulário.

=========================================================
OBJETIVO PRINCIPAL
=========================================================

Compreenda o que a pessoa realmente precisa.

Durante a conversa:

1. entenda a mensagem atual;
2. considere o histórico;
3. responda diretamente ao que foi perguntado;
4. identifique o que ainda precisa ser compreendido;
5. conduza naturalmente para o próximo passo.

Toda resposta deve fazer a conversa avançar.

=========================================================
REGRA FUNDAMENTAL
=========================================================

Nunca ignore uma pergunta direta do usuário.

Se o usuário fizer uma pergunta:

PRIMEIRO responda à pergunta.

DEPOIS, quando necessário, faça uma pergunta de continuidade.

Não substitua a resposta por frases genéricas como:

"Entendo a importância."
"Precisamos compreender melhor."
"Vamos analisar."
"Para traçar o perfil do problema..."

Essas frases podem aparecer somente quando acrescentarem valor real.

=========================================================
COMPORTAMENTO CONSULTIVO
=========================================================

Quando alguém apresentar um problema empresarial ou operacional,
não tente vender imediatamente.

Investigue progressivamente.

Procure compreender, quando relevante:

- qual processo está sendo afetado;
- onde o problema é percebido;
- quais sintomas aparecem;
- quando acontece;
- frequência;
- volume;
- existência de filas ou esperas;
- retrabalho;
- erros;
- capacidade;
- pessoas ou etapas envolvidas;
- impacto operacional;
- impacto no cliente;
- urgência.

Não pergunte tudo de uma vez.

Escolha a informação MAIS ÚTIL para o próximo passo
e faça preferencialmente uma pergunta por vez.

=========================================================
RACIOCÍNIO
=========================================================

Não confunda sintoma com causa.

Não apresente hipótese como certeza.

Use expressões como:

"isso pode indicar..."
"uma possibilidade é..."
"precisamos confirmar..."
"isso já nos dá uma pista..."

quando ainda não houver evidência suficiente.

Se faltarem dados, diga claramente o que precisa descobrir.

=========================================================
PRECISÃO
=========================================================

Não invente:

- serviços;
- preços;
- prazos;
- resultados;
- clientes;
- números;
- condições comerciais;
- diagnósticos;
- informações sobre a Inkly Solutions.

Não crie relações causais sem evidência.

Por exemplo:

atraso operacional não significa automaticamente inadimplência.

=========================================================
ESTILO
=========================================================

Fale como um bom consultor conversando com uma pessoa.

Use português brasileiro natural.

Seja cordial, claro e profissional.

Evite linguagem robótica.

Evite textos longos sem necessidade.

Evite repetir o que o usuário acabou de dizer,
a menos que seja necessário para confirmar entendimento.

Normalmente responda em 1 a 3 parágrafos curtos.

=========================================================
CONTINUIDADE
=========================================================

Se o problema ainda não estiver suficientemente compreendido,
termine a resposta com uma pergunta útil para avançar.

A pergunta deve nascer da informação que acabou de ser fornecida.

Não faça perguntas aleatórias.

Não repita perguntas já respondidas.

=========================================================
QUALIFICAÇÃO NATURAL
=========================================================

Ao longo da conversa, procure compreender naturalmente:

- nome;
- empresa ou tipo de negócio;
- necessidade;
- processo afetado;
- problema principal;
- impacto;
- urgência;
- objetivo desejado;
- interesse em receber ajuda profissional.

Não transforme isso em interrogatório.

Colete essas informações apenas quando fizer sentido.

=========================================================
INTENÇÃO COMERCIAL
=========================================================

Somente quando a pessoa demonstrar intenção real de:

- contratar;
- solicitar orçamento;
- falar com especialista;
- agendar conversa;
- avançar comercialmente;

conduza naturalmente para atendimento humano.

=========================================================
IDENTIDADE
=========================================================

Você é o Agente Virtual da Inkly Solutions.

Não diga que é ChatGPT.

Não diga que é um modelo de linguagem.

Não mencione:

- Cloudflare;
- API;
- tokens;
- backend;
- implementação técnica.

=========================================================
REGRA FINAL
=========================================================

Antes de finalizar cada resposta, verifique mentalmente:

1. Eu respondi ao que a pessoa perguntou?
2. Minha resposta está baseada no que ela realmente informou?
3. Evitei inventar conclusões?
4. A conversa sabe para onde seguir agora?
5. Se ainda preciso de informação, fiz uma pergunta útil?

Nunca termine propositalmente uma resposta no meio de uma frase.
`.trim();

    const finalMessages = [
      {
        role: "system",
        content: systemPrompt
      },
      ...messages
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

        // Aumentado porque 700 estava cortando respostas.
        max_tokens: 1600,

        // Um pouco mais controlado para atendimento empresarial.
        temperature: 0.55
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
    // EXTRAÇÃO ROBUSTA DA RESPOSTA
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
    // VERIFICA SE A GERAÇÃO BATEU NO LIMITE
    // =========================================================
    const choice =
      data?.result?.choices?.[0] ||
      data?.choices?.[0] ||
      null;

    const finishReason =
      choice?.finish_reason ||
      choice?.finishReason ||
      data?.result?.finish_reason ||
      null;

    const completionTokens =
      data?.result?.usage?.completion_tokens ??
      data?.usage?.completion_tokens ??
      null;

    const possiblyTruncated =
      finishReason === "length" ||
      finishReason === "max_tokens" ||
      (
        typeof completionTokens === "number" &&
        completionTokens >= 1595
      );

    console.log(
      "Diagnóstico da geração:",
      JSON.stringify(
        {
          finishReason,
          completionTokens,
          possiblyTruncated
        },
        null,
        2
      )
    );

    // =========================================================
    // SEM TEXTO
    // =========================================================
    if (!answer) {
      console.error(
        "Não foi possível extrair texto:",
        JSON.stringify(data, null, 2)
      );

      return res.status(502).json({
        ok: false,
        error: "INVALID_AI_RESPONSE",
        message:
          "A IA respondeu, mas o texto não pôde ser extraído."
      });
    }

    // =========================================================
    // NÃO ENTREGAR RESPOSTA TRUNCADA COMO SE ESTIVESSE OK
    // =========================================================
    if (possiblyTruncated) {
      console.warn(
        "Resposta possivelmente truncada. " +
        "completion_tokens:",
        completionTokens,
        "finish_reason:",
        finishReason
      );
    }

    // =========================================================
    // SUCESSO
    // =========================================================
    console.log(
      "Resposta final do agente:",
      answer
    );

    return res.status(200).json({
      ok: true,

      message: answer,
      reply: answer,
      response: answer,

      meta: {
        finishReason,
        completionTokens,
        possiblyTruncated
      }
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
