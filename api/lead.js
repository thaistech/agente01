const nodemailer = require("nodemailer");

function safe(v, max=5000) {
  return String(v ?? "").replace(/[<>]/g, "").slice(0, max);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok:false, error:"Método não permitido" });
  }
  try {
    const { name, phone, email, subject, history, page } = req.body || {};
    if (!name || !phone || !email) {
      return res.status(400).json({ ok:false, error:"Nome, telefone e e-mail são obrigatórios." });
    }

    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    const to = process.env.LEAD_TO || "inklysolutions@gmail.com";
    if (!user || !pass) {
      console.error("Variáveis GMAIL_USER/GMAIL_APP_PASSWORD ausentes.");
      return res.status(503).json({ ok:false, error:"Serviço de e-mail não configurado." });
    }

    const transcript = Array.isArray(history)
      ? history.map((m,i) => {
          if (typeof m === "string") return `${i+1}. ${safe(m,1500)}`;
          const who = safe(m?.role || m?.sender || m?.type || "mensagem", 80);
          const txt = safe(m?.text || m?.message || m?.content || JSON.stringify(m), 1500);
          return `${i+1}. ${who}: ${txt}`;
        }).join("\n")
      : safe(history || "Histórico não informado.", 12000);

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass }
    });

    await transporter.sendMail({
      from: `"Agente Inkly" <${user}>`,
      to,
      replyTo: safe(email,320),
      subject: `Novo contato pelo site | ${safe(name,120)}`,
      text:
`NOVO CONTATO — AGENTE INKLY

Nome: ${safe(name,160)}
Telefone / WhatsApp: ${safe(phone,80)}
E-mail: ${safe(email,320)}
Assunto/Interesse: ${safe(subject || "Atendimento pelo site",300)}
Página: ${safe(page || "",500)}

CONTEXTO DA CONVERSA
${transcript}

O cliente solicitou contato de um consultor da Inkly Solutions.`
    });

    return res.status(200).json({ ok:true });
  } catch (err) {
    console.error("Erro ao enviar lead:", err);
    return res.status(500).json({ ok:false, error:"Não foi possível enviar o contato." });
  }
};
