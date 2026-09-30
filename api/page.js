const fs = require("fs");
const path = require("path");
module.exports = function handler(req,res){
  try{
    let html=fs.readFileSync(path.join(process.cwd(),"index.html"),"utf8");
    const tag='<script src="/ai-override.js?v=passo1-20260930"></script>';
    if(!html.includes(tag)) html=/<\/body>/i.test(html)?html.replace(/<\/body>/i,`${tag}\n</body>`):html+`\n${tag}`;
    res.setHeader("Content-Type","text/html; charset=utf-8");
    res.setHeader("Cache-Control","no-store, no-cache, must-revalidate");
    return res.status(200).send(html);
  }catch(err){console.error("INKLY_PAGE",err);return res.status(500).send("Erro ao carregar o agente.");}
};
