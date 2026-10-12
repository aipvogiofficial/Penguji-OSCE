const assert=require('assert');
const { buatKonteks } = require('./gas-shim');
const Rekap = require('../js/rekap.js');
const g = buatKonteks(); g.setup(); g.setup(); g.isiContoh(); g.isiContoh(); // idempoten
const sh = n => g._ss.getSheetByName(n);
assert.strictEqual(sh('PAKET').getLastRow(), 3, 'paket 2 baris');
assert.strictEqual(sh('STATION').getLastRow()-1, 17, 'station 8+9');
assert.strictEqual(sh('RUBRIK').getLastRow()-1, 20+29, 'rubrik butir');
assert.strictEqual(sh('PESERTA').getLastRow()-1, 20);
// login salah
assert.strictEqual(g.post({aksi:'login',pin:'0000'}).ok,false);
// login penguji D3 st1
let L = g.post({aksi:'login',pin:'3101'});
assert(L.ok, L.pesan); assert.strictEqual(L.station.no,1); assert.strictEqual(L.rubrik.length,4); assert.strictEqual(L.peserta.length,10);
assert.strictEqual(L.station.waktu,10);
// login station istirahat tidak ada PIN; S.Tr st8 PM 5 butir
let L8 = g.post({aksi:'login',pin:'4108'}); assert.strictEqual(L8.rubrik.length,5); assert.strictEqual(L8.station.waktu,12);
// simpan
let r = g.post({aksi:'simpan',pin:'3101',records:[{idKlien:'a1',periode:'UJICOBA-D3',station:1,nim:'D3001',skor:[3,2,1,3],gr:3}]});
assert.strictEqual(r.hasil[0].status,'ok');
// kirim ulang sama -> duplikat
r = g.post({aksi:'simpan',pin:'3101',records:[{idKlien:'a1',periode:'UJICOBA-D3',station:1,nim:'D3001',skor:[3,2,1,3],gr:3}]});
assert.strictEqual(r.hasil[0].status,'duplikat');
// id lain -> konflik
r = g.post({aksi:'simpan',pin:'3101',records:[{idKlien:'a2',periode:'UJICOBA-D3',station:1,nim:'D3001',skor:[0,0,0,0],gr:1}]});
assert.strictEqual(r.hasil[0].status,'konflik');
// station lain -> ditolak
r = g.post({aksi:'simpan',pin:'3101',records:[{idKlien:'a3',periode:'UJICOBA-D3',station:2,nim:'D3002',skor:[1,1,1],gr:2}]});
assert.strictEqual(r.hasil[0].status,'ditolak');
// skor salah jumlah / nilai
r = g.post({aksi:'simpan',pin:'3101',records:[{idKlien:'a4',periode:'UJICOBA-D3',station:1,nim:'D3002',skor:[1,1,1],gr:2},{idKlien:'a5',periode:'UJICOBA-D3',station:1,nim:'D3002',skor:[1,1,1,5],gr:2},{idKlien:'a6',periode:'UJICOBA-D3',station:1,nim:'XX',skor:[1,1,1,1],gr:2}]});
assert.deepStrictEqual(r.hasil.map(h=>h.status),['ditolak','ditolak','ditolak']);
// paket terkunci
assert.strictEqual(g.baca_('PAKET').find(p=>p['Kode Paket']==='D3-STANDAR')['Terkunci'],'YA');
// admin: isi semua nilai D3 acak tapi berkorelasi
const pinSt={1:'3101',2:'3102',3:'3103',5:'3105',6:'3106',7:'3107'};
const nb={1:4,2:3,3:3,5:3,6:3,7:4};
for(const st of [1,2,3,5,6,7]){
  const recs=[];
  for(let i=1;i<=10;i++){ if(st===1&&i===1) continue; const kem=i%4+1; const sk=Array(nb[st]).fill(0).map((_,j)=>Math.min(3,Math.max(0,kem-1+((i+j)%2)))); recs.push({idKlien:'x'+st+'-'+i,periode:'UJICOBA-D3',station:st,nim:'D3'+('00'+i).slice(-3),skor:sk,gr:kem}); }
  const rr=g.post({aksi:'simpan',pin:pinSt[st],records:recs}); assert(rr.hasil.every(h=>h.status==='ok'), JSON.stringify(rr.hasil.filter(h=>h.status!=='ok')));
}
// admin timpa eksplisit
r = g.post({aksi:'simpan',pin:'909090',records:[{idKlien:'adm1',periode:'UJICOBA-D3',station:1,nim:'D3001',skor:[3,3,3,3],gr:4,penguji:'Koreksi'}]});
assert.strictEqual(r.hasil[0].status,'konflik','admin tanpa timpa tidak menimpa');
r = g.post({aksi:'simpan',pin:'909090',timpa:true,records:[{idKlien:'adm1',periode:'UJICOBA-D3',station:1,nim:'D3001',skor:[3,3,3,3],gr:4,penguji:'Koreksi'}]});
assert.strictEqual(r.hasil[0].status,'ok');
// penguji biasa tidak bisa dataAdmin
assert.strictEqual(g.post({aksi:'dataAdmin',pin:'3101',periode:'UJICOBA-D3'}).ok,false);
const A = g.post({aksi:'dataAdmin',pin:'909090',periode:'UJICOBA-D3'});
assert(A.ok); assert.strictEqual(A.nilai.length,60); assert.strictEqual(A.station.length,8);
assert(A.nilai[0].waktuTerima.length>=16,'waktu ada jam');
const H = Rekap.hitung(A,{minPeserta:10});
assert.strictEqual(H.stations.length,6); assert.strictEqual(H.progres.terisi,60); assert.strictEqual(H.progres.total,60);
H.stations.forEach(s=>console.log('St',s.station.no,'maks',s.maks,'n',s.info.n,'NBL',s.nbl,s.info.metode,s.info.ket));
console.log(H.peserta.map(p=>p.peserta.nim+':'+p.status+(p.gagal.length?'('+p.gagal+')':'')).join('  '));
// cek regresi manual
const reg=Rekap.regresi([1,2,3,4],[2,4,6,8]); assert(Math.abs(reg.b-2)<1e-9 && Math.abs(reg.a)<1e-9 && Math.abs(reg.r2-1)<1e-9);
// cadangan: periode STR tanpa nilai
const B=g.post({aksi:'dataAdmin',pin:'909090',periode:'UJICOBA-STR'}); const HB=Rekap.hitung(B,{minPeserta:10});
assert.strictEqual(HB.stations.length,7); assert.strictEqual(HB.stations[6].maks,30); assert.strictEqual(HB.stations[6].nbl,18);
assert(HB.peserta.every(p=>p.status==='BELUM LENGKAP'));
// Excel
const XLSX=require('../vendor/xlsx.full.min.js');
const wb=Rekap.buatWorkbook(XLSX,A,H,{minPeserta:10}); console.log('sheets:',wb.SheetNames.join(' | '));
require('fs').writeFileSync(process.argv[2]||'/tmp/rekap-uji.xlsx', XLSX.write(wb,{type:'buffer',bookType:'xlsx'}));
console.log('SEMUA UJI BACKEND LULUS');
// --- impor paket
const st=[1,2,3,4,5,6,7,8].map(n=>({no:n,judul:'J'+n,kasus:'K'+n,istirahat:n===4||n===8,waktu:10}));
let ip=g.post({aksi:'imporPaket',pin:'3101',kode:'X',program:'D3',station:st,rubrik:[]}); assert.strictEqual(ip.ok,false);
ip=g.post({aksi:'imporPaket',pin:'909090',kode:'d3-x',program:'D3',basis:'D3-STANDAR',salinStation:[1,3,5,6,7],station:st,
  rubrik:[{station:2,butir:1,kompetensi:'A',s0:'a',s1:'b',s2:'c',s3:'d',bobot:2}]});
