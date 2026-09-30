const nodemailer = require("nodemailer");

function safe(value, max = 5000) {
  return String(value ?? "").replace(/[<>]/g, "").slice(0, max);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function transcriptFrom(history) {
  if (!Array.isArray(history)) {
    return safe(history || "Histórico não informado.", 18000);
  }

  return history.slice(-60).map((m, i) => {
    const role = safe(m?.role || m?.sender || "mensagem", 60);
    const content = safe(
      m?.content || m?.text || m?.message || "",
      1800
    );
    const who =
      role === "user" ? "Cliente" :
      role === "assistant" ? "Agente" :
      role;
    return `${i + 1}. ${who}: ${content}`;
  }).filter(Boolean).join("\n");
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Método não permitido" });
  }

  try {
    const body = typeof req.body === "string"
      ? JSON.parse(req.body || "{}")
      : (req.body || {});

    const name = safe(body.name, 160).trim();
    const phone = safe(body.phone, 80).trim();
    const email = safe(body.email, 320).trim();
    const subject = safe(body.subject || "Atendimento pelo site", 300);
    const page = safe(body.page || "", 500);

    if (
      name.split(/\s+/).length < 2 ||
      phone.replace(/\D/g, "").length < 10 ||
      !validEmail(email)
    ) {
      return res.status(400).json({
        ok: false,
        error: "Confira nome completo, telefone e e-mail."
      });
    }

    const gmailUser = String(process.env.GMAIL_USER || "").trim();
    const gmailAppPassword = String(
      process.env.GMAIL_APP_PASSWORD || ""
    ).replace(/\s/g, "");
    const to = String(
      process.env.LEAD_TO || "inklysolutions@gmail.com"
    ).trim();

    if (!gmailUser || !gmailAppPassword) {
      console.error("Gmail não configurado", {
        hasGmailUser: !!gmailUser,
        hasAppPassword: !!gmailAppPassword,
        hasLeadTo: !!to
      });
      return res.status(503).json({
        ok: false,
        error: "E-mail não configurado no servidor"
      });
    }

    const transcript = transcriptFrom(body.history);

    const text =
`NOVO CONTATO — AGENTE INKLY

Nome: ${name}
Telefone / WhatsApp: ${phone}
E-mail: ${email}
Assunto/Interesse: ${subject}
Página: ${page}
Data: ${new Date().toISOString()}

CONTEXTO DA CONVERSA
${transcript}

O cliente solicitou contato de um consultor da Inkly Solutions.`;

    // Configuração SMTP explícita do Gmail.
    // Evita depender da autodetecção do Nodemailer.
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: gmailUser,
        pass: gmailAppPassword
      },
      connectionTimeout: 12000,
      greetingTimeout: 12000,
      socketTimeout: 20000
    });

    // Testa autenticação antes do envio; o erro fica visível nos Logs da Vercel.
    await transporter.verify();

    const info = await transporter.sendMail({
      from: `"Inkly Solutions - Agente" <${gmailUser}>`,
      to,
      replyTo: email,
      subject: `Novo contato pelo site | ${name}`,
      text
    });

    console.log("Lead enviado", {
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected
    });

    return res.status(200).json({
      ok: true,
      provider: "gmail-smtp",
      id: info.messageId
    });

  } catch (error) {
    console.error("api/lead", {
      name: error?.name,
      code: error?.code,
      command: error?.command,
      responseCode: error?.responseCode,
      response: error?.response,
      message: error?.message
    });

    return res.status(500).json({
      ok: false,
      error: "Não foi possível enviar o contato. Tente novamente."
    });
  }
};
