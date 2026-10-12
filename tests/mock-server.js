// Server uji: menyajikan berkas aplikasi + endpoint /api yang menjalankan Code.gs asli di atas shim.
const http=require('http'), fs=require('fs'), path=require('path');
const { buatKonteks } = require('./gas-shim');
const ROOT = process.argv[2]; const PORT = +process.argv[3]||8787;
const gas = buatKonteks(); gas.setup(); gas.isiContoh();
const tipe={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json'};
http.createServer((req,res)=>{
  if(req.url.startsWith('/api')){
    res.setHeader('Access-Control-Allow-Origin','*');
    if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
    let b=''; req.on('data',c=>b+=c); req.on('end',()=>{
      if(global.OFFLINE){ req.socket.destroy(); return; }
      const out = req.method==='POST' ? gas.doPost({postData:{contents:b}}) : gas.doGet({});
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(out.isi);
    }); return;
  }
  if(req.url==='/__tambah'){ let b=''; req.on('data',c=>b+=c); req.on('end',()=>{ const o=JSON.parse(b); gas._ss.getSheetByName(o.sheet).appendRow(o.row); res.end('ok'); }); return; }
  if(req.url==='/__dump'){ res.writeHead(200,{'Content-Type':'application/json'}); return res.end(JSON.stringify(gas._ss.sheets.map(s=>({n:s.name,d:s.data})))); }
  let p = decodeURIComponent(req.url.split('?')[0]); if(p.endsWith('/')) p+='index.html';
  const f=path.join(ROOT,p);
  fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);return res.end('404');} res.writeHead(200,{'Content-Type':tipe[path.extname(f)]||'application/octet-stream'}); res.end(d); });
}).listen(PORT,()=>console.log('mock on',PORT));
