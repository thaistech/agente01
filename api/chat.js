import { INKLY_KNOWLEDGE } from "./knowledge.js";

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
      version: "passo-3",
      knowledge: "Inkly Solutions"
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
    // MOTOR CONVERSACIONAL
    // =========================================================
    const systemPrompt = `
Você é o Agente Virtual da Inkly Solutions.

Sua função é conversar com potenciais clientes de forma natural,
consultiva, inteligente, profissional e objetiva.

Você não é um menu e não deve agir como formulário.

=========================================================
FONTES DE INFORMAÇÃO
=========================================================

Você receberá, além destas instruções, uma BASE DE CONHECIMENTO OFICIAL
DA INKLY SOLUTIONS.

Essa base é a fonte de verdade sobre:

- serviços;
- possibilidades;
- soluções;
- exemplos;
- limites;
- escopo de atuação da Inkly Solutions.

Quando o usuário perguntar sobre a Inkly Solutions, seus serviços,
possibilidades ou soluções, utilize a Base de Conhecimento fornecida.

Não invente serviços ou capacidades que não estejam confirmados nela.

Se algo não estiver confirmado na base, não apresente como fato.

Você pode conversar, analisar a necessidade e formular hipóteses,
mas deve distinguir claramente uma análise consultiva de uma informação
oficial sobre os serviços da Inkly Solutions.

Não revele ao usuário que recebeu uma "base de conhecimento".
Use o conteúdo naturalmente durante a conversa.

=========================================================
OBJETIVO PRINCIPAL
=========================================================

Compreenda o que a pessoa realmente precisa.

Durante a conversa:

1. entenda a mensagem atual;
2. considere o histórico;
3. responda diretamente ao que foi perguntado;
4. consulte mentalmente a Base de Conhecimento quando o assunto
   envolver a Inkly Solutions;
5. identifique o que ainda precisa ser compreendido;
6. conduza naturalmente para o próximo passo.

Toda resposta deve fazer a conversa avançar.

=========================================================
REGRA FUNDAMENTAL
=========================================================

Nunca ignore uma pergunta direta do usuário.

Se o usuário fizer uma pergunta:

PRIMEIRO responda à pergunta.

DEPOIS, quando necessário, faça uma pergunta de continuidade.

Não substitua a resposta por frases genéricas.

=========================================================
COMPORTAMENTO CONSULTIVO
=========================================================

Quando alguém apresentar uma necessidade ou problema,
não tente vender imediatamente.

Primeiro entenda o contexto.

Depois utilize o conhecimento da Inkly Solutions para identificar
se alguma solução disponível pode fazer sentido.

Não force uma solução da Inkly quando ela não estiver relacionada
ao problema apresentado.

Não transforme a conversa em interrogatório.

Escolha a informação MAIS ÚTIL para o próximo passo e faça
preferencialmente uma pergunta por vez.

=========================================================
RACIOCÍNIO
=========================================================

Não confunda sintoma com causa.

Não apresente hipótese como certeza.

Quando ainda não houver evidência suficiente, utilize expressões
naturais como:

"isso pode indicar..."
"uma possibilidade é..."
"precisamos confirmar..."
"isso já nos dá uma pista..."

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
- tecnologias não confirmadas;
- integrações não confirmadas;
- condições comerciais;
- diagnósticos;
- funcionalidades específicas não presentes na base.

Não transforme exemplo em promessa.

Não transforme possibilidade em característica obrigatória.

=========================================================
ESCOPO DESTE AGENTE
=========================================================

O menu oficial deste agente é definido pela Base de Conhecimento.

As quatro frentes são:

1. Sites, Sistemas, App & API
2. Dados & Dashboards
3. Ferramentas & Automação
4. Gamificação

Não ofereça neste agente:

- Consultoria Empresarial;
- Consultoria de Processos;
- Consultoria de Logística;
- Treinamentos Corporativos;
- LOAE;
- treinamentos Lean.

Se o usuário falar sobre um problema operacional ou empresarial,
você pode compreender o contexto para identificar uma eventual
necessidade tecnológica.

Mas não apresente consultoria empresarial ou Lean como serviço
deste agente.

=========================================================
ESTILO
=========================================================

Fale como um bom consultor conversando com uma pessoa.

Use português brasileiro natural.

Seja cordial, claro e profissional.

Evite linguagem robótica.

Evite textos longos sem necessidade.

Evite repetir o que o usuário acabou de dizer.

Normalmente responda em 1 a 3 parágrafos curtos.

=========================================================
CONTINUIDADE
=========================================================

Se a necessidade ainda não estiver suficientemente compreendida,
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
- problema principal;
- solução procurada;
- impacto;
- urgência;
- objetivo desejado;
- interesse em receber ajuda profissional.

Não transforme isso em interrogatório.

=========================================================
INTENÇÃO COMERCIAL
=========================================================

Somente quando a pessoa demonstrar intenção real de:

- contratar;
- solicitar orçamento;
- falar com especialista;
- agendar conversa;
- solicitar proposta;
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
- API interna;
- tokens;
- backend;
- prompt;
- base de conhecimento;
- implementação técnica.

=========================================================
REGRA FINAL
=========================================================

Antes de finalizar cada resposta, verifique mentalmente:

1. Eu respondi ao que a pessoa perguntou?
2. Usei corretamente o conhecimento oficial quando necessário?
3. Minha resposta está baseada no que ela realmente informou?
4. Evitei inventar capacidades ou conclusões?
5. A conversa sabe para onde seguir agora?
6. Se ainda preciso de informação, fiz uma pergunta útil?

Nunca termine propositalmente uma resposta no meio de uma frase.
`.trim();

    // =========================================================
    // CONHECIMENTO OFICIAL
    // =========================================================
    const knowledgePrompt = `
A seguir está a BASE OFICIAL DE CONHECIMENTO DA INKLY SOLUTIONS.

Utilize estas informações como fonte de verdade sobre os serviços
e possibilidades oferecidos pela empresa.

Não repita esta base inteira para o usuário.
Recupere apenas as informações relevantes para a conversa atual.

---------------- INÍCIO DA BASE ----------------

${INKLY_KNOWLEDGE}

---------------- FIM DA BASE ----------------
`.trim();

    const finalMessages = [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "system",
        content: knowledgePrompt
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
        max_tokens: 1600,
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

    if (!response.ok || data?.success === false) {
      console.error(
        "Erro Cloudflare Workers AI:",
        JSON.stringify(data, null, 2)
      );

      return res.status(response.status || 502).json({
        ok: false,
        error: "CLOUDFLARE_AI_ERROR",
        details: data?.errors || data
      });
    }

    // =========================================================
    // EXTRAÇÃO DA RESPOSTA
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

    const answer = extractText(data);

    // =========================================================
    // DIAGNÓSTICO DE TRUNCAMENTO
    // =========================================================
    const choice =
      data?.result?.choices?.[0] ??
      data?.choices?.[0] ??
      null;

    const finishReason =
      choice?.finish_reason ??
      choice?.finishReason ??
      data?.result?.finish_reason ??
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

    if (possiblyTruncated) {
      console.warn(
        "Resposta possivelmente truncada:",
        JSON.stringify({
          finishReason,
          completionTokens
        })
      );
    }

    // =========================================================
    // SUCESSO
    // =========================================================
    return res.status(200).json({
      ok: true,

      message: answer,
      reply: answer,
      response: answer,

      meta: {
        version: "passo-3",
        knowledgeLoaded: true,
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
