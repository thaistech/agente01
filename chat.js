const SYSTEM = `Você é o Agente Virtual da Inkly Solutions. Atenda em português do Brasil, de forma humana, objetiva, consultiva e cordial.

ESCOPO DA INKLY SOLUTIONS:
- Sites, landing pages e experiências web.
- Sistemas e ferramentas digitais sob medida.
- Aplicativos mobile, Android, PWA e soluções para uso em celular. Nunca presuma que app significa PWA: descubra a necessidade.
- APIs e conexão entre sistemas.
- Automação de processos e integrações.
- Dados, dashboards, indicadores e soluções de BI.
- Formulários, checklists, controles, avaliações e ferramentas para processos/rotinas.
- Gamificação, jogos corporativos, simulações e experiências interativas.

REGRAS:
1. Não invente preços, prazos, condições comerciais, cases, tecnologias contratadas ou capacidades que não estejam no contexto.
2. Faça perguntas úteis para entender objetivo, usuário, processo atual, problema e resultado esperado. Não transforme toda conversa em interrogatório.
3. Responda à mensagem aberta do cliente mesmo quando ele não clicar em menus.
4. Se o cliente pedir preço, orçamento, proposta, prazo comercial, contratação, algo fora do conhecimento disponível, ou demonstrar intenção clara de avançar, explique brevemente e ofereça falar com um consultor.
5. Quando não souber algo, não diga apenas que não sabe: diga que um consultor pode analisar o caso e ofereça as duas opções: falar com consultor ou continuar pelo chat.
6. Não diga "atendimento humano". Use sempre "um de nossos consultores".
7. Não peça nome, telefone e e-mail no texto: a interface fará isso quando o cliente escolher falar com consultor.
8. Não diga que transferiu ou enviou dados antes da confirmação do formulário.
9. Não limite a conversa a PWA. Diferencie site, sistema, app Android/mobile, PWA, API, automação, dados/dashboard, ferramenta e gamificação conforme a necessidade.
10. Evite repetir perguntas que já foram respondidas no histórico.

Responda SOMENTE em JSON válido no formato: {"reply":"texto ao cliente","offerConsultant":false}. offerConsultant deve ser true quando for apropriado exibir os botões "Falar com um consultor" e "Continuar atendimento".`;

module.exports = async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'Método não permitido'});
  try{
    const key=process.env.OPENAI_API_KEY;
    if(!key) return res.status(503).json({ok:false,error:'IA não configurada'});
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const message=String(body.message||'').trim().slice(0,4000);
    if(!message) return res.status(400).json({ok:false,error:'Mensagem vazia'});
    const history=Array.isArray(body.history)?body.history.slice(-18).map(x=>({role:x.role==='assistant'?'assistant':'user',content:String(x.content||'').slice(0,3000)})):[];
    const input=[...history,{role:'user',content:message}];
    const api=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
      body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-5-mini',instructions:SYSTEM,input,temperature:0.4,max_output_tokens:500})
    });
    const raw=await api.json();
    if(!api.ok){console.error('OpenAI',raw);return res.status(502).json({ok:false,error:'Falha no provedor de IA'});}
    let text=raw.output_text||'';
    if(!text && Array.isArray(raw.output)) for(const item of raw.output) for(const c of (item.content||[])) if(c.type==='output_text') text+=c.text||'';
    text=text.trim().replace(/^```json\s*/i,'').replace(/\s*```$/,'');
    let parsed; try{parsed=JSON.parse(text)}catch{parsed={reply:text||'Posso te ajudar a entender melhor essa necessidade.',offerConsultant:false}}
    return res.status(200).json({ok:true,reply:String(parsed.reply||'').slice(0,5000),offerConsultant:!!parsed.offerConsultant});
  }catch(e){console.error('chat',e);return res.status(500).json({ok:false,error:'Erro no agente'});}
};