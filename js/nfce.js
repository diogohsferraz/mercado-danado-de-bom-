// Emissão de NFC-e pela ponte (que guarda o certificado no provedor e arquiva o XML).
// Cada venda guarda o estado da nota em venda.nfce: pendente → autorizada | erro | cancelada.
import * as D from './db.js';
import { chamarPonte } from './ponte.js';
import * as ARQ from './arquivo.js';

export const ativa = () => !!D.cfg().fiscal?.nfce?.ativa;

function isoLocal(ts) {
  const d = new Date(ts);
  const z = (n) => String(Math.abs(n)).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  return `${D.isoData(d)}T${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}${off >= 0 ? '+' : '-'}${z(Math.trunc(off / 60))}:${z(off % 60)}`;
}

// Venda do app → formato neutro que a ponte traduz para o provedor.
export function montarVenda(v) {
  const cli = v.clienteId && D.cliente(v.clienteId);
  const bruto = v.itens.reduce((a, i) => a + i.preco * i.qtd, 0);
  let resta = v.desconto || 0;
  const itens = v.itens.map((i, k) => {
    const p = D.produto(i.produtoId) || {};
    let desc = 0;
    if (v.desconto) {
      desc = k === v.itens.length - 1 ? resta : Math.round(((v.desconto * i.preco * i.qtd) / bruto) * 100) / 100;
      resta = Math.round((resta - desc) * 100) / 100;
    }
    return {
      codigo: p.ean || i.produtoId,
      descricao: i.nome,
      ncm: p.ncm || '',
      cest: p.cest || '',
      cfop: p.st ? '5405' : '5102',
      csosn: p.st ? '500' : '102',
      origem: p.origem || '0',
      unid: p.unid || 'UN',
      qtd: i.qtd,
      valorUnit: i.preco,
      desconto: desc,
      ean: p.ean || '',
    };
  });
  return { data: isoLocal(v.ts), itens, pagamentos: [{ tipo: v.pagamento, valor: v.total }], cpf: D.cfg().fiscal.nfce.cpfNaNota && cli?.cpf ? cli.cpf : null };
}

const emAndamento = new Set();
export async function emitir(vendaId) {
  if (emAndamento.has(vendaId)) return D.venda(vendaId)?.nfce;
  emAndamento.add(vendaId);
  try {
    const v = D.venda(vendaId);
    if (!v || v.status !== 'ok' || !v.nfce || v.nfce.status === 'autorizada') return v?.nfce;
    const sem = v.itens.find((i) => !/^\d{8}$/.test(D.produto(i.produtoId)?.ncm || ''));
    if (sem) {
      D.atualizarNfce(vendaId, { status: 'erro', erro: `"${sem.nome}" está sem NCM no cadastro` });
      return D.venda(vendaId).nfce;
    }
    try {
      const r = await chamarPonte('/nfce/emitir', { ref: v.id, venda: montarVenda(v) });
      if (r.xml) await ARQ.guardarXml(r.chave, r.xml).catch(() => {});
      D.atualizarNfce(vendaId, { status: 'autorizada', chave: r.chave, numero: r.numero, serie: r.serie, protocolo: r.protocolo, qrcode: r.qrcode, urlConsulta: r.urlConsulta, arquivada: !!r.arquivada, erro: null, ts: Date.now() });
      await enviarEmailPendente(vendaId);
    } catch (e) {
      // 400/422: rejeição ou dado inválido (precisa de correção). Demais: sem conexão → tenta de novo.
      const definitivo = e.status === 400 || e.status === 422 || e.status === 501;
      D.atualizarNfce(vendaId, { status: definitivo ? 'erro' : 'pendente', erro: e.message, tentativas: (v.nfce.tentativas || 0) + 1 });
    }
    return D.venda(vendaId).nfce;
  } finally {
    emAndamento.delete(vendaId);
  }
}

