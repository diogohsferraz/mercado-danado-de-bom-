// Camada de dados. Nesta versão os dados ficam no localStorage do navegador.
// Todas as regras de negócio passam por aqui, para facilitar trocar por um backend depois.
import { brl, digitos } from './ui.js';

const CHAVE = 'mddb:v1';
let S = null;
const ouvintes = new Set();

export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const arred = (v) => Math.round((Number(v) || 0) * 100) / 100;
const DIA = 864e5;

export function isoData(d) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export const hoje = () => isoData(new Date());
export function somarDias(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return isoData(new Date(y, m - 1, d + n));
}
export function diasAte(iso) {
  if (!iso) return Infinity;
  const [y, m, d] = iso.split('-').map(Number);
  const alvo = new Date(y, m - 1, d);
  const h = new Date();
  h.setHours(0, 0, 0, 0);
  return Math.round((alvo - h) / DIA);
}
export function idade(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const h = new Date();
  let a = h.getFullYear() - y;
  if (h.getMonth() + 1 < m || (h.getMonth() + 1 === m && h.getDate() < d)) a--;
  return a;
}
// Valida os dígitos verificadores do CPF.
export function cpfValido(cpf) {
  const c = digitos(cpf);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (n) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += +c[i] * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === +c[9] && dv(10) === +c[10];
}
function cpfComDv(base9) {
  let c = base9;
  for (const n of [9, 10]) {
    let s = 0;
    for (let i = 0; i < n; i++) s += +c[i] * (n + 1 - i);
    const r = (s * 10) % 11;
    c += r === 10 ? 0 : r;
  }
  return c;
}
export function inicioDoDia(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// ---------- Persistência ----------
export function carregar() {
  try {
    S = JSON.parse(localStorage.getItem(CHAVE));
  } catch {
    S = null;
  }
  if (!S || ![1, 2].includes(S.versao)) S = semente();
  else migrar(S);
  gravar();
  return S;
}
// Atualiza dados salvos por versões anteriores.
function migrar(s) {
  s.geladeiras ||= [];
  s.acessos ||= [];
  s.config.idade ||= { modo: 'manual', ponteUrl: '', ponteChave: '', ponteChaveAdmin: '' };
  // A data digitada pelo próprio cliente não vale como prova de maioridade.
  if (!['manual', 'ponte'].includes(s.config.idade.modo)) s.config.idade.modo = 'manual';
  s.geladeiras.forEach((g) => (g.apenasMaiores = true));
  s.clientes.forEach((c) => {
    c.nascimento ??= '';
    c.verificacao ||= { status: 'pendente', fonte: '', ts: 0, obs: '' };
    if (c.verificacao.status === 'aprovado' && !['manual', 'ponte'].includes(c.verificacao.fonte))
      c.verificacao = { status: 'pendente', fonte: '', ts: Date.now(), obs: 'Precisa de nova verificação' };
  });
  s.produtos.forEach((p) => (p.restrito18 ??= false));
  s.versao = 2;
}
function gravar() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(S));
  } catch (e) {
    console.error('Falha ao salvar', e);
  }
}
export function salvar() {
  gravar();
  ouvintes.forEach((f) => f());
}
export function aoMudar(f) {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}
// Sincroniza abas/janelas abertas no mesmo navegador (ex.: totem + painel).
window.addEventListener('storage', (e) => {
  if (e.key === CHAVE && e.newValue) {
    try {
      S = JSON.parse(e.newValue);
      ouvintes.forEach((f) => f());
    } catch {
      /* ignora */
    }
  }
});

export const db = () => S;
export const cfg = () => S.config;

// ---------- Consultas ----------
export const produto = (id) => S.produtos.find((p) => p.id === id);
export const produtoPorEan = (ean) => {
  const e = digitos(ean);
  return e ? S.produtos.find((p) => p.ativo && p.ean === e) : undefined;
};
export const produtosAtivos = () => S.produtos.filter((p) => p.ativo);
export const loja = (id) => S.lojas.find((l) => l.id === id);
export const lojasVenda = () => S.lojas.filter((l) => l.tipo === 'loja' && l.ativa);
export const lojasTodas = () => S.lojas.filter((l) => l.ativa);
export const cliente = (id) => S.clientes.find((c) => c.id === id);

export const estoque = (produtoId, lojaId) =>
  S.lotes.reduce((a, l) => (l.produtoId === produtoId && l.lojaId === lojaId ? a + l.qtd : a), 0);
export const estoqueTotal = (produtoId) => S.lotes.reduce((a, l) => (l.produtoId === produtoId ? a + l.qtd : a), 0);

// Lotes em ordem FEFO (vence primeiro, sai primeiro); sem validade por último.
export const lotesDe = (produtoId, lojaId) =>
  S.lotes
    .filter((l) => l.produtoId === produtoId && l.lojaId === lojaId && l.qtd > 0)
    .sort((a, b) => (a.validade || '9999').localeCompare(b.validade || '9999') || a.entrada - b.entrada);

export const proximaValidade = (produtoId, lojaId) => lotesDe(produtoId, lojaId).find((l) => l.validade)?.validade || null;

// ---------- Estoque ----------
function mov(tipo, produtoId, lojaId, qtd, extra = {}) {
  S.movimentos.push({ id: uid('m'), ts: Date.now(), tipo, produtoId, lojaId, qtd, ...extra });
  if (S.movimentos.length > 5000) S.movimentos.splice(0, S.movimentos.length - 5000);
}

