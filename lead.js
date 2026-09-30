function safe(v,max=5000){return String(v??'').replace(/[<>]/g,'').slice(0,max)}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST') return res.status(405).json({ok:false,error:'Método não permitido'});
 try{
  const b=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
  const {name,phone,email,subject,history,page}=b;
  if(!name||!phone||!email) return res.status(400).json({ok:false,error:'Nome, telefone e e-mail são obrigatórios.'});
  const key=process.env.RESEND_API_KEY, to=process.env.LEAD_TO||'inklysolutions@gmail.com';
  if(!key) return res.status(503).json({ok:false,error:'Serviço de e-mail não configurado.'});
  const transcript=Array.isArray(history)?history.map((m,i)=>`${i+1}. ${safe(m?.role||m?.sender||'mensagem',60)}: ${safe(m?.content||m?.text||m?.message||JSON.stringify(m),1500)}`).join('\n'):safe(history||'Histórico não informado.',12000);
  const er=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},body:JSON.stringify({
    from:process.env.LEAD_FROM||'Agente Inkly <onboarding@resend.dev>',to:[to],reply_to:email,subject:`Novo contato pelo site | ${safe(name,120)}`,
    text:`NOVO CONTATO — AGENTE INKLY\n\nNome: ${safe(name,160)}\nTelefone / WhatsApp: ${safe(phone,80)}\nE-mail: ${safe(email,320)}\nAssunto/Interesse: ${safe(subject||'Atendimento pelo site',300)}\nPágina: ${safe(page||'',500)}\n\nCONTEXTO DA CONVERSA\n${transcript}\n\nO cliente solicitou contato de um consultor da Inkly Solutions.`
  })});
  const out=await er.json().catch(()=>({}));
  if(!er.ok){console.error('Resend',out);return res.status(502).json({ok:false,error:'Não foi possível enviar o contato.'});}
  return res.status(200).json({ok:true,id:out.id});
 }catch(e){console.error('lead',e);return res.status(500).json({ok:false,error:'Não foi possível enviar o contato.'});}
};