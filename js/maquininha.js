// Maquininha PagBank Smart: o app Android (pasta /android) abre o totem e expõe a PlugPag
// como window.PlugPagNativo. Fora da maquininha, nada disso existe e o totem segue como antes.
//
// Protocolo: o JS chama PlugPagNativo.<metodo>(id, json); o app responde chamando
// window.__mdbNativo.retorno(id, resultado) e, durante o pagamento, __mdbNativo.evento(id, evento).
import { brl, carregarScript } from './ui.js';

const nativo = () => window.PlugPagNativo;
export const disponivel = () => !!nativo();

const pendentes = new Map();
let seq = 0;
const ler = (x) => (typeof x === 'string' ? JSON.parse(x) : x);
window.__mdbNativo = {
  retorno(id, r) {
    const p = pendentes.get(id);
    if (!p) return;
    pendentes.delete(id);
    p.ok(ler(r));
  },
  evento(id, e) {
    const p = pendentes.get(id);
    if (p && p.aoEvento) p.aoEvento(ler(e));
  },
};

function chamar(metodo, dados = {}, aoEvento) {
  return new Promise((ok) => {
    if (!disponivel()) return ok({ ok: false, mensagem: 'Este aparelho não é a maquininha' });
    const id = `n${++seq}`;
    pendentes.set(id, { ok, aoEvento });
    try {
      nativo()[metodo](id, JSON.stringify(dados));
    } catch (e) {
      pendentes.delete(id);
      ok({ ok: false, mensagem: `Falha ao falar com a maquininha: ${e.message}` });
    }
  });
}

// Referência curta e alfanumérica (a PlugPag limita o tamanho).
export const novaReferencia = () => Date.now().toString(36).toUpperCase().slice(-10);

/** tipo: 'credito' | 'debito' | 'pix'. Resolve com { ok, transactionCode, transactionId, nsu, bandeira } ou { ok: false, mensagem }. */
export const pagar = ({ tipo, valor, referencia }, aoEvento) => chamar('pagar', { tipo, valorCentavos: Math.round(valor * 100), parcelas: 1, referencia }, aoEvento);
export const cancelarOperacao = () => chamar('cancelarOperacao');
export const estornar = ({ tipo, transactionCode, transactionId }, aoEvento) => chamar('estornar', { tipo, transactionCode, transactionId }, aoEvento);
export const reimprimirViaCliente = () => chamar('reimprimirViaCliente');
export const status = () => chamar('status');
export const ativar = (codigo) => chamar('ativar', { codigo });
export const abrirConfiguracao = () => nativo()?.configurar?.('', '{}');

const NOME_PAG = { credito: 'Cartão de crédito', debito: 'Cartão de débito', saldo: 'Saldo da carteira', pix: 'Pix' };
const col = (esq, dir, largura = 32) => {
  const e = String(esq);
  const d = String(dir);
  const espaco = Math.max(1, largura - e.length - d.length);
  return e.length + d.length + 1 > largura ? [e, ' '.repeat(Math.max(1, largura - d.length)) + d] : [e + ' '.repeat(espaco) + d];
};

// Cupom para a impressora térmica da maquininha (o app desenha as linhas em bitmap).
export async function imprimirCupom({ venda, loja, cfg, estabelecimento }) {
  const L = [];
  const add = (t, o = {}) => L.push({ t, ...o });
  add(cfg.nome, { centro: true, negrito: true, grande: true });
  if (estabelecimento) {
    add(estabelecimento.razao, { centro: true });
    add(`CNPJ ${estabelecimento.cnpj}  IE ${estabelecimento.ie}`, { centro: true });
  }
  add(loja.nome, { centro: true });
  add('-'.repeat(32));
  add(`Compra nº ${venda.numero}`, { negrito: true });
  add(new Date(venda.ts).toLocaleString('pt-BR'));
  add('-'.repeat(32));
  for (const i of venda.itens) {
    add(i.nome.slice(0, 32));
    col(`  ${i.qtd} x ${brl(i.preco)}`, brl(i.preco * i.qtd)).forEach((t) => add(t));
  }
  add('-'.repeat(32));
  if (venda.desconto) col(`Desconto ${venda.cupom || ''}`, `-${brl(venda.desconto)}`).forEach((t) => add(t));
  col('TOTAL', brl(venda.total)).forEach((t) => add(t, { negrito: true, grande: true }));
  add(`${NOME_PAG[venda.pagamento] || venda.pagamento}${venda.tef?.bandeira ? ` ${venda.tef.bandeira}` : ''}`);
  if (venda.tef?.nsu) add(`NSU ${venda.tef.nsu}`);
  const nf = venda.nfce;
  let qr = '';
  if (nf?.status === 'autorizada') {
    add('-'.repeat(32));
    add(`NFC-e nº ${nf.numero}  Série ${nf.serie}`, { centro: true, negrito: true });
    add('Consulte pela Chave de Acesso em', { centro: true });
    add(nf.urlConsulta || 'www.sefaz.al.gov.br/nfce/consulta', { centro: true });
    (nf.chave || '').match(/.{1,24}/g)?.forEach((p) => add(p.replace(/(\d{4})/g, '$1 ').trim(), { centro: true }));
    if (nf.protocolo) add(`Protocolo ${nf.protocolo}`, { centro: true });
    if (nf.qrcode) await carregarScript('js/vendor/qrcode-generator.js').catch(() => {});
    if (nf.qrcode && window.qrcode) {
      const q = window.qrcode(0, 'M');
      q.addData(nf.qrcode);
      q.make();
      qr = q.createDataURL(4, 2);
    }
  } else if (nf) {
    add('-'.repeat(32));
    add('NFC-e em processamento', { centro: true });
  }
  add(' ');
  add(cfg.slogan || 'Obrigado e volte sempre!', { centro: true });
  return chamar('imprimir', { linhas: L, qr });
}