assert(ip.ok, ip.pesan); assert.strictEqual(ip.kode,'D3-X'); assert.strictEqual(ip.jumlahButir,1+4+3+3+3+4);
assert.strictEqual(g.post({aksi:'imporPaket',pin:'909090',kode:'D3-X',program:'D3',station:st,rubrik:[]}).ok,false,'kode ganda ditolak');
assert.strictEqual(g.post({aksi:'imporPaket',pin:'909090',kode:'D3-Y',program:'D3',station:st,salinStation:[],rubrik:[{station:2,butir:1,kompetensi:'A',s0:'a',s1:'b',s2:'c',s3:'d',bobot:2}]}).ok,false,'station kosong ditolak');
assert.strictEqual(g.post({aksi:'imporPaket',pin:'909090',kode:'D3-Z',program:'D3',station:st,salinStation:[1,3,5,6,7],basis:'D3-STANDAR',rubrik:[{station:2,butir:1,kompetensi:'A',s0:'a',s1:'b',s2:'c',s3:'d',bobot:5}]}).ok,false,'bobot salah ditolak');
assert.strictEqual(g.baca_('PAKET').filter(p=>/^D3-[YZ]$/.test(p['Kode Paket'])).length,0,'tidak ada paket setengah jadi');
console.log('UJI IMPOR PAKET LULUS');