function addLote(produtoId, lojaId, qtd, validade = null) {
  if (qtd <= 0) return;
  const igual = S.lotes.find((l) => l.produtoId === produtoId && l.lojaId === lojaId && (l.validade || null) === (validade || null));
  if (igual) igual.qtd += qtd;
  else S.lotes.push({ id: uid('l'), produtoId, lojaId, qtd, validade: validade || null, entrada: Date.now() });
}

function retirar(produtoId, lojaId, qtd) {
  let resta = qtd;
  const retirados = [];
  for (const l of lotesDe(produtoId, lojaId)) {
    if (resta <= 0) break;
    const t = Math.min(l.qtd, resta);
    l.qtd -= t;
    resta -= t;
    retirados.push({ validade: l.validade, qtd: t });
  }
  S.lotes = S.lotes.filter((l) => l.qtd > 0);
  return { retirados, falta: resta };
}

export function entrada(produtoId, lojaId, qtd, validade, obs = '') {
  qtd = Math.floor(qtd);
  if (!(qtd > 0)) throw new Error('Informe uma quantidade maior que zero');
  addLote(produtoId, lojaId, qtd, validade || null);
  mov('entrada', produtoId, lojaId, qtd, { validade: validade || null, obs });
  salvar();
}

export function perda(produtoId, lojaId, qtd, motivo, loteId = null) {
  qtd = Math.floor(qtd);
  if (!(qtd > 0)) throw new Error('Informe uma quantidade maior que zero');
  if (loteId) {
    const l = S.lotes.find((x) => x.id === loteId);
    if (!l) throw new Error('Lote não encontrado');
    const t = Math.min(l.qtd, qtd);
    l.qtd -= t;
    S.lotes = S.lotes.filter((x) => x.qtd > 0);
    mov('perda', produtoId, lojaId, -t, { motivo, validade: l.validade });
  } else {
    if (qtd > estoque(produtoId, lojaId)) throw new Error('Quantidade maior que o estoque');
    retirar(produtoId, lojaId, qtd);
    mov('perda', produtoId, lojaId, -qtd, { motivo });
  }
  salvar();
}

export function inventario(produtoId, lojaId, contado, validade = null) {
  contado = Math.floor(contado);
  if (!(contado >= 0)) throw new Error('Quantidade inválida');
  const atual = estoque(produtoId, lojaId);
  const dif = contado - atual;
  if (dif > 0) addLote(produtoId, lojaId, dif, validade);
  if (dif < 0) retirar(produtoId, lojaId, -dif);
  if (dif !== 0) mov('ajuste', produtoId, lojaId, dif, { obs: `Inventário: ${atual} → ${contado}` });
  salvar();
  return dif;
}

export function transferir(origemId, destinoId, itens, obs = '') {
  if (origemId === destinoId) throw new Error('Origem e destino precisam ser diferentes');
  itens = itens.filter((i) => i.qtd > 0);
  if (!itens.length) throw new Error('Nenhum item para transferir');
  for (const i of itens) {
    const disp = estoque(i.produtoId, origemId);
    if (i.qtd > disp) throw new Error(`${produto(i.produtoId).nome}: só há ${disp} em ${loja(origemId).nome}`);
  }
  const t = { id: uid('t'), ts: Date.now(), origemId, destinoId, itens: [], obs };
  for (const i of itens) {
    const { retirados } = retirar(i.produtoId, origemId, i.qtd);
    retirados.forEach((r) => addLote(i.produtoId, destinoId, r.qtd, r.validade));
    mov('transf_saida', i.produtoId, origemId, -i.qtd, { ref: t.id, destinoId });
    mov('transf_entrada', i.produtoId, destinoId, i.qtd, { ref: t.id, origemId });
    t.itens.push({ produtoId: i.produtoId, qtd: i.qtd });
  }
  S.transferencias.push(t);
  salvar();
  return t;
}

// ---------- Carrinho e vendas ----------
export function calcular(itens, codigoCupom = '') {
  const linhas = itens
    .map((i) => {
      const p = produto(i.produtoId);
      return p && { produtoId: p.id, nome: p.nome, emoji: p.emoji, restrito18: !!p.restrito18, qtd: i.qtd, preco: p.preco, custo: p.custo, total: arred(p.preco * i.qtd) };
    })
    .filter(Boolean);
  const subtotal = arred(linhas.reduce((a, l) => a + l.total, 0));
  let desconto = 0;
  let cupom = null;
  let erroCupom = null;
  const cod = (codigoCupom || '').trim().toUpperCase();
  if (cod) {
    const c = S.cupons.find((x) => x.codigo.toUpperCase() === cod);
    if (!c || !c.ativo) erroCupom = 'Cupom inválido';
    else if (c.validade && diasAte(c.validade) < 0) erroCupom = 'Cupom expirado';
    else if (subtotal < (c.minimo || 0)) erroCupom = `Cupom válido para compras a partir de ${brl(c.minimo)}`;
    else {
      cupom = c.codigo;
      desconto = c.tipo === 'pct' ? arred((subtotal * c.valor) / 100) : Math.min(c.valor, subtotal);
    }
  }
  return { linhas, subtotal, desconto, total: arred(subtotal - desconto), cupom, erroCupom, qtdItens: linhas.reduce((a, l) => a + l.qtd, 0) };
}

function movCarteira(cli, valor, tipo, descricao, ref = null) {
  cli.saldo = arred(cli.saldo + valor);
  S.carteira.push({ id: uid('w'), ts: Date.now(), clienteId: cli.id, tipo, valor: arred(valor), saldoApos: cli.saldo, descricao, ref });
}

export function finalizarVenda({ lojaId, canal, itens, pagamento, clienteId = null, cupom = '', autorizacao = null }) {
  if (!itens.length) throw new Error('Carrinho vazio');
  const c = calcular(itens, cupom);
  if (cupom && c.erroCupom) throw new Error(c.erroCupom);
  let cli = clienteId ? cliente(clienteId) : null;
  if (pagamento === 'saldo') {
    if (!cli) throw new Error('Identifique-se para pagar com saldo');
    if (cli.saldo + 1e-9 < c.total) throw new Error(`Saldo insuficiente. Seu saldo é ${brl(cli.saldo)}`);
  }
  if (c.linhas.some((l) => l.restrito18)) {
    const si = situacaoIdade(cli);
    if (!si.ok) throw new Error(`Produto proibido para menores de 18 anos. ${si.motivo}`);
  }
  const venda = {
    id: uid('v'),
    numero: ++S.seq.venda,
    ts: Date.now(),
    lojaId,
    canal,
    itens: [],
    subtotal: c.subtotal,
    desconto: c.desconto,
    cupom: c.cupom,
    total: c.total,
    pagamento,
    autorizacao,
    clienteId: cli?.id || null,
    status: 'ok',
  };
  for (const l of c.linhas) {
    const r = retirar(l.produtoId, lojaId, l.qtd);
    venda.itens.push({ produtoId: l.produtoId, nome: l.nome, qtd: l.qtd, preco: l.preco, custo: l.custo, lotes: r.retirados, falta: r.falta });
    mov('venda', l.produtoId, lojaId, -l.qtd, { ref: venda.id, falta: r.falta || undefined });
  }
  if (pagamento === 'saldo') movCarteira(cli, -c.total, 'compra', `Compra nº ${venda.numero} – ${loja(lojaId)?.nome}`, venda.id);
  if (c.cupom) {
    const cp = S.cupons.find((x) => x.codigo === c.cupom);
    cp.usos = (cp.usos || 0) + 1;
  }
  S.vendas.push(venda);
  salvar();
  return venda;
}

export function estornarVenda(id, motivo = '') {
  const v = S.vendas.find((x) => x.id === id);
  if (!v || v.status !== 'ok') throw new Error('Venda não pode ser estornada');
  v.status = 'estornada';
  v.estorno = { ts: Date.now(), motivo };
  for (const it of v.itens) {
    let q = 0;
    for (const lt of it.lotes || []) {
      addLote(it.produtoId, v.lojaId, lt.qtd, lt.validade);
      q += lt.qtd;
    }
    if (q) mov('estorno', it.produtoId, v.lojaId, q, { ref: v.id });
  }
  const cli = v.clienteId && cliente(v.clienteId);
  if (v.pagamento === 'saldo' && cli) movCarteira(cli, v.total, 'estorno', `Estorno da compra nº ${v.numero}`, v.id);
  salvar();
}

export const vendasNoPeriodo = ({ desde = 0, ate = Infinity, lojaId = '' } = {}) =>
  S.vendas.filter((v) => v.status === 'ok' && v.ts >= desde && v.ts < ate && (!lojaId || v.lojaId === lojaId));

// Carrinho montado no celular para pagar no cartão do totem.
export function guardarCarrinho(lojaId, itens, cupom) {
  const agora = Date.now();
  for (const [k, v] of Object.entries(S.carrinhos)) if (agora - v.ts > 30 * 60e3) delete S.carrinhos[k];
  let cod;
  do cod = String(Math.floor(100000 + Math.random() * 900000));
  while (S.carrinhos[cod]);
  S.carrinhos[cod] = { lojaId, itens, cupom, ts: agora };
  salvar();
  return cod;
}
export function resgatarCarrinho(cod, lojaId) {
  const c = S.carrinhos[digitos(cod)];
  if (!c || Date.now() - c.ts > 30 * 60e3) throw new Error('Código não encontrado ou expirado');
  if (c.lojaId !== lojaId) throw new Error('Este código é de outra loja');
  delete S.carrinhos[digitos(cod)];
  salvar();
  return c;
}

