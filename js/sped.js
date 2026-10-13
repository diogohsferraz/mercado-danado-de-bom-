// SPED Fiscal: EFD ICMS/IPI gerada a partir dos XMLs das notas (NFC-e de venda e NF-e de compra)
// e do inventário registrado no app. Pensado para comércio varejista optante pelo Simples Nacional:
// o ICMS é recolhido no DAS, por isso bases e valores de ICMS ficam zerados e não há crédito nas entradas.
//
// O arquivo gerado deve ser validado no PVA da EFD ICMS/IPI (Receita Federal) antes da transmissão.

export const LEIAUTE_POR_ANO = { 2024: '018', 2025: '019', 2026: '020', 2027: '021' };

// Correspondência CSOSN (Simples) → CST (Tabela B) usada nos registros da EFD. Revise com o contador.
export const MAPA_CSOSN_PADRAO = { 101: '90', 102: '90', 103: '40', 201: '10', 202: '10', 203: '30', 300: '41', 400: '41', 500: '60', 900: '90' };

const so = (s) => String(s ?? '').replace(/\D/g, '');
const n2 = (v) => (Math.round((Number(v) || 0) * 100) / 100).toFixed(2).replace('.', ',');
const nd = (v, casas) => (Number(v) || 0).toFixed(casas).replace('.', ',');
const limpa = (s) => String(s ?? '').replace(/[|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
const dataEfd = (iso) => (iso ? iso.slice(8, 10) + iso.slice(5, 7) + iso.slice(0, 4) : '');
const arred = (v) => Math.round((Number(v) || 0) * 100) / 100;

export function cnpjValido(c) {
  c = so(c);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const dv = (n) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = pesos.reduce((a, p, i) => a + +c[i] * p, 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  return dv(12) === +c[12] && dv(13) === +c[13];
}

// ---------- Leitura dos XMLs ----------
const q = (el, tag) => (el ? el.getElementsByTagName(tag)[0] || null : null);
const t = (el, tag) => q(el, tag)?.textContent.trim() || '';
const v = (el, tag) => Number(t(el, tag)) || 0;
const filhos = (el) => (el ? [...el.childNodes].filter((x) => x.nodeType === 1) : []);

function endereco(el) {
  return { lgr: t(el, 'xLgr'), nro: t(el, 'nro'), cpl: t(el, 'xCpl'), bairro: t(el, 'xBairro'), cMun: t(el, 'cMun'), uf: t(el, 'UF'), cep: t(el, 'CEP') };
}

// Devolve { tipo: 'nfe' | 'cancelamento' | 'inutilizacao', ... } ou null se o arquivo não for reconhecido.
export function lerXml(texto, nome = '') {
  const doc = new DOMParser().parseFromString(texto, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return { tipo: 'erro', nome, motivo: 'XML inválido' };

  const ev = q(doc, 'infEvento');
  if (ev && t(ev, 'tpEvento') === '110111') {
    const ret = q(doc, 'retEvento');
    const cStat = t(ret || doc, 'cStat');
    if (ret && !['135', '136', '155'].includes(cStat)) return { tipo: 'ignorado', nome, motivo: `cancelamento não homologado (cStat ${cStat})` };
    return { tipo: 'cancelamento', nome, chave: t(ev, 'chNFe') };
  }
  const inut = q(doc, 'infInut');
  if (inut) {
    const ret = q(doc, 'retInutNFe');
    const info = q(ret, 'infInut') || inut;
    if (ret && t(info, 'cStat') !== '102') return { tipo: 'ignorado', nome, motivo: 'inutilização não homologada' };
    return { tipo: 'inutilizacao', nome, cnpj: t(inut, 'CNPJ'), modelo: t(inut, 'mod'), serie: t(inut, 'serie'), nIni: +t(inut, 'nNFIni'), nFin: +t(inut, 'nNFFin'), data: (t(info, 'dhRecbto') || '').slice(0, 10) };
  }

  const inf = q(doc, 'infNFe');
  if (!inf) return { tipo: 'ignorado', nome, motivo: 'não é NF-e/NFC-e' };
  const ide = q(inf, 'ide');
  const emit = q(inf, 'emit');
  const dest = q(inf, 'dest');
  const tot = q(q(inf, 'total'), 'ICMSTot');
  const prot = q(doc, 'infProt');
  const chave = t(prot, 'chNFe') || (inf.getAttribute('Id') || '').replace(/^NFe/, '');
  const itens = [...inf.getElementsByTagName('det')].map((det) => {
    const prod = q(det, 'prod');
    const icms = filhos(q(det, 'ICMS'))[0];
    const ipi = q(det, 'IPITrib');
    return {
      nItem: +det.getAttribute('nItem'),
      cProd: t(prod, 'cProd'),
      cEAN: /^\d{8,14}$/.test(t(prod, 'cEAN')) ? t(prod, 'cEAN') : '',
      xProd: t(prod, 'xProd'),
      ncm: t(prod, 'NCM'),
      cest: t(prod, 'CEST'),
      cfop: t(prod, 'CFOP'),
      uCom: t(prod, 'uCom').toUpperCase() || 'UN',
      qCom: v(prod, 'qCom'),
      vProd: v(prod, 'vProd'),
      vDesc: v(prod, 'vDesc'),
      vFrete: v(prod, 'vFrete'),
      vSeg: v(prod, 'vSeg'),
      vOutro: v(prod, 'vOutro'),
      orig: t(icms, 'orig') || '0',
      cst: t(icms, 'CST'),
      csosn: t(icms, 'CSOSN'),
      vST: v(icms, 'vICMSST'),
      vIPI: v(ipi, 'vIPI'),
    };
  });
  return {
    tipo: 'nfe',
    nome,
    chave,
    modelo: t(ide, 'mod'),
    serie: t(ide, 'serie'),
    numero: t(ide, 'nNF'),
    data: (t(ide, 'dhEmi') || t(ide, 'dEmi')).slice(0, 10),
    tpNF: t(ide, 'tpNF'),
    tpAmb: t(ide, 'tpAmb') || t(prot, 'tpAmb'),
    cStat: t(prot, 'cStat'),
    emit: { cnpj: t(emit, 'CNPJ'), cpf: t(emit, 'CPF'), nome: t(emit, 'xNome'), ie: t(emit, 'IE'), end: endereco(q(emit, 'enderEmit')) },
    dest: dest ? { cnpj: t(dest, 'CNPJ'), cpf: t(dest, 'CPF') } : null,
    tot: { vNF: v(tot, 'vNF'), vProd: v(tot, 'vProd'), vDesc: v(tot, 'vDesc'), vFrete: v(tot, 'vFrete'), vSeg: v(tot, 'vSeg'), vOutro: v(tot, 'vOutro'), vST: v(tot, 'vST'), vIPI: v(tot, 'vIPI') },
    itens,
  };
}

// ---------- Geração da EFD ----------
const CFOP_ST = ['5401', '5402', '5403', '5405', '6401', '6403', '6404'];
const cfopEntrada = (cfop, usoConsumo = false) => {
  const c = so(cfop);
  const uf = c[0] === '6' ? '2' : c[0] === '7' ? '3' : '1';
  if (usoConsumo) return uf + (CFOP_ST.includes(c) ? '407' : '556');
  if (CFOP_ST.includes(c)) return uf + '403';
  if (['5910', '6910'].includes(c)) return uf + '910';
  if (['5911', '6911'].includes(c)) return uf + '911';
  if (['5949', '6949'].includes(c)) return uf + '949';
  return uf + '102';
};

/**
 * @param {object} p
 * @param {object} p.est        estabelecimento: { cnpj, ie, razao, fantasia, uf, codMun, cep, end, num, compl, bairro, fone, email, im }
 * @param {object} p.contador   { nome, cpf, crc, cnpj, cep, end, num, compl, bairro, fone, email, codMun }
 * @param {string} p.ini        data inicial (aaaa-mm-dd)
 * @param {string} p.fim        data final (aaaa-mm-dd)
 * @param {object[]} p.docs     resultado de lerXml(); em NF-e de compra, `usoConsumo` (Set de nItem) marca itens de uso e consumo
 * @param {object|null} p.inventario { data, itens: [{ cod, descr, ean, unid, ncm, cest, qtd, vlUnit }] }
 * @param {object} p.opcoes     { perfil, finalidade, mapaCsosn, contaEstoque, nomeContaEstoque }
 */
export function gerarEfd({ est, contador, ini, fim, docs, inventario = null, opcoes = {} }) {
  const avisos = [];
  const erros = [];
  const cnpj = so(est.cnpj);
  if (!cnpjValido(cnpj)) erros.push('CNPJ do estabelecimento inválido');
  if (!so(est.ie)) erros.push('Informe a inscrição estadual do estabelecimento');
  if (!/^\d{7}$/.test(so(est.codMun))) erros.push('Código IBGE do município do estabelecimento deve ter 7 dígitos');
  if (!est.razao) erros.push('Informe a razão social');
  if (!contador?.nome || !so(contador.cpf) || !contador.crc) erros.push('Informe nome, CPF e CRC do contador');
  if (contador?.codMun && !/^\d{7}$/.test(so(contador.codMun))) erros.push('Código IBGE do município do contador deve ter 7 dígitos');
  if (!ini || !fim || ini > fim || ini.slice(0, 7) !== fim.slice(0, 7)) erros.push('O período deve estar dentro de um único mês');
  if (erros.length) return { erros, avisos };

  const codVer = LEIAUTE_POR_ANO[+ini.slice(0, 4)];
  if (!codVer) return { erros: [`Ano ${ini.slice(0, 4)} sem leiaute conhecido`], avisos };
  const mapa = { ...MAPA_CSOSN_PADRAO, ...(opcoes.mapaCsosn || {}) };
  const cstDe = (it) => (it.orig || '0').slice(0, 1) + (it.cst ? it.cst.padStart(2, '0').slice(-2) : mapa[it.csosn] || '90');
  const noPeriodo = (d) => d >= ini && d <= fim;

  // Separa e confere os documentos
  const cancelados = new Set(docs.filter((d) => d.tipo === 'cancelamento').map((d) => d.chave));
  const vistos = new Set();
  const saidas = [];
  const entradas = [];
  for (const d of docs) {
    if (d.tipo === 'erro' || d.tipo === 'ignorado') {
      avisos.push(`${d.nome}: ${d.motivo}`);
      continue;
    }
    if (d.tipo !== 'nfe') continue;
    if (vistos.has(d.chave)) continue;
    vistos.add(d.chave);
    if (d.tpAmb === '2') {
      avisos.push(`Nota ${d.modelo}/${d.numero} emitida em homologação (sem valor fiscal): ignorada`);
      continue;
    }
    if (!noPeriodo(d.data)) {
      avisos.push(`Nota ${d.modelo}/${d.numero} de ${d.data.split('-').reverse().join('/')} fora do período: ignorada`);
      continue;
    }
    const daEmpresa = so(d.emit.cnpj) === cnpj;
    if (daEmpresa && d.modelo === '65') saidas.push(d);
    else if (daEmpresa) avisos.push(`NF-e ${d.numero} emitida pela empresa (modelo 55): não suportada nesta versão, escriture no sistema do contador`);
    else if (d.modelo === '55' && so(d.dest?.cnpj) === cnpj) entradas.push(d);
    else if (d.modelo === '65') avisos.push(`NFC-e ${d.numero} de outro emitente: NFC-e não se escritura como entrada`);
    else avisos.push(`Nota ${d.numero}: não é da empresa nem destinada a ela (CNPJ ${d.emit.cnpj})`);
  }
  const inutilizadas = docs.filter((d) => d.tipo === 'inutilizacao' && so(d.cnpj) === cnpj && d.modelo === '65' && (!d.data || noPeriodo(d.data)));
  const ordem = (a, b) => a.data.localeCompare(b.data) || +a.serie - +b.serie || +a.numero - +b.numero;
  saidas.sort(ordem);
  for (const d of entradas.filter((x) => cancelados.has(x.chave))) avisos.push(`NF-e de compra ${d.numero} está cancelada: não escriturada`);
  const entradasValidas = entradas.filter((x) => !cancelados.has(x.chave)).sort(ordem);

  // Cadastros (0150, 0190, 0200)
  const participantes = new Map();
  const unidades = new Map([['UN', 'Unidade']]);
  const itens0200 = new Map();
  const addUnid = (u) => unidades.has(u) || unidades.set(u, `Unidade ${u}`);
  for (const d of entradasValidas) {
    const cod = 'F' + so(d.emit.cnpj || d.emit.cpf);
    if (!participantes.has(cod)) participantes.set(cod, d.emit);
    for (const it of d.itens) {
      addUnid(it.uCom);
      const codItem = `E${so(d.emit.cnpj).slice(0, 8)}-${limpa(it.cProd).slice(0, 40)}`;
      it.codItem = codItem;
      it.uso = !!d.usoConsumo?.has(it.nItem);
      const ja = itens0200.get(codItem);
      if (!ja) itens0200.set(codItem, { descr: it.xProd, ean: it.cEAN, unid: it.uCom, ncm: it.ncm, cest: it.cest, tipo: it.uso ? '07' : '00' });
      else if (it.uso) ja.tipo = '07';
    }
  }
  const inv = inventario?.itens?.filter((i) => i.qtd > 0) || [];
  for (const i of inv) {
    addUnid(i.unid || 'UN');
    if (!/^\d{8}$/.test(so(i.ncm))) avisos.push(`Inventário: produto "${i.descr}" sem NCM válido`);
    itens0200.set(i.cod, { descr: i.descr, ean: i.ean, unid: i.unid || 'UN', ncm: so(i.ncm), cest: so(i.cest) });
  }

  const linhas = [];
  const reg = (...campos) => linhas.push('|' + campos.map(limpa).join('|') + '|');
  const inicioBloco = () => linhas.length;
  const contar = (desde) => linhas.length - desde + 1; // inclui o registro de encerramento

  // ---------- Bloco 0 ----------
  let b = inicioBloco();
  reg('0000', codVer, opcoes.finalidade === '1' ? '1' : '0', dataEfd(ini), dataEfd(fim), est.razao, cnpj, '', (est.uf || 'AL').toUpperCase(), so(est.ie), so(est.codMun), so(est.im), '', opcoes.perfil || 'A', '1');
  reg('0001', '0');
  reg('0005', est.fantasia || est.razao, so(est.cep), est.end, est.num, est.compl, est.bairro, so(est.fone), '', est.email);
  reg('0100', contador.nome, so(contador.cpf), contador.crc, so(contador.cnpj), so(contador.cep), contador.end, contador.num, contador.compl, contador.bairro, so(contador.fone), '', contador.email, so(contador.codMun));
  for (const [cod, p] of participantes)
    reg('0150', cod, p.nome, '01058', so(p.cnpj), p.cnpj ? '' : so(p.cpf), so(p.ie) === '' || /ISENTO/i.test(p.ie) ? '' : so(p.ie), so(p.end.cMun), '', p.end.lgr, p.end.nro, p.end.cpl, p.end.bairro);
  for (const [u, d] of unidades) reg('0190', u, d);
  for (const [cod, i] of itens0200) reg('0200', cod, i.descr, i.ean, '', i.unid, i.tipo || '00', i.ncm, '', /^\d{8}$/.test(i.ncm) ? i.ncm.slice(0, 2) : '', '', '', i.cest);
  const conta = inv.length && opcoes.contaEstoque ? opcoes.contaEstoque : '';
  if (conta) reg('0500', dataEfd(ini), '01', 'A', String(conta.split('.').length), conta, opcoes.nomeContaEstoque || 'Estoque de mercadorias para revenda');
  reg('0990', contar(b));

  // ---------- Bloco B (só DF) ----------
  reg('B001', '1');
  reg('B990', '2');

  // ---------- Bloco C ----------
  b = inicioBloco();
  const temC = saidas.length || entradasValidas.length || inutilizadas.length;
  reg('C001', temC ? '0' : '1');
  const resumo = { nfce: 0, nfceCanceladas: 0, nfceInutilizadas: 0, vendas: 0, entradas: 0, compras: 0, itensInventario: inv.length, valorInventario: 0 };

  for (const d of saidas) {
    const cancelada = cancelados.has(d.chave) || ['101', '151', '135'].includes(d.cStat);
    const denegada = ['110', '301', '302', '303'].includes(d.cStat);
    if (cancelada || denegada) {
      reg('C100', '1', '0', '', '65', cancelada ? '02' : '04', d.serie, d.numero, d.chave, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '');
      resumo.nfceCanceladas++;
      continue;
    }
    const tt = d.tot;
    reg('C100', '1', '0', '', '65', '00', d.serie, d.numero, d.chave, dataEfd(d.data), dataEfd(d.data), n2(tt.vNF), '0', n2(tt.vDesc), '0,00', n2(tt.vProd), '9', n2(tt.vFrete), n2(tt.vSeg), n2(tt.vOutro), '0,00', '0,00', '', '', '', '', '', '', '');
    // C190: analítico por CST + CFOP + alíquota (alíquota 0: ICMS recolhido no Simples Nacional)
    const grupos = new Map();
    for (const it of d.itens) {
      const k = `${cstDe(it)}|${so(it.cfop)}`;
      grupos.set(k, arred((grupos.get(k) || 0) + it.vProd - it.vDesc + it.vFrete + it.vSeg + it.vOutro));
    }
    fecharSoma(grupos, tt.vNF);
    for (const [k, vl] of grupos) {
      const [cst, cfop] = k.split('|');
      reg('C190', cst, cfop, '0,00', n2(vl), '0,00', '0,00', '0,00', '0,00', '0,00', '0,00', '');
    }
    resumo.nfce++;
    resumo.vendas = arred(resumo.vendas + tt.vNF);
  }
  for (const d of inutilizadas)
    for (let nnf = d.nIni; nnf <= d.nFin; nnf++) {
      reg('C100', '1', '0', '', '65', '05', d.serie, String(nnf), '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '');
      resumo.nfceInutilizadas++;
    }

  for (const d of entradasValidas) {
    const tt = d.tot;
    const codPart = 'F' + so(d.emit.cnpj || d.emit.cpf);
    // Simples Nacional: sem direito a crédito, então ICMS, ICMS-ST e IPI ficam sem valor nas entradas.
    reg('C100', '0', '1', codPart, '55', '00', d.serie, d.numero, d.chave, dataEfd(d.data), dataEfd(d.data), n2(tt.vNF), '1', n2(tt.vDesc), '0,00', n2(tt.vProd), '9', n2(tt.vFrete), n2(tt.vSeg), n2(tt.vOutro), '0,00', '0,00', '0,00', '0,00', '0,00', '', '', '', '');
    const grupos = new Map();
    for (const it of d.itens) {
      const cst = cstDe(it);
      const cfop = cfopEntrada(it.cfop, it.uso);
      reg('C170', String(it.nItem), it.codItem, '', nd(it.qCom, 5), it.uCom, n2(it.vProd), n2(it.vDesc), '0', cst, cfop, '', '0,00', '0,00', '0,00', '0,00', '0,00', '0,00', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '');
      const k = `${cst}|${cfop}`;
      grupos.set(k, arred((grupos.get(k) || 0) + it.vProd - it.vDesc + it.vFrete + it.vSeg + it.vOutro + it.vST + it.vIPI));
    }
    fecharSoma(grupos, tt.vNF);
    for (const [k, vl] of grupos) {
      const [cst, cfop] = k.split('|');
      reg('C190', cst, cfop, '0,00', n2(vl), '0,00', '0,00', '0,00', '0,00', '0,00', '0,00', '');
    }
    resumo.entradas++;
    resumo.compras = arred(resumo.compras + tt.vNF);
  }
  reg('C990', contar(b));

  // ---------- Bloco D (transporte/comunicação: sem movimento) ----------
  reg('D001', '1');
  reg('D990', '2');

  // ---------- Bloco E (apuração: ICMS do Simples é recolhido no DAS) ----------
  b = inicioBloco();
  reg('E001', '0');
  reg('E100', dataEfd(ini), dataEfd(fim));
  reg('E110', ...Array(14).fill('0,00'));
  reg('E990', contar(b));

  // ---------- Bloco G (CIAP: não se aplica) ----------
  reg('G001', '1');
  reg('G990', '2');

  // ---------- Bloco H (inventário) ----------
  b = inicioBloco();
  if (inv.length) {
    reg('H001', '0');
    const totalInv = arred(inv.reduce((a, i) => a + arred(i.qtd * i.vlUnit), 0));
    reg('H005', dataEfd(inventario.data), n2(totalInv), '01');
    for (const i of inv) {
      const vl = arred(i.qtd * i.vlUnit);
      reg('H010', i.cod, i.unid || 'UN', nd(i.qtd, 3), nd(i.vlUnit, 6), n2(vl), '0', '', '', conta, n2(vl));
    }
    resumo.valorInventario = totalInv;
  } else reg('H001', '1');
  reg('H990', contar(b));

  // ---------- Bloco K (produção: não se aplica ao comércio) ----------
  reg('K001', '1');
  reg('K990', '2');

  // ---------- Bloco 1 ----------
  b = inicioBloco();
  reg('1001', '0');
  reg('1010', ...Array(13).fill('N'));
  reg('1990', contar(b));

  // ---------- Bloco 9 (controle) ----------
  const porReg = new Map();
  for (const l of linhas) {
    const r = l.split('|')[1];
    porReg.set(r, (porReg.get(r) || 0) + 1);
  }
  const tipos9 = ['9001', '9900', '9990', '9999'];
  const qtd9900 = porReg.size + tipos9.length;
  const inicio9 = linhas.length;
  reg('9001', '0');
  for (const [r, n] of porReg) reg('9900', r, String(n));
  reg('9900', '9001', '1');
  reg('9900', '9900', String(qtd9900));
  reg('9900', '9990', '1');
  reg('9900', '9999', '1');
  reg('9990', String(linhas.length - inicio9 + 2));
  reg('9999', String(linhas.length + 1));

  if (!saidas.length) avisos.push('Nenhuma NFC-e de venda no período. Confira se carregou os XMLs certos.');
  return { texto: linhas.join('\r\n') + '\r\n', resumo, avisos, erros: [], codVer };
}

// Ajusta arredondamentos para que a soma dos C190 seja igual ao valor do documento.
function fecharSoma(grupos, total) {
  const soma = arred([...grupos.values()].reduce((a, x) => a + x, 0));
  const dif = arred(total - soma);
  if (dif && grupos.size) {
    const [k, maior] = [...grupos].sort((a, b) => b[1] - a[1])[0];
    grupos.set(k, arred(maior + dif));
  }
}

// O PVA lê o arquivo em ISO-8859-1.
export function paraLatin1(texto) {
  const out = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i++) {
    let c = texto.charCodeAt(i);
    if (c > 255) {
      const base = texto[i].normalize('NFD')[0].charCodeAt(0);
      c = base <= 255 ? base : 63;
    }
    out[i] = c;
  }
  return out;
}

// Leitor de .zip sem biblioteca externa (arquivos "stored" ou "deflate", o padrão dos emissores).
export async function lerZip(arquivo) {
  const buf = new Uint8Array(await arquivo.arrayBuffer());
  const dv = new DataView(buf.buffer);
  let fimCd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--)
    if (dv.getUint32(i, true) === 0x06054b50) {
      fimCd = i;
      break;
    }
  if (fimCd < 0) throw new Error(`${arquivo.name}: arquivo .zip inválido`);
  const total = dv.getUint16(fimCd + 10, true);
  let p = dv.getUint32(fimCd + 16, true);
  const dec = new TextDecoder('utf-8');
  const saida = [];
  for (let k = 0; k < total; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error(`${arquivo.name}: diretório do .zip corrompido`);
    const metodo = dv.getUint16(p + 10, true);
    const tamComp = dv.getUint32(p + 20, true);
    const nLen = dv.getUint16(p + 28, true);
    const eLen = dv.getUint16(p + 30, true);
    const cLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const nome = dec.decode(buf.subarray(p + 46, p + 46 + nLen));
    p += 46 + nLen + eLen + cLen;
    if (nome.endsWith('/')) continue;
    const ini = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const dados = buf.subarray(ini, ini + tamComp);
    let bytes;
    if (metodo === 0) bytes = dados;
    else if (metodo === 8) bytes = new Uint8Array(await new Response(new Blob([dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    else throw new Error(`${nome}: compressão não suportada no .zip`);
    saida.push({ nome, texto: dec.decode(bytes) });
  }
  return saida;
}
