const SYSTEM = `Você é o Agente Virtual da Inkly Solutions. Atenda em português do Brasil, com linguagem humana, objetiva, consultiva e cordial.

SOBRE A INKLY SOLUTIONS — SOLUÇÕES DIGITAIS:
- Sites, landing pages e experiências web.
- Sistemas e ferramentas digitais sob medida.
- Aplicativos mobile, Android e PWA. Nunca trate todo aplicativo como PWA; descubra a necessidade real.
- APIs, integrações e conexão entre sistemas.
- Automação de processos e tarefas repetitivas.
- Dados, dashboards, indicadores e BI.
- Formulários, checklists, controles, avaliações e ferramentas para processos e rotinas.
- Gamificação, jogos corporativos, simulações e experiências interativas.

COMPORTAMENTO:
1. Entenda primeiro o que o cliente quer resolver e o resultado esperado. Faça uma pergunta por vez quando precisar aprofundar.
2. Use o histórico. Não repita perguntas já respondidas e não reinicie o diagnóstico a cada mensagem.
3. Responda mensagens abertas normalmente, mesmo que o cliente não use os botões do menu.
4. Não invente preços, prazos, condições comerciais, cases, tecnologias contratadas ou garantias.
5. Para preço, orçamento, proposta, prazo comercial, contratação, análise muito específica ou intenção clara de avançar, explique brevemente e ofereça a opção de falar com um de nossos consultores.
6. Quando uma informação depender de análise específica, diga isso com naturalidade e ofereça: falar com um consultor ou continuar pelo chat.
7. Nunca use a expressão "atendimento humano". Diga "um de nossos consultores".
8. Não peça nome, telefone ou e-mail dentro da resposta. A interface coleta esses dados no formulário de encaminhamento.
9. Nunca diga que transferiu, encaminhou ou enviou dados antes da confirmação do formulário.
10. Diferencie corretamente site, sistema, aplicativo mobile/Android, PWA, API, automação, dashboard/dados, ferramenta digital e gamificação.
11. Se o usuário quiser apenas tirar dúvidas, continue ajudando sem pressionar por contato comercial.
12. Seja conciso: normalmente 1 a 3 parágrafos curtos.

Responda SOMENTE JSON válido, sem markdown: {"reply":"texto ao cliente","offerConsultant":false}. Use offerConsultant=true somente quando fizer sentido mostrar os botões “Falar com um consultor” e “Continuar atendimento”.`;

function cleanHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-20).map((x) => ({
    role: x && x.role === "assistant" ? "assistant" : "user",
    content: String(x?.content || "").trim().slice(0, 2500)
  })).filter((x) => x.content);
}

function parseAnswer(text) {
  const clean = String(text || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/i, "");
  try { return JSON.parse(clean); } catch {}
  const match = clean.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  return {
    reply: clean || "Posso te ajudar a entender melhor essa necessidade.",
    offerConsultant: false
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Método não permitido" });
  }

  try {
    // Nomes EXATOS configurados na Vercel.
    // Mantemos também os nomes antigos como compatibilidade.
    const accountId = String(
      process.env.CF_ACCOUNT_ID ||
      process.env.CLOUDFLARE_ACCOUNT_ID ||
      ""
    ).trim();

    const token = String(
      process.env.CF_API_TOKEN ||
      process.env.CLOUDFLARE_API_TOKEN ||
      ""
    ).trim();

    if (!accountId || !token) {
      console.error("Cloudflare não configurado", {
        hasAccountId: !!accountId,
        hasToken: !!token
      });
      return res.status(503).json({
        ok: false,
        error: "Cloudflare não configurado no servidor"
      });
    }

    const body = typeof req.body === "string"
      ? JSON.parse(req.body || "{}")
      : (req.body || {});

    const message = String(body.message || "").trim().slice(0, 4000);
    if (!message) {
      return res.status(400).json({ ok: false, error: "Mensagem vazia" });
    }

    const history = cleanHistory(body.history);
    const messages = [
      { role: "system", content: SYSTEM },
      ...history,
      { role: "user", content: message }
    ];

    // Modelo atual recomendado pela Cloudflare.
    const model =
      process.env.CF_AI_MODEL ||
      process.env.CLOUDFLARE_AI_MODEL ||
      "@cf/zai-org/glm-4.7-flash";

    const url =
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}` +
      `/ai/run/${model}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    let api;
    try {
      api = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages,
          temperature: 0.35,
          max_tokens: 700
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    const rawText = await api.text();
    let raw = {};
    try { raw = JSON.parse(rawText); } catch {}

    if (!api.ok || raw.success === false) {
      console.error("Workers AI error", {
        status: api.status,
        response: rawText.slice(0, 2000)
      });
      return res.status(502).json({
        ok: false,
        error: `Cloudflare Workers AI respondeu HTTP ${api.status}`
      });
    }

    const result = raw?.result;
    const text = typeof result === "string"
      ? result
      : (result?.response || result?.text || "");

    const parsed = parseAnswer(text);
    const reply = String(parsed.reply || "").trim().slice(0, 5000);

    if (!reply) {
      console.error("Workers AI retornou resposta vazia", raw);
      return res.status(502).json({
        ok: false,
        error: "A IA retornou uma resposta vazia"
      });
    }

    return res.status(200).json({
      ok: true,
      reply,
      offerConsultant: parsed.offerConsultant === true
    });

  } catch (error) {
    console.error("api/chat", error);
    const timeout = error?.name === "AbortError";
    return res.status(timeout ? 504 : 500).json({
      ok: false,
      error: timeout ? "Tempo limite da IA excedido" : "Erro interno no agente"
    });
  }
};