let rodando = false;
export async function processarFila() {
  if (rodando || !ativa() || !navigator.onLine || !D.cfg().idade.ponteUrl) return;
  rodando = true;
  try {
    const fila = D.db().vendas.filter((v) => v.status === 'ok' && v.nfce?.status === 'pendente' && (v.nfce.tentativas || 0) < 30);
    for (const v of fila) await emitir(v.id);
    // E-mails de nota que ficaram para depois (nota autorizada mais tarde ou falha no envio)
    const emails = D.db().vendas.filter((v) => v.nfce?.status === 'autorizada' && v.nfce.email && v.nfce.emailStatus === 'pendente' && (v.nfce.emailTentativas || 0) < 10);
    for (const v of emails) await enviarEmailPendente(v.id);
  } finally {
    rodando = false;
  }
}

// O cliente pediu a nota por e-mail no fim da compra (a nota não é impressa).
export const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim()) && String(e).trim().length <= 120;
export async function enviarPorEmail(vendaId, email) {
  email = String(email || '').trim().toLowerCase();
  if (!emailValido(email)) throw new Error('Confira o e-mail digitado');
  D.atualizarNfce(vendaId, { email, emailStatus: 'pendente', emailErro: null, emailTentativas: 0 });
  return enviarEmailPendente(vendaId);
}
async function enviarEmailPendente(vendaId) {
  const v = D.venda(vendaId);
  if (!v?.nfce?.email || v.nfce.emailStatus === 'enviado') return v?.nfce;
  if (v.nfce.status !== 'autorizada') return v.nfce; // sai assim que a nota for autorizada
  try {
    await chamarPonte('/nfce/email', { ref: v.id, email: v.nfce.email });
    D.atualizarNfce(vendaId, { emailStatus: 'enviado', emailEm: Date.now(), emailErro: null });
  } catch (e) {
    D.atualizarNfce(vendaId, { emailStatus: e.status === 400 ? 'erro' : 'pendente', emailErro: e.message, emailTentativas: (v.nfce.emailTentativas || 0) + 1 });
  }
  return D.venda(vendaId).nfce;
}

export async function reenviar(vendaId) {
  D.atualizarNfce(vendaId, { status: 'pendente', erro: null, tentativas: 0 });
  return emitir(vendaId);
}

export async function cancelar(vendaId, justificativa) {
  const v = D.venda(vendaId);
  await chamarPonte('/nfce/cancelar', { ref: v.id, chave: v.nfce.chave, justificativa }, { admin: true });
  D.atualizarNfce(vendaId, { status: 'cancelada', canceladaEm: Date.now(), justificativa });
}

// Notas de saída do mês arquivadas na ponte (todas as lojas), em páginas.
export async function notasDoMes(mesAAAAMM) {
  const xmls = [];
  const cancelados = [];
  let cursor = null;
  do {
    const r = await chamarPonte('/notas/mes', { mes: mesAAAAMM, cursor }, { admin: true });
    xmls.push(...r.itens.map((i) => i.xml).filter(Boolean));
    cancelados.push(...(r.cancelados || []));
    cursor = r.cursor;
  } while (cursor);
  return { xmls, cancelados };
}

// XMLs de venda emitidos em outro sistema: vão para o arquivo da ponte (ou ficam neste aparelho).
export async function guardarSaidas(docs) {
  const r = { guardadas: 0, ignoradas: [] };
  const naPonte = !!D.cfg().idade.ponteUrl && !!D.cfg().idade.ponteChaveAdmin;
  for (const d of docs) {
    const ehSaida = (d.tipo === 'nfe' && d.modelo === '65') || d.tipo === 'cancelamento';
    if (!ehSaida) {
      r.ignoradas.push(`${d.nome}: ${d.tipo === 'nfe' ? 'NF-e de compra (use Notas de entrada)' : d.motivo || 'não é NFC-e'}`);
      continue;
    }
    if (naPonte) await chamarPonte('/notas/guardar', { xml: d.texto }, { admin: true });
    else {
      await ARQ.guardarXml(d.tipo === 'cancelamento' ? `canc-${d.chave}` : d.chave, d.texto);
      D.registrarSaidaLocal(d);
    }
    r.guardadas++;
  }
  r.local = !naPonte;
  return r;
}