// ---------- Clientes e carteira ----------
export function buscarCliente(ident) {
  const d = digitos(ident);
  if (d.length < 8) return null;
  return S.clientes.find((c) => c.ativo !== false && (digitos(c.cpf) === d || digitos(c.telefone) === d)) || null;
}
export function autenticar(ident, pin) {
  const c = buscarCliente(ident);
  if (!c || c.pin !== String(pin)) throw new Error('CPF/celular ou PIN incorretos');
  return c;
}
export function salvarCliente(dados) {
  const cpf = digitos(dados.cpf);
  const tel = digitos(dados.telefone);
  const nasc = dados.nascimento || '';
  if (!dados.nome) throw new Error('Informe o nome');
  if (cpf && !cpfValido(cpf)) throw new Error('CPF inválido. Confira os números');
  if (tel.length < 10) throw new Error('Celular deve ter DDD + número');
  if (nasc && !(idade(nasc) >= 0 && idade(nasc) <= 120)) throw new Error('Data de nascimento inválida');
  if (!/^\d{4}$/.test(dados.pin || '')) throw new Error('O PIN deve ter 4 números');
  const dup = S.clientes.find((c) => c.id !== dados.id && ((cpf && digitos(c.cpf) === cpf) || digitos(c.telefone) === tel));
  if (dup) throw new Error('Já existe cliente com este CPF ou celular');
  let c = dados.id && cliente(dados.id);
  if (cpf && !dados.consentimento && !c?.consentimento) throw new Error('Marque a autorização para usar o CPF na verificação de idade');
  const campos = { nome: dados.nome, cpf, telefone: tel, email: dados.email || '', pin: dados.pin, nascimento: nasc };
  if (c) {
    // Trocar CPF ou nascimento invalida a verificação de idade já feita.
    const mudou = c.cpf !== cpf || c.nascimento !== nasc;
    Object.assign(c, campos);
    if (dados.consentimento && !c.consentimento) c.consentimento = Date.now();
    if (mudou) c.verificacao = { status: 'pendente', fonte: '', ts: Date.now(), obs: 'Dados alterados' };
  } else {
    c = { id: uid('c'), ...campos, saldo: 0, criado: Date.now(), ativo: true, consentimento: dados.consentimento ? Date.now() : 0, verificacao: { status: 'pendente', fonte: '', ts: 0, obs: '' } };
    S.clientes.push(c);
  }
  salvar();
  return c;
}

