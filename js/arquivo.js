// Arquivo de XMLs das notas no IndexedDB do navegador (cabe muito mais que o localStorage).
const NOME = 'mddb-xml';
let conexao;

function abrir() {
  return (conexao ||= new Promise((ok, erro) => {
    const r = indexedDB.open(NOME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('xml');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => erro(r.error);
  }));
}
async function tx(modo, fn) {
  const db = await abrir();
  return new Promise((ok, erro) => {
    const t = db.transaction('xml', modo);
    const req = fn(t.objectStore('xml'));
    t.oncomplete = () => ok(req?.result);
    t.onerror = () => erro(t.error);
  });
}
export const guardarXml = (chave, xml) => tx('readwrite', (s) => s.put(xml, chave));
export const lerXmlGuardado = (chave) => tx('readonly', (s) => s.get(chave));
export const apagarXml = (chave) => tx('readwrite', (s) => s.delete(chave));

// Gera um .zip (sem compressão) com vários arquivos de texto.
const TABELA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = TABELA[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function criarZip(arquivos) {
  const enc = new TextEncoder();
  const partes = [];
  const central = [];
  let pos = 0;
  for (const a of arquivos) {
    const nome = enc.encode(a.nome);
    const dados = enc.encode(a.texto);
    const crc = crc32(dados);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x0800, true); // nomes em UTF-8
    h.setUint16(12, 0x21, true); // data: 01/01/1980
    h.setUint32(14, crc, true);
    h.setUint32(18, dados.length, true);
    h.setUint32(22, dados.length, true);
    h.setUint16(26, nome.length, true);
    partes.push(new Uint8Array(h.buffer), nome, dados);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(14, 0x21, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, dados.length, true);
    c.setUint32(24, dados.length, true);
    c.setUint16(28, nome.length, true);
    c.setUint32(42, pos, true);
    central.push(new Uint8Array(c.buffer), nome);
    pos += 30 + nome.length + dados.length;
  }
  const tam = central.reduce((s, x) => s + x.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tam, true);
  fim.setUint32(16, pos, true);
  return new Blob([...partes, ...central, new Uint8Array(fim.buffer)], { type: 'application/zip' });
}
