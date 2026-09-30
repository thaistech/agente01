const SYSTEM = `Você é o Agente Virtual inteligente da Inkly Solutions. Atenda em português do Brasil, com linguagem natural, humana, consultiva, objetiva e cordial.

SOBRE A INKLY SOLUTIONS — SOLUÇÕES DIGITAIS:
- Sites, landing pages e experiências web.
- Sistemas e ferramentas digitais sob medida.
- Aplicativos mobile, Android e PWA.
- APIs, integrações e conexão entre sistemas.
- Automação de processos e tarefas repetitivas.
- Dados, dashboards, indicadores e BI.
- Formulários, checklists, controles, avaliações e ferramentas digitais.
- Gamificação, jogos corporativos, simulações e experiências interativas.

REGRAS:
1. Responda ao que o visitante realmente escreveu. Não siga árvore fixa de diálogo.
2. Use o histórico recebido para manter contexto e não repetir perguntas.
3. Faça no máximo uma pergunta por vez quando precisar entender melhor a necessidade.
4. Não invente preços, prazos, cases, tecnologias contratadas ou garantias.
5. Quando houver intenção clara de orçamento, proposta, contratação ou análise específica, ofereça falar com um de nossos consultores.
6. Nunca diga "atendimento humano"; diga "um de nossos consultores".
7. Não peça nome, telefone ou e-mail na conversa; a interface possui formulário próprio.
8. Seja conciso, normalmente 1 a 3 parágrafos curtos.
9. Se não souber algo específico da empresa, diga que precisa de mais contexto; não invente.
10. Diferencie site, sistema, aplicativo, PWA, API, automação, dados/BI, ferramenta digital e gamificação.

Responda SOMENTE JSON válido, sem markdown, neste formato: {"reply":"texto para o visitante","offerConsultant":false}. Use offerConsultant=true apenas quando houver motivo real para oferecer o consultor.`;

function cleanHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-24).map((m) => ({ role: m && m.role === "assistant" ? "assistant" : "user", content: String(m?.content || "").trim().slice(0, 3000) })).filter(m => m.content);
}
function parseModelText(text) {
  const clean = String(text || "").trim().replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
  try { return JSON.parse(clean); } catch {}
  const match = clean.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
  return { reply: clean, offerConsultant: false };
}
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "GET") return res.status(200).json({ ok:true, service:"inkly-ai", provider:"cloudflare-workers-ai", configured:Boolean(process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN) });
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"Método não permitido" });
  try {
    const accountId = String(process.env.CF_ACCOUNT_ID || "").trim();
    const token = String(process.env.CF_API_TOKEN || "").trim();
    const model = String(process.env.CF_AI_MODEL || "@cf/zai-org/glm-4.7-flash").trim();
    if (!accountId || !token) return res.status(503).json({ ok:false, error:"IA não configurada no servidor", code:"AI_NOT_CONFIGURED" });
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const message = String(body.message || "").trim().slice(0, 5000);
    if (!message) return res.status(400).json({ ok:false, error:"Mensagem vazia" });
    const history = cleanHistory(body.history);
    const last = history[history.length - 1];
    const normalizedHistory = last?.role === "user" && last?.content === message ? history.slice(0, -1) : history;
    const messages = [{ role:"system", content:SYSTEM }, ...normalizedHistory, { role:"user", content:message }];
    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    let response;
    try {
      response = await fetch(url, { method:"POST", headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json"}, body:JSON.stringify({messages,temperature:0.45,max_tokens:800}), signal:controller.signal });
    } finally { clearTimeout(timer); }
    const rawText = await response.text();
    let raw = null; try { raw = JSON.parse(rawText); } catch {}
    if (!response.ok || raw?.success === false) {
      console.error("INKLY_AI_CLOUDFLARE", {status:response.status, body:rawText.slice(0,1800)});
      return res.status(502).json({ok:false,error:`Falha na IA (Cloudflare HTTP ${response.status})`,code:"AI_PROVIDER_ERROR"});
    }
    const modelText = typeof raw?.result === "string" ? raw.result : raw?.result?.response ?? raw?.result?.text ?? raw?.result?.output_text ?? "";
    const parsed = parseModelText(modelText);
    const reply = String(parsed?.reply || "").trim().slice(0,6000);
    if (!reply) return res.status(502).json({ok:false,error:"A IA retornou resposta vazia",code:"AI_EMPTY"});
    return res.status(200).json({ok:true,source:"cloudflare-workers-ai",model,reply,offerConsultant:parsed?.offerConsultant===true});
  } catch (err) {
    console.error("INKLY_AI_EXCEPTION", {name:err?.name,message:err?.message});
    return res.status(err?.name === "AbortError" ? 504 : 500).json({ok:false,error:err?.name === "AbortError" ? "A IA demorou demais para responder" : "Erro interno da IA",code:err?.name === "AbortError" ? "AI_TIMEOUT" : "AI_INTERNAL"});
  }
};