// ---------- Maioridade e geladeiras ----------
export function situacaoIdade(cli) {
  if (!cli) return { ok: false, motivo: 'Identifique-se com CPF ou celular e PIN.' };
  const v = cli.verificacao?.status;
  if (v === 'aprovado' && ['manual', 'ponte'].includes(cli.verificacao.fonte)) return { ok: true, idade: idade(cli.nascimento) };
  if (v === 'recusado') return { ok: false, motivo: 'Não foi possível confirmar que você tem 18 anos ou mais.', recusado: true };
  return { ok: false, motivo: 'Sua idade ainda não foi verificada.', pendente: true };
}
export function definirVerificacao(clienteId, status, { fonte = 'manual', nascimento = null, obs = '' } = {}) {
  if (!['manual', 'ponte'].includes(fonte)) throw new Error('Fonte de verificação inválida');
  const c = cliente(clienteId);
  if (!c) throw new Error('Cliente não encontrado');
  if (nascimento) c.nascimento = nascimento;
  if (status === 'aprovado' && fonte !== 'ponte' && !(idade(c.nascimento) >= 18)) throw new Error('Pela data de nascimento, o cliente tem menos de 18 anos');
  c.verificacao = { status, fonte, ts: Date.now(), obs };
  salvar();
}
export const geladeira = (id) => S.geladeiras.find((g) => g.id === id);
export const geladeirasDaLoja = (lojaId) => S.geladeiras.filter((g) => g.lojaId === lojaId && g.ativa && loja(g.lojaId)?.ativa);
export function salvarGeladeira(d) {
  if (!d.nome) throw new Error('Informe o nome');
  if (!loja(d.lojaId)) throw new Error('Escolha a loja');
  const modo = ['simulada', 'webhook', 'ponte'].includes(d.modo) ? d.modo : 'simulada';
  if (modo === 'webhook' && !/^https:\/\//.test(d.webhookUrl || '')) throw new Error('Informe a URL do webhook (https://…)');
  const campos = {
    nome: d.nome,
    lojaId: d.lojaId,
    apenasMaiores: true, // regra fixa: a geladeira só abre para maiores de 18
    ativa: d.ativa !== false,
    trava: { modo, webhookUrl: d.webhookUrl || '', ponteId: d.ponteId || '', segundos: Math.min(60, Math.max(3, Math.floor(d.segundos || 8))) },
  };
  let g = d.id && geladeira(d.id);
  if (g) Object.assign(g, campos);
  else {
    g = { id: uid('g'), ...campos };
    S.geladeiras.push(g);
  }
  salvar();
  return g;
}
export function registrarAcesso(a) {
  S.acessos.push({ id: uid('a'), ts: Date.now(), ...a });
  if (S.acessos.length > 3000) S.acessos.splice(0, S.acessos.length - 3000);
  salvar();
}
export function recarregar(clienteId, valor, meio) {
  const cli = cliente(clienteId);
  valor = arred(valor);
  if (!cli) throw new Error('Cliente não encontrado');
  if (!(valor > 0)) throw new Error('Valor inválido');
  movCarteira(cli, valor, 'recarga', `Recarga (${meio})`);
  let bonus = 0;
  const { bonusRecargaPct: p, bonusRecargaMin: min } = S.config;
  if (p > 0 && valor >= min) {
    bonus = arred((valor * p) / 100);
    movCarteira(cli, bonus, 'bonus', `Bônus de ${p}% na recarga`);
  }
  salvar();
  return { bonus, saldo: cli.saldo };
}
export function ajustarSaldo(clienteId, valor, motivo) {
  const cli = cliente(clienteId);
  valor = arred(valor);
  if (!valor) throw new Error('Valor inválido');
  if (cli.saldo + valor < 0) throw new Error('O saldo não pode ficar negativo');
  movCarteira(cli, valor, 'ajuste', motivo || 'Ajuste manual');
  salvar();
}
export const extrato = (clienteId) => S.carteira.filter((m) => m.clienteId === clienteId).sort((a, b) => b.ts - a.ts);

// ---------- Indicadores ----------
export function mediasDiarias(lojaId, dias = 14) {
  const desde = Date.now() - dias * DIA;
  const m = {};
  for (const v of S.vendas) {
    if (v.status !== 'ok' || v.lojaId !== lojaId || v.ts < desde) continue;
    for (const i of v.itens) m[i.produtoId] = (m[i.produtoId] || 0) + i.qtd;
  }
  for (const k in m) m[k] /= dias;
  return m;
}

export function reposicao(lojaId) {
  const medias = mediasDiarias(lojaId);
  const cob = S.config.coberturaDias;
  return produtosAtivos()
    .map((p) => {
      const est = estoque(p.id, lojaId);
      const media = medias[p.id] || 0;
      const alvo = Math.max(p.minimo * 2, Math.ceil(media * cob));
      return { produto: p, estoque: est, minimo: p.minimo, media, alvo, sugerido: Math.max(0, alvo - est), critico: est <= p.minimo };
    })
    .filter((r) => r.sugerido > 0)
    .sort((a, b) => b.critico - a.critico || a.estoque / (a.alvo || 1) - b.estoque / (b.alvo || 1));
}

export function alertas() {
  const baixo = [];
  for (const l of lojasVenda())
    for (const p of produtosAtivos()) {
      const q = estoque(p.id, l.id);
      if (q <= p.minimo) baixo.push({ produto: p, loja: l, qtd: q });
    }
  const lim = S.config.diasAlertaValidade;
  const vencendo = [];
  const vencidos = [];
  for (const lt of S.lotes) {
    if (!lt.validade || !loja(lt.lojaId)?.ativa) continue;
    const d = diasAte(lt.validade);
    if (d < 0) vencidos.push({ ...lt, dias: d });
    else if (d <= lim) vencendo.push({ ...lt, dias: d });
  }
  return { baixo, vencendo, vencidos };
}

// ---------- Cadastros ----------
export function salvarProduto(d) {
  if (!d.nome) throw new Error('Informe o nome');
  if (!(d.preco > 0)) throw new Error('Informe o preço de venda');
  const ean = digitos(d.ean);
  if (ean && S.produtos.some((p) => p.id !== d.id && p.ean === ean)) throw new Error('Já existe produto com este código de barras');
  const campos = {
    nome: d.nome,
    ean,
    categoria: d.categoria || 'Outros',
    preco: arred(d.preco),
    custo: arred(d.custo || 0),
    minimo: Math.max(0, Math.floor(d.minimo || 0)),
    emoji: d.emoji || '📦',
    restrito18: !!d.restrito18,
    ativo: d.ativo !== false,
  };
  let p = d.id && produto(d.id);
  if (p) Object.assign(p, campos);
  else {
    p = { id: uid('p'), ...campos };
    S.produtos.push(p);
  }
  if (!S.categorias.includes(p.categoria)) S.categorias.push(p.categoria);
  salvar();
  return p;
}
export function eanInterno() {
  // Prefixo 2 = uso interno (não conflita com códigos de fabricantes).
  let base;
  do base = '2' + String(Math.floor(Math.random() * 1e11)).padStart(11, '0');
  while (S.produtos.some((p) => p.ean?.startsWith(base)));
  return base + digitoEan(base);
}
export function salvarLoja(d) {
  if (!d.nome) throw new Error('Informe o nome');
  let l = d.id && loja(d.id);
  const campos = { nome: d.nome, endereco: d.endereco || '', tipo: d.tipo === 'deposito' ? 'deposito' : 'loja', ativa: d.ativa !== false };
  if (l) Object.assign(l, campos);
  else {
    l = { id: uid('s'), ...campos };
    S.lojas.push(l);
  }
  salvar();
  return l;
}
export function salvarCupom(d) {
  const codigo = (d.codigo || '').toUpperCase().replace(/\s/g, '');
  if (!codigo) throw new Error('Informe o código');
  if (!(d.valor > 0)) throw new Error('Informe o valor do desconto');
  if (d.tipo === 'pct' && d.valor > 100) throw new Error('Percentual máximo é 100%');
  if (S.cupons.some((c) => c.id !== d.id && c.codigo === codigo)) throw new Error('Já existe cupom com este código');
  const campos = { codigo, tipo: d.tipo === 'valor' ? 'valor' : 'pct', valor: arred(d.valor), minimo: arred(d.minimo || 0), validade: d.validade || null, ativo: d.ativo !== false };
  let c = d.id && S.cupons.find((x) => x.id === d.id);
  if (c) Object.assign(c, campos);
  else S.cupons.push({ id: uid('k'), usos: 0, ...campos });
  salvar();
}
export function salvarConfig(d) {
  Object.assign(S.config, d);
  salvar();
}

export const exportar = () => JSON.stringify(S, null, 1);
export function importar(texto) {
  const novo = JSON.parse(texto);
  if (![1, 2].includes(novo?.versao) || !Array.isArray(novo.produtos)) throw new Error('Arquivo de backup inválido');
  migrar(novo);
  S = novo;
  salvar();
}
export function restaurarDemo() {
  S = semente();
  salvar();
}
export function comecarDoZero() {
  const config = { ...S.config };
  S = estrutura(config);
  S.lojas.push({ id: uid('s'), nome: 'Loja 1', endereco: '', tipo: 'loja', ativa: true });
  salvar();
}

// ---------- Dados de demonstração ----------
function digitoEan(d12) {
  let s = 0;
  for (let i = 0; i < 12; i++) s += +d12[i] * (i % 2 ? 3 : 1);
  return String((10 - (s % 10)) % 10);
}

function estrutura(config) {
  return {
    versao: 2,
    config: config || {
      nome: 'Mercado Danado de Bom',
      slogan: 'Pegou, passou, levou. Danado de bom!',
      pinAdmin: '1234',
      bonusRecargaPct: 5,
      bonusRecargaMin: 50,
      diasAlertaValidade: 7,
      coberturaDias: 7,
      idade: { modo: 'manual', ponteUrl: '', ponteChave: '', ponteChaveAdmin: '' },
    },
    geladeiras: [],
    acessos: [],
    lojas: [],
    categorias: [],
    produtos: [],
    lotes: [],
    movimentos: [],
    vendas: [],
    clientes: [],
    carteira: [],
    cupons: [],
    carrinhos: {},
    transferencias: [],
    seq: { venda: 1000 },
  };
}

function semente() {
  let x = 20261013;
  const cliente0 = (id) => s.clientes.find((c) => c.id === id);
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const s = estrutura();

  s.lojas = [
    { id: 'loja1', nome: 'Cond. Jardim das Palmeiras', endereco: 'Ponta Verde, Maceió/AL', tipo: 'loja', ativa: true },
    { id: 'loja2', nome: 'Empresarial Jatiúca', endereco: 'Jatiúca, Maceió/AL', tipo: 'loja', ativa: true },
    { id: 'loja3', nome: 'Cond. Vila Farol', endereco: 'Farol, Maceió/AL', tipo: 'loja', ativa: true },
    { id: 'dep', nome: 'Depósito Central', endereco: 'Tabuleiro, Maceió/AL', tipo: 'deposito', ativa: true },
  ];

  // [nome, categoria, preço, custo, mínimo, emoji, validade em dias (0 = não perecível), tem código de barras]
  const cat = [
    ['Água mineral 500ml', 'Bebidas', 2.5, 0.9, 12, '💧', 300],
    ['Água com gás 500ml', 'Bebidas', 3.5, 1.4, 6, '🫧', 300],
    ['Refrigerante cola lata 350ml', 'Bebidas', 5.5, 2.6, 12, '🥤', 180],
    ['Refrigerante guaraná lata 350ml', 'Bebidas', 5.0, 2.3, 12, '🥤', 180],
    ['Refrigerante cola 2L', 'Bebidas', 11.9, 6.8, 4, '🍾', 150],
    ['Suco de caju 1L', 'Bebidas', 8.9, 4.5, 4, '🧃', 120],
    ['Água de coco 1L', 'Bebidas', 12.9, 7.2, 4, '🥥', 60],
    ['Energético 250ml', 'Bebidas', 9.9, 5.1, 6, '⚡', 365],
    ['Chá gelado de limão 450ml', 'Bebidas', 7.5, 3.6, 4, '🍋', 180],
    ['Batata chips 80g', 'Snacks', 9.9, 4.9, 5, '🥔', 120],
    ['Amendoim torrado 150g', 'Snacks', 6.5, 3.0, 4, '🥜', 180],
    ['Biscoito recheado chocolate 130g', 'Snacks', 4.5, 2.1, 6, '🍪', 240],
    ['Barra de cereal', 'Snacks', 3.5, 1.5, 8, '🌾', 200],
    ['Chocolate ao leite 90g', 'Snacks', 8.9, 4.6, 5, '🍫', 240],
    ['Pipoca de micro-ondas 100g', 'Snacks', 4.9, 2.2, 4, '🍿', 200],
    ['Leite integral 1L', 'Laticínios', 5.9, 3.9, 8, '🥛', 90],
    ['Iogurte de morango 170g', 'Laticínios', 3.9, 1.9, 6, '🍓', 25],
    ['Queijo coalho 400g', 'Laticínios', 24.9, 15.5, 3, '🧀', 30],
    ['Manteiga com sal 200g', 'Laticínios', 13.9, 8.4, 3, '🧈', 60],
    ['Requeijão cremoso 200g', 'Laticínios', 9.9, 5.6, 3, '🫙', 45],
    ['Flocão de milho 500g', 'Mercearia', 3.2, 1.6, 6, '🌽', 240],
    ['Café torrado e moído 250g', 'Mercearia', 16.9, 10.8, 4, '☕', 300],
    ['Arroz branco 1kg', 'Mercearia', 6.9, 4.4, 4, '🍚', 365],
    ['Feijão carioca 1kg', 'Mercearia', 8.5, 5.6, 4, '🫘', 300],
    ['Macarrão espaguete 500g', 'Mercearia', 4.9, 2.6, 4, '🍝', 365],
    ['Goma de tapioca 500g', 'Mercearia', 7.5, 3.9, 4, '🫓', 90],
    ['Óleo de soja 900ml', 'Mercearia', 7.9, 5.3, 3, '🫗', 365],
    ['Pão de forma 500g', 'Padaria', 8.9, 5.0, 4, '🍞', 8],
    ['Bolo de macaxeira (fatia)', 'Padaria', 6.0, 2.4, 4, '🍰', 4, false],
    ['Pão de queijo congelado 400g', 'Congelados', 15.9, 8.9, 3, '🧆', 180],
    ['Pizza congelada mussarela', 'Congelados', 22.9, 13.5, 3, '🍕', 180],
    ['Sorvete 1,5L', 'Congelados', 24.9, 14.0, 2, '🍨', 240],
    ['Lasanha bolonhesa 600g', 'Congelados', 19.9, 11.9, 2, '🥘', 180],
    ['Creme dental 90g', 'Higiene', 5.9, 2.9, 3, '🪥', 0],
    ['Sabonete 85g', 'Higiene', 2.9, 1.2, 4, '🧼', 0],
    ['Papel higiênico 4 rolos', 'Higiene', 7.9, 4.6, 3, '🧻', 0],
    ['Detergente 500ml', 'Limpeza', 2.9, 1.5, 4, '🫧', 0],
    ['Sabão em pó 800g', 'Limpeza', 14.9, 9.1, 2, '🧺', 0],
    ['Água sanitária 1L', 'Limpeza', 4.5, 2.2, 2, '🧴', 0],
    ['Cerveja pilsen lata 350ml', 'Bebidas alcoólicas', 4.9, 2.6, 12, '🍺', 180, true, true],
    ['Cerveja puro malte long neck 330ml', 'Bebidas alcoólicas', 7.9, 4.3, 8, '🍻', 180, true, true],
    ['Drink pronto de limão 269ml', 'Bebidas alcoólicas', 8.9, 4.4, 6, '🍹', 240, true, true],
    ['Vinho tinto suave 750ml', 'Bebidas alcoólicas', 29.9, 16.5, 2, '🍷', 0, true, true],
  ];
  const h = hoje();
  s.produtos = cat.map(([nome, categoria, preco, custo, minimo, emoji, val, comEan = true, restrito = false], i) => {
    const base = '789' + '7316' + String(10000 + i * 37).slice(-5);
    return { id: 'p' + (i + 1), nome, categoria, preco, custo, minimo, emoji, ativo: true, restrito18: restrito, ean: comEan ? base + digitoEan(base) : '', _val: val };
  });
  s.categorias = [...new Set(s.produtos.map((p) => p.categoria))];

  // Lotes atuais
  for (const l of s.lojas) {
    for (const p of s.produtos) {
      const dep = l.tipo === 'deposito';
      let q = dep ? int(20, 90) : int(0, p.minimo * 3);
      if (!dep && rnd() < 0.12) q = int(0, p.minimo); // alguns em falta
      if (!q) continue;
      const val = p._val ? somarDias(h, int(p._val < 10 ? -1 : -2, p._val)) : null;
      // perecíveis curtos tendem a vencer logo
      const v2 = p._val && p._val <= 30 && rnd() < 0.5 ? somarDias(h, int(-2, 6)) : val;
      if (p._val && q > 3 && rnd() < 0.5) {
        const a = Math.ceil(q / 2);
        s.lotes.push({ id: uid('l'), produtoId: p.id, lojaId: l.id, qtd: a, validade: v2, entrada: Date.now() - int(1, 20) * DIA });
        s.lotes.push({ id: uid('l'), produtoId: p.id, lojaId: l.id, qtd: q - a, validade: somarDias(h, int(Math.min(10, p._val), p._val)), entrada: Date.now() - DIA });
      } else s.lotes.push({ id: uid('l'), produtoId: p.id, lojaId: l.id, qtd: q, validade: v2, entrada: Date.now() - int(1, 20) * DIA });
    }
  }
  s.produtos.forEach((p) => delete p._val);

  // Clientes
  const nomes = ['Ana Beatriz Lima', 'Carlos Eduardo Souza', 'Mariana Tenório', 'José Wellington Silva', 'Fernanda Calheiros', 'Rafael Brandão', 'Luana Vasconcelos', 'Pedro Henrique Melo', 'Juliana Albuquerque', 'Thiago Omena', 'Camila Gusmão', 'Bruno Cavalcante'];
  s.clientes = nomes.map((nome, i) => ({
    id: 'c' + (i + 1),
    nome,
    cpf: cpfComDv(String(100000000 + i * 123456789).slice(0, 9)),
    telefone: '8299' + String(1000000 + i * 734521).slice(0, 7),
    email: '',
    pin: '1234',
    saldo: 0,
    criado: Date.now() - int(30, 120) * DIA,
    ativo: true,
    consentimento: Date.now() - 30 * DIA,
    nascimento: `${1975 + int(0, 30)}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`,
    verificacao: { status: 'aprovado', fonte: 'manual', ts: Date.now() - 20 * DIA, obs: 'Documento conferido na loja' },
  }));
  // Um menor de idade (recusado) e uma verificação pendente, para demonstrar os bloqueios
  s.clientes[7].nascimento = somarDias(h, -(16 * 365 + 30));
  s.clientes[7].verificacao = { status: 'recusado', fonte: 'manual', ts: Date.now() - 10 * DIA, obs: 'Menor de 18 anos' };
  s.clientes[10].verificacao = { status: 'pendente', fonte: '', ts: 0, obs: '' };
  const adultos = s.clientes.filter((c) => c.verificacao.status === 'aprovado');
  const credita = (c, valor, tipo, descricao, ts, ref = null) => {
    c.saldo = arred(c.saldo + valor);
    s.carteira.push({ id: uid('w'), ts, clienteId: c.id, tipo, valor: arred(valor), saldoApos: c.saldo, descricao, ref });
  };
  // Primeiro cliente com dados fáceis para testar
  s.clientes[0].cpf = '11122233396';
  s.clientes[0].telefone = '82999990000';

  s.cupons = [
    { id: 'k1', codigo: 'BEMVINDO10', tipo: 'pct', valor: 10, minimo: 20, validade: null, ativo: true, usos: 0 },
    { id: 'k2', codigo: 'DANADO5', tipo: 'valor', valor: 5, minimo: 30, validade: somarDias(h, 30), ativo: true, usos: 0 },
  ];

  // Histórico de vendas (45 dias)
  const pesoHora = [0, 0, 0, 0, 0, 1, 3, 6, 6, 3, 2, 3, 6, 5, 2, 2, 3, 5, 8, 9, 8, 6, 3, 1];
  const horas = pesoHora.flatMap((w, hr) => Array(w).fill(hr));
  const lojasV = s.lojas.filter((l) => l.tipo === 'loja');
  const popular = s.produtos.flatMap((p) => Array(['Bebidas', 'Snacks'].includes(p.categoria) ? 4 : p.categoria === 'Laticínios' || p.categoria === 'Padaria' ? 3 : 1).fill(p));
  const vendas = [];
  for (let d = 45; d >= 0; d--) {
    const dia = new Date();
    dia.setHours(0, 0, 0, 0);
    dia.setDate(dia.getDate() - d);
    const fds = [0, 6].includes(dia.getDay());
    for (const [li, l] of lojasV.entries()) {
      const n = int(6, 14) + (fds ? 5 : 0) + (l.id === 'loja2' && fds ? -8 : 0) + li;
      for (let k = 0; k < n; k++) {
        const hr = horas[int(0, horas.length - 1)];
        const ts = dia.getTime() + hr * 3600e3 + int(0, 3599) * 1e3;
        if (ts > Date.now()) continue;
        const itens = {};
        for (let j = int(1, 4); j > 0; j--) {
          const p = popular[int(0, popular.length - 1)];
          itens[p.id] = (itens[p.id] || 0) + (rnd() < 0.2 ? 2 : 1);
        }
        vendas.push({ ts, lojaId: l.id, itens });
      }
    }
  }
  vendas.sort((a, b) => a.ts - b.ts);
  for (const v of vendas) {
    const linhas = Object.entries(v.itens).map(([pid, qtd]) => {
      const p = s.produtos.find((x) => x.id === pid);
      return { produtoId: pid, nome: p.nome, qtd, preco: p.preco, custo: p.custo, lotes: [], falta: 0 };
    });
    const subtotal = arred(linhas.reduce((a, l) => a + l.preco * l.qtd, 0));
    const r = rnd();
    const pagamento = r < 0.33 ? 'credito' : r < 0.62 ? 'debito' : 'saldo';
    let desconto = 0;
    let cupom = null;
    if (subtotal >= 20 && rnd() < 0.06) {
      cupom = 'BEMVINDO10';
      desconto = arred(subtotal * 0.1);
      s.cupons[0].usos++;
    }
    const total = arred(subtotal - desconto);
    const venda = { id: uid('v'), numero: ++s.seq.venda, ts: v.ts, lojaId: v.lojaId, canal: rnd() < 0.7 ? 'totem' : 'celular', itens: linhas, subtotal, desconto, cupom, total, pagamento, autorizacao: null, clienteId: null, status: 'ok' };
    const temRestrito = linhas.some((l) => s.produtos.find((x) => x.id === l.produtoId).restrito18);
    if (temRestrito) venda.clienteId = adultos[int(0, adultos.length - 1)].id;
    if (pagamento === 'saldo') {
      const c = temRestrito ? cliente0(venda.clienteId) : s.clientes[int(0, s.clientes.length - 1)];
      if (c.saldo < total) credita(c, [50, 100, 100, 200][int(0, 3)], 'recarga', 'Recarga (cartão)', v.ts - 3600e3);
      if (c.saldo < total) credita(c, 100, 'recarga', 'Recarga (cartão)', v.ts - 3500e3);
      credita(c, -total, 'compra', `Compra nº ${venda.numero} – ${s.lojas.find((l) => l.id === v.lojaId).nome}`, v.ts, venda.id);
      venda.clienteId = c.id;
    }
    s.vendas.push(venda);
  }

  // Geladeiras com trava e histórico de aberturas
  s.geladeiras = [
    { id: 'g1', lojaId: 'loja1', nome: 'Geladeira de bebidas', apenasMaiores: true, ativa: true, trava: { modo: 'simulada', webhookUrl: '', ponteId: 'g1', segundos: 8 } },
    { id: 'g2', lojaId: 'loja3', nome: 'Geladeira de cervejas', apenasMaiores: true, ativa: true, trava: { modo: 'simulada', webhookUrl: '', ponteId: 'g2', segundos: 8 } },
  ];
  for (let d = 14; d >= 0; d--) {
    for (let k = int(1, 5); k > 0; k--) {
      const g = s.geladeiras[int(0, 1)];
      const ts = inicioDoDia() - d * DIA + int(17, 22) * 3600e3 + int(0, 3599) * 1e3;
      if (ts > Date.now()) continue;
      const negado = rnd() < 0.12;
      const c = negado ? s.clientes[rnd() < 0.5 ? 7 : 10] : adultos[int(0, adultos.length - 1)];
      s.acessos.push({ id: uid('a'), ts, geladeiraId: g.id, lojaId: g.lojaId, clienteId: c.id, canal: rnd() < 0.6 ? 'totem' : 'celular', ok: !negado, motivo: negado ? (c.verificacao.status === 'recusado' ? 'Menor de 18 anos' : 'Idade não verificada') : 'Destravada' });
    }
  }
  s.acessos.sort((a, b) => a.ts - b.ts);
  return s;
}
