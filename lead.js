const nodemailer = require('nodemailer');

function safe(v, max = 5000) {
  return String(v ?? '').replace(/[<>]/g, '').slice(0, max);
}
function validEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim()); }
function transcriptFrom(history){
  if(!Array.isArray(history)) return safe(history || 'Histórico não informado.', 18000);
  return history.slice(-60).map((m,i)=>{
    const role = safe(m?.role || m?.sender || 'mensagem', 60);
    const content = safe(m?.content || m?.text || m?.message || '', 1800);
    return `${i+1}. ${role === 'user' ? 'Cliente' : role === 'assistant' ? 'Agente' : role}: ${content}`;
  }).filter(Boolean).join('\n');
}

module.exports = async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method !== 'POST') return res.status(405).json({ok:false,error:'Método não permitido'});

  try{
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const name = safe(b.name,160).trim();
    const phone = safe(b.phone,80).trim();
    const email = safe(b.email,320).trim();
    const subject = safe(b.subject || 'Atendimento pelo site',300);
    const page = safe(b.page || '',500);

    if(name.split(/\s+/).length < 2 || phone.replace(/\D/g,'').length < 10 || !validEmail(email)){
      return res.status(400).json({ok:false,error:'Confira nome completo, telefone e e-mail.'});
    }

    const gmailUser = process.env.GMAIL_USER;
    const gmailAppPassword = String(process.env.GMAIL_APP_PASSWORD || '').replace(/\s/g,'');
    const to = process.env.LEAD_TO || gmailUser || 'inklysolutions@gmail.com';
    if(!gmailUser || !gmailAppPassword){
      console.error('Gmail SMTP não configurado: GMAIL_USER/GMAIL_APP_PASSWORD ausentes.');
      return res.status(503).json({ok:false,error:'Serviço de recebimento do formulário ainda não está configurado.'});
    }

    const transcript = transcriptFrom(b.history);
    const text = `NOVO CONTATO — AGENTE INKLY\n\nNome: ${name}\nTelefone / WhatsApp: ${phone}\nE-mail: ${email}\nAssunto/Interesse: ${subject}\nPágina: ${page}\nData: ${new Date().toISOString()}\n\nCONTEXTO DA CONVERSA\n${transcript}\n\nO cliente solicitou contato de um consultor da Inkly Solutions.`;

    const transporter = nodemailer.createTransport({
      service:'gmail',
      auth:{ user:gmailUser, pass:gmailAppPassword }
    });

    const info = await transporter.sendMail({
      from:`Inkly Solutions - Agente <${gmailUser}>`,
      to,
      replyTo:email,
      subject:`Novo contato pelo site | ${name}`,
      text
    });

    return res.status(200).json({ok:true,id:info.messageId,provider:'gmail-smtp'});
  }catch(e){
    console.error('lead-email', e);
    return res.status(500).json({ok:false,error:'Não foi possível enviar o contato. Tente novamente.'});
  }
};
