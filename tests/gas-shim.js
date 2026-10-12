// Simulasi minimal lingkungan Google Apps Script (SpreadsheetApp dsb.) untuk menguji Code.gs secara lokal.
const fs = require('fs'), vm = require('vm'), path = require('path');
function pad2(n){return ('0'+n).slice(-2);}
class Range {
  constructor(sh, r, c, nr, nc){ Object.assign(this,{sh,r,c,nr:nr||1,nc:nc||1}); }
  getValues(){ const out=[]; for(let i=0;i<this.nr;i++){ const row=[]; for(let j=0;j<this.nc;j++){ const v=(this.sh.data[this.r-1+i]||[])[this.c-1+j]; row.push(v===undefined?'':v);} out.push(row);} return out; }
  setValues(vals){ vals.forEach((row,i)=>row.forEach((v,j)=>this.sh.set(this.r+i,this.c+j,v))); return this; }
  setValue(v){ this.sh.set(this.r,this.c,v); return this; }
}
['setFontWeight','setBackground','setFontColor','setNumberFormat','setWrap','setVerticalAlignment'].forEach(m=>Range.prototype[m]=function(){return this;});
class Sheet {
  constructor(name){ this.name=name; this.data=[]; }
  set(r,c,v){ while(this.data.length<r) this.data.push([]); const row=this.data[r-1]; while(row.length<c) row.push(''); row[c-1]=v; }
  getLastRow(){ let n=this.data.length; while(n>0 && this.data[n-1].every(v=>v===''||v===undefined)) n--; return n; }
  getLastColumn(){ return this.data.reduce((m,r)=>Math.max(m,r.length),0); }
  getMaxRows(){ return 1000; }
  getRange(r,c,nr,nc){ return new Range(this,r,c,nr,nc); }
  getDataRange(){ return new Range(this,1,1,Math.max(this.getLastRow(),1),Math.max(this.getLastColumn(),1)); }
  appendRow(arr){ const r=this.getLastRow()+1; arr.forEach((v,j)=>this.set(r,j+1,v)); }
  setFrozenRows(){} setColumnWidth(){}
}
class Spreadsheet {
  constructor(){ this.sheets=[new Sheet('Sheet1')]; }
  getSheetByName(n){ return this.sheets.find(s=>s.name===n)||null; }
  insertSheet(n){ const s=new Sheet(n); this.sheets.push(s); return s; }
  getSheets(){ return this.sheets; }
  deleteSheet(s){ this.sheets=this.sheets.filter(x=>x!==s); }
}
function buatKonteks(){
  const ss = new Spreadsheet();
  const ctx = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: ()=>ss, getUi: ()=>{ throw new Error('no ui'); } },
    ContentService: { MimeType:{JSON:'json'}, createTextOutput: s=>({ isi:s, setMimeType(){return this;} }) },
    LockService: { getScriptLock: ()=>({ waitLock(){}, releaseLock(){} }) },
    Utilities: { formatDate: (d,tz,f)=>{ const s=d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); return f.indexOf('HH')>=0 ? s+' '+pad2(d.getHours())+':'+pad2(d.getMinutes())+':'+pad2(d.getSeconds()) : s; } },
    Session: { getScriptTimeZone: ()=>'Asia/Makassar', getActiveUser: ()=>({ getEmail: ()=>'uji@lokal' }) }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','apps-script','Code.gs'),'utf8'), ctx);
  ctx._ss = ss;
  ctx.post = (obj)=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(obj)}}).isi);
  return ctx;
}
module.exports = { buatKonteks };
