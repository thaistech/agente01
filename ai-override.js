(() => {
  "use strict";
  const history = [];
  let busy = false;
  const $ = s => document.querySelector(s);
  const messagesEl = () => $(".messages");
  const inputEl = () => $(".compose input");
  const sendEl = () => $(".compose .send, .send");
  const textOf = el => (el?.textContent || "").replace(/\s+/g," ").trim();
  function seedHistory(){ if(history.length) return; const box=messagesEl(); if(!box)return; box.querySelectorAll(".bubble,.me").forEach(el=>{const content=textOf(el);if(content)history.push({role:el.classList.contains("me")?"user":"assistant",content});}); }
  function scrollBottom(){const box=messagesEl();if(box)box.scrollTop=box.scrollHeight;}
  function addUser(text){const box=messagesEl();if(!box)return;const el=document.createElement("div");el.className="me";el.textContent=text;box.appendChild(el);scrollBottom();}
  function addAssistant(text){const box=messagesEl();if(!box)return;const row=document.createElement("div");row.className="row inkly-ai-generated";const avatar=box.querySelector(".mini");if(avatar)row.appendChild(avatar.cloneNode(true));const bubble=document.createElement("div");bubble.className="bubble";bubble.textContent=text;row.appendChild(bubble);box.appendChild(row);scrollBottom();}
  function setBusy(v){busy=v;const i=inputEl(),s=sendEl();if(i)i.disabled=v;if(s)s.disabled=v;}
  function showConsultant(){const box=messagesEl();if(!box)return;const wrap=document.createElement("div");wrap.className="quick inkly-ai-consultant";const b=document.createElement("button");b.type="button";b.textContent="Falar com um consultor";b.onclick=()=>{const original=[...document.querySelectorAll("button")].find(x=>x!==b&&/falar com (um )?consultor|consultor/i.test(textOf(x)));if(original)original.click();};wrap.appendChild(b);box.appendChild(wrap);scrollBottom();}
  async function sendToAI(text){if(busy)return;text=String(text||"").trim();if(!text)return;seedHistory();addUser(text);const previous=history.slice(-24);history.push({role:"user",content:text});const input=inputEl();if(input)input.value="";setBusy(true);try{const response=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({message:text,history:previous})});const data=await response.json().catch(()=>({}));if(!response.ok||!data.ok||!data.reply)throw new Error(data.error||`HTTP ${response.status}`);addAssistant(data.reply);history.push({role:"assistant",content:data.reply});document.documentElement.dataset.inklyAi=data.source||"cloudflare-workers-ai";document.documentElement.dataset.inklyAiModel=data.model||"";if(data.offerConsultant===true)showConsultant();}catch(err){console.error("INKLY_AI_FRONTEND",err);addAssistant("Não consegui acessar a IA agora. "+(err?.message||"Erro desconhecido"));}finally{setBusy(false);inputEl()?.focus();}}
  document.addEventListener("click",e=>{const send=e.target.closest?.(".compose .send, .send");if(!send)return;const input=inputEl();if(!input||!input.value.trim())return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();sendToAI(input.value);},true);
  document.addEventListener("keydown",e=>{const input=inputEl();if(!input||e.target!==input||e.key!=="Enter"||e.shiftKey||!input.value.trim())return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();sendToAI(input.value);},true);
  window.INKLY_AI_REAL={version:"passo1-2026-09-30",provider:"cloudflare-workers-ai",send:sendToAI,getHistory:()=>history.slice()};
  console.info("INKLY_AI_REAL carregado — mensagens livres usam /api/chat");
})();
