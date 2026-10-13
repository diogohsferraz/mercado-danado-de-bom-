// Painel administrativo: indicadores, vendas, produtos, estoque, validade, reposição, clientes, cupons, lojas e configurações.
import * as D from './db.js';
import * as Sess from './sessao.js';
import { $, $$, esc, brl, num, pct, toast, modal, confirmar, lerForm, baixar, csv, grafBarras, barraHoriz, logoSVG, fmtData, fmtDataHora, fmtIso, qrcode } from './ui.js';

const DIA = 864e5;
const SECOES = [
  ['painel', '📊', 'Painel'],
  ['vendas', '💰', 'Vendas e relatórios'],
  ['produtos', '🏷️', 'Produtos'],
  ['estoque', '📦', 'Estoque'],
  ['validade', '⏰', 'Validade'],
  ['reposicao', '🚚', 'Reposição'],
  ['clientes', '👥', 'Clientes e carteira'],
  ['cupons', '🎟️', 'Cupons'],
  ['lojas', '🏪', 'Lojas e totens'],
  ['config', '⚙️', 'Configurações'],
];
const PAG = { credito: 'Crédito', debito: 'Débito', saldo: 'Carteira' };
const COR_PAG = { credito: '#FF6B00', debito: '#111111', saldo: '#8DBF00' };
const TIPO_MOV = { entrada: 'Entrada', venda: 'Venda', perda: 'Perda', ajuste: 'Inventário', transf_saida: 'Transferência (saída)', transf_entrada: 'Transferência (entrada)', estorno: 'Estorno' };

// Filtros lembrados durante a sessão
const F = (() => {
  const padrao = { periodo: '30', de: '', ate: '', lojaVendas: '', busca: '', cat: '', estLoja: 'loja1', soBaixo: false, valLoja: '', valJanela: '7', repLoja: 'loja1', repOrigem: 'dep', cliBusca: '' };
  try {
    return { ...padrao, ...JSON.parse(sessionStorage.getItem('mddb:filtros') || '{}') };
  } catch {
    return padrao;
  }
})();
const lembrar = () => {
  try {
    sessionStorage.setItem('mddb:filtros', JSON.stringify(F));
  } catch {
    /* ignora */
  }
};

export function renderAdmin(root, secao = 'painel') {
  if (!Sess.adminLogado()) return telaLogin(root, secao);
  if (!SECOES.some((s) => s[0] === secao)) secao = 'painel';
  const al = D.alertas();
  root.innerHTML = `
    <div class="adm">
      <aside class="adm-nav">
        <a class="adm-marca" href="#/">${logoSVG(34)}<span><b>${esc(D.cfg().nome)}</b><small>Administração</small></span></a>
        <nav>${SECOES.map(([id, ic, nome]) => {
          const n = id === 'estoque' || id === 'reposicao' ? (id === 'reposicao' ? al.baixo.length : 0) : id === 'validade' ? al.vencidos.length + al.vencendo.length : 0;
          return `<a href="#/admin/${id}" class="${id === secao ? 'ativo' : ''}"><span>${ic}</span>${nome}${n ? `<em>${n}</em>` : ''}</a>`;
        }).join('')}</nav>
        <button class="link sair" data-a="sair">Sair do painel</button>
      </aside>
      <main class="adm-main"></main>
    </div>`;
  $('[data-a=sair]', root).onclick = () => {
    Sess.sairAdmin();
    location.hash = '#/';
  };
  const main = $('.adm-main', root);
  const atualizar = VIEWS[secao](main) || (() => {});
  const off = D.aoMudar(() => {
    atualizar();
    const al2 = D.alertas();
    $$('.adm-nav a', root).forEach((a) => {
      const id = a.getAttribute('href').split('/').pop();
      const n = id === 'reposicao' ? al2.baixo.length : id === 'validade' ? al2.vencidos.length + al2.vencendo.length : 0;
      a.querySelector('em')?.remove();
      if (n) a.insertAdjacentHTML('beforeend', `<em>${n}</em>`);
    });
  });
  return off;
}

function telaLogin(root, secao) {
  root.innerHTML = `
    <div class="pag-vazia">
      ${logoSVG(72)}
      <h2>Área do administrador</h2>
      <form class="cartao form-col login-adm">
        <label>PIN do administrador<input name="pin" type="password" inputmode="numeric" required autofocus></label>
        <button class="btn primary grande bloco">Entrar</button>
        <p class="muted small">PIN inicial: <b>1234</b>. Troque em Configurações.</p>
      </form>
      <a class="link" href="#/">‹ Voltar</a>
    </div>`;
  $('form', root).addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      Sess.entrarAdmin(e.target.pin.value);
      renderAdmin(root, secao);
    } catch (err) {
      toast(err.message, 'erro');
    }
  });
}

// ---------- Utilidades ----------
const cab = (titulo, acoes = '') => `<div class="adm-cab"><h1>${titulo}</h1><div class="acoes">${acoes}</div></div>`;
const kpi = (rotulo, valor, sub = '', cls = '') => `<div class="kpi ${cls}"><small>${rotulo}</small><b>${valor}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
const selLoja = (nome, valor, { todas = false, deposito = true, rotuloTodas = 'Todas as lojas' } = {}) =>
  `<select name="${nome}" aria-label="Loja">${todas ? `<option value="">${rotuloTodas}</option>` : ''}${D.lojasTodas()
    .filter((l) => deposito || l.tipo === 'loja')
    .map((l) => `<option value="${l.id}" ${l.id === valor ? 'selected' : ''}>${l.tipo === 'deposito' ? '🏭 ' : ''}${esc(l.nome)}</option>`)
    .join('')}</select>`;
const garantirLoja = (chave, deposito = true) => {
  const lojas = D.lojasTodas().filter((l) => deposito || l.tipo === 'loja');
  if (!lojas.some((l) => l.id === F[chave])) F[chave] = lojas[0]?.id || '';
};
const badgeDias = (d) => {
  if (d === Infinity) return '<span class="badge">sem validade</span>';
  if (d < 0) return `<span class="badge vermelho">vencido há ${-d} d</span>`;
  if (d === 0) return '<span class="badge vermelho">vence hoje</span>';
  if (d <= D.cfg().diasAlertaValidade) return `<span class="badge amarelo">${d} d</span>`;
  return `<span class="badge">${d} d</span>`;
};
const optsProdutos = (sel = '') =>
  D.produtosAtivos()
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${p.emoji} ${esc(p.nome)}</option>`)
    .join('');

function resumo(vendas) {
  let fat = 0;
  let lucro = 0;
  let desc = 0;
  let itens = 0;
  for (const v of vendas) {
    fat += v.total;
    desc += v.desconto || 0;
    for (const i of v.itens) {
      lucro += (i.preco - i.custo) * i.qtd;
      itens += i.qtd;
    }
  }
  lucro -= desc;
  return { fat, n: vendas.length, ticket: vendas.length ? fat / vendas.length : 0, lucro, margem: fat ? lucro / fat : 0, desc, itens };
}

function periodo() {
  const ini = D.inicioDoDia();
  const p = F.periodo;
  if (p === 'hoje') return { desde: ini, ate: ini + DIA, dias: 1, rotulo: 'Hoje' };
  if (p === 'ontem') return { desde: ini - DIA, ate: ini, dias: 1, rotulo: 'Ontem' };
  if (p === 'mes') {
    const d = new Date();
    const desde = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    return { desde, ate: ini + DIA, dias: Math.round((ini + DIA - desde) / DIA), rotulo: 'Este mês' };
  }
  if (p === 'custom' && F.de && F.ate) {
    const [a, b] = [F.de, F.ate].map((s) => new Date(s + 'T00:00').getTime()).sort((x, y) => x - y);
    return { desde: a, ate: b + DIA, dias: Math.round((b + DIA - a) / DIA), rotulo: `${fmtIso(F.de)} a ${fmtIso(F.ate)}` };
  }
  const n = +p || 30;
  return { desde: ini - (n - 1) * DIA, ate: ini + DIA, dias: n, rotulo: `Últimos ${n} dias` };
}

function seriePorDia(vendas, desde, dias) {
  const arr = Array.from({ length: dias }, (_, i) => {
    const d = new Date(desde + i * DIA + 3600e3);
    return { rotulo: d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }), curto: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), valor: 0 };
  });
  for (const v of vendas) {
    const i = Math.floor((D.inicioDoDia(v.ts) - desde) / DIA + 0.01);
    if (arr[i]) arr[i].valor += v.total;
  }
  return arr;
}
function seriePorHora(vendas) {
  const arr = Array.from({ length: 24 }, (_, h) => ({ rotulo: `${h}h`, curto: `${h}h`, valor: 0 }));
  for (const v of vendas) arr[new Date(v.ts).getHours()].valor += v.total;
  return arr;
}
function topProdutos(vendas, n = 10) {
  const m = {};
  for (const v of vendas)
    for (const i of v.itens) {
      const r = (m[i.produtoId] ||= { produtoId: i.produtoId, nome: i.nome, qtd: 0, receita: 0, lucro: 0 });
      r.qtd += i.qtd;
      r.receita += i.preco * i.qtd;
      r.lucro += (i.preco - i.custo) * i.qtd;
    }
  return Object.values(m)
    .sort((a, b) => b.receita - a.receita)
    .slice(0, n);
}
function agrupar(vendas, chave) {
  const m = {};
  for (const v of vendas) {
    const k = chave(v);
    (m[k] ||= []).push(v);
  }
  return m;
}

// ================= VIEWS =================
const VIEWS = {
  // ---------- Painel ----------
  painel(main) {
    main.innerHTML = cab('Painel', `<span class="muted">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>`) + '<div data-c></div>';
    const c = $('[data-c]', main);
    const desenhar = () => {
      const ini = D.inicioDoDia();
      const v30 = D.vendasNoPeriodo({ desde: ini - 29 * DIA });
      const vh = v30.filter((v) => v.ts >= ini);
      const vOntem = D.vendasNoPeriodo({ desde: ini - DIA, ate: ini - DIA + (Date.now() - ini) });
      const r30 = resumo(v30);
      const rh = resumo(vh);
      const ro = resumo(vOntem);
      const al = D.alertas();
      const saldoCarteiras = D.db().clientes.reduce((a, x) => a + x.saldo, 0);
      const varHoje = ro.fat ? (rh.fat - ro.fat) / ro.fat : 0;
      const porLoja = D.lojasVenda().map((l) => {
        const vs = v30.filter((v) => v.lojaId === l.id);
        const r = resumo(vs);
        return { l, r, hoje: resumo(vs.filter((v) => v.ts >= ini)).fat, baixo: al.baixo.filter((b) => b.loja.id === l.id).length, venc: al.vencidos.filter((x) => x.lojaId === l.id).length };
      });
      c.innerHTML = `
        <div class="kpis">
          ${kpi('Faturamento hoje', brl(rh.fat), `${rh.n} ${rh.n === 1 ? 'venda' : 'vendas'} · ${ro.fat ? `${varHoje >= 0 ? '▲' : '▼'} ${pct(Math.abs(varHoje))} vs. ontem até agora` : 'sem vendas ontem até agora'}`, 'destaque')}
          ${kpi('Faturamento 30 dias', brl(r30.fat), `${num(r30.n)} vendas`)}
          ${kpi('Ticket médio (30 d)', brl(r30.ticket), `${num(r30.itens / (r30.n || 1), 1)} itens por compra`)}
          ${kpi('Lucro bruto (30 d)', brl(r30.lucro), `margem ${pct(r30.margem)}`)}
        </div>
        <div class="alertas">
          <a class="alerta ${al.baixo.length ? 'laranja' : ''}" href="#/admin/reposicao"><b>${al.baixo.length}</b><span>itens no mínimo ou zerados nas lojas</span></a>
          <a class="alerta ${al.vencendo.length ? 'amarelo' : ''}" href="#/admin/validade"><b>${al.vencendo.length}</b><span>lotes vencendo em até ${D.cfg().diasAlertaValidade} dias</span></a>
          <a class="alerta ${al.vencidos.length ? 'vermelho' : ''}" href="#/admin/validade"><b>${al.vencidos.length}</b><span>lotes vencidos para retirar</span></a>
          <a class="alerta" href="#/admin/clientes"><b>${brl(saldoCarteiras)}</b><span>de saldo em carteiras de clientes</span></a>
        </div>
        <div class="grade-2">
          <section class="cartao"><h3>Faturamento por dia · 30 dias</h3>${grafBarras(seriePorDia(v30, ini - 29 * DIA, 30), { cada: 5 })}</section>
          <section class="cartao"><h3>Mais vendidos · 30 dias</h3>${barraHoriz(topProdutos(v30, 6).map((t) => ({ rotulo: t.nome, valor: t.receita })))}</section>
        </div>
        <section class="cartao"><h3>Lojas</h3>
          <div class="tabela-wrap"><table class="tabela">
            <thead><tr><th>Loja</th><th class="n">Hoje</th><th class="n">30 dias</th><th class="n">Vendas</th><th class="n">Ticket</th><th class="n">Margem</th><th class="n">Alertas</th><th></th></tr></thead>
            <tbody>${porLoja
              .map(
                (x) => `<tr><td><b>${esc(x.l.nome)}</b></td><td class="n">${brl(x.hoje)}</td><td class="n">${brl(x.r.fat)}</td><td class="n">${num(x.r.n)}</td><td class="n">${brl(x.r.ticket)}</td><td class="n">${pct(x.r.margem)}</td>
                <td class="n">${x.baixo ? `<span class="badge laranja">${x.baixo} baixo</span>` : ''} ${x.venc ? `<span class="badge vermelho">${x.venc} vencido</span>` : ''}${!x.baixo && !x.venc ? '<span class="badge verde">ok</span>' : ''}</td>
                <td class="n"><a class="btn mini ghost" href="#/totem/${x.l.id}" target="_blank" rel="noopener">Totem ↗</a></td></tr>`,
              )
              .join('')}</tbody>
          </table></div>
        </section>`;
    };
    desenhar();
    return desenhar;
  },

  // ---------- Vendas e relatórios ----------
  vendas(main) {
    main.innerHTML =
      cab('Vendas e relatórios', '<button class="btn ghost" data-a="csv-vendas">⬇ Vendas (CSV)</button><button class="btn ghost" data-a="csv-itens">⬇ Itens vendidos (CSV)</button>') +
      `<div class="filtros">
        <select name="periodo" aria-label="Período">${[['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['mes', 'Este mês'], ['90', 'Últimos 90 dias'], ['custom', 'Personalizado…']]
          .map(([v, t]) => `<option value="${v}" ${F.periodo === v ? 'selected' : ''}>${t}</option>`)
          .join('')}</select>
        <span class="custom" ${F.periodo === 'custom' ? '' : 'hidden'}><input type="date" name="de" value="${F.de}" aria-label="De"> a <input type="date" name="ate" value="${F.ate}" aria-label="Até"></span>
        ${selLoja('lojaVendas', F.lojaVendas, { todas: true, deposito: false })}
      </div><div data-c></div>`;
    const c = $('[data-c]', main);
    const filtros = $('.filtros', main);
    filtros.addEventListener('change', (e) => {
      F[e.target.name] = e.target.value;
      $('.custom', filtros).hidden = F.periodo !== 'custom';
      if (F.periodo === 'custom' && (!F.de || !F.ate)) return;
      lembrar();
      desenhar();
    });
    const lista = () => {
      const p = periodo();
      return { p, vs: D.vendasNoPeriodo({ desde: p.desde, ate: p.ate, lojaId: F.lojaVendas }) };
    };
    $('[data-a=csv-vendas]', main).onclick = () => {
      const { vs } = lista();
      baixar(
        `vendas_${D.hoje()}.csv`,
        csv([
          ['Número', 'Data', 'Hora', 'Loja', 'Canal', 'Pagamento', 'Cliente', 'Itens', 'Subtotal', 'Desconto', 'Cupom', 'Total'],
          ...vs.map((v) => {
            const d = new Date(v.ts);
            return [v.numero, d.toLocaleDateString('pt-BR'), d.toLocaleTimeString('pt-BR'), D.loja(v.lojaId)?.nome, v.canal, PAG[v.pagamento], D.cliente(v.clienteId)?.nome || '', v.itens.reduce((a, i) => a + i.qtd, 0), v.subtotal, v.desconto, v.cupom || '', v.total];
          }),
        ]),
      );
    };
    $('[data-a=csv-itens]', main).onclick = () => {
      const { vs } = lista();
      const linhas = [['Número', 'Data', 'Loja', 'Produto', 'Categoria', 'Qtd', 'Preço', 'Custo', 'Total', 'Lucro bruto']];
      for (const v of vs)
        for (const i of v.itens) linhas.push([v.numero, new Date(v.ts).toLocaleDateString('pt-BR'), D.loja(v.lojaId)?.nome, i.nome, D.produto(i.produtoId)?.categoria || '', i.qtd, i.preco, i.custo, D.arred(i.preco * i.qtd), D.arred((i.preco - i.custo) * i.qtd)]);
      baixar(`itens_vendidos_${D.hoje()}.csv`, csv(linhas));
    };
    const desenhar = () => {
      const { p, vs } = lista();
      const r = resumo(vs);
      const porPag = agrupar(vs, (v) => v.pagamento);
      const porCanal = agrupar(vs, (v) => v.canal);
      const porLoja = agrupar(vs, (v) => v.lojaId);
      const cats = {};
      for (const v of vs) for (const i of v.itens) {
        const k = D.produto(i.produtoId)?.categoria || 'Outros';
        cats[k] = (cats[k] || 0) + i.preco * i.qtd;
      }
      const top = topProdutos(vs, 10);
      const estornadas = D.db().vendas.filter((v) => v.status === 'estornada' && v.ts >= p.desde && v.ts < p.ate && (!F.lojaVendas || v.lojaId === F.lojaVendas));
      const recentes = [...vs, ...estornadas].sort((a, b) => b.ts - a.ts).slice(0, 60);
      c.innerHTML = `
        <p class="muted">${esc(p.rotulo)} · ${F.lojaVendas ? esc(D.loja(F.lojaVendas)?.nome) : 'todas as lojas'}</p>
        <div class="kpis">
          ${kpi('Faturamento', brl(r.fat), `${num(r.n)} vendas`, 'destaque')}
          ${kpi('Ticket médio', brl(r.ticket), `${num(r.itens)} itens vendidos`)}
          ${kpi('Lucro bruto', brl(r.lucro), `margem ${pct(r.margem)}`)}
          ${kpi('Descontos', brl(r.desc), `${estornadas.length} estornos no período`)}
        </div>
        <div class="grade-2">
          <section class="cartao"><h3>${p.dias > 1 ? 'Faturamento por dia' : 'Faturamento por hora'}</h3>${p.dias > 1 ? grafBarras(seriePorDia(vs, p.desde, p.dias), { cada: Math.ceil(p.dias / 10) }) : grafBarras(seriePorHora(vs), { cada: 3 })}</section>
          <section class="cartao"><h3>Horários de pico</h3>${grafBarras(seriePorHora(vs), { cada: 3, cor: 'var(--preto)' })}</section>
        </div>
        <div class="grade-3">
          <section class="cartao"><h3>Por forma de pagamento</h3>${barraHoriz(Object.entries(porPag).map(([k, l]) => ({ rotulo: `${PAG[k]} (${l.length})`, valor: resumo(l).fat, cor: COR_PAG[k] })))}</section>
          <section class="cartao"><h3>Por canal</h3>${barraHoriz(Object.entries(porCanal).map(([k, l]) => ({ rotulo: `${k === 'totem' ? 'Totem' : 'Celular'} (${l.length})`, valor: resumo(l).fat })))}</section>
          <section class="cartao"><h3>Por categoria</h3>${barraHoriz(Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ rotulo: k, valor: v })))}</section>
        </div>
        ${
          F.lojaVendas
            ? ''
            : `<section class="cartao"><h3>Comparativo entre lojas</h3><div class="tabela-wrap"><table class="tabela"><thead><tr><th>Loja</th><th class="n">Faturamento</th><th class="n">Vendas</th><th class="n">Ticket</th><th class="n">Lucro bruto</th><th class="n">Margem</th><th class="n">% do total</th></tr></thead><tbody>${D.lojasVenda()
                .map((l) => {
                  const x = resumo(porLoja[l.id] || []);
                  return `<tr><td>${esc(l.nome)}</td><td class="n">${brl(x.fat)}</td><td class="n">${num(x.n)}</td><td class="n">${brl(x.ticket)}</td><td class="n">${brl(x.lucro)}</td><td class="n">${pct(x.margem)}</td><td class="n">${pct(r.fat ? x.fat / r.fat : 0)}</td></tr>`;
                })
                .join('')}</tbody></table></div></section>`
        }
        <section class="cartao"><h3>Top 10 produtos</h3><div class="tabela-wrap"><table class="tabela"><thead><tr><th>#</th><th>Produto</th><th class="n">Qtd</th><th class="n">Receita</th><th class="n">Lucro bruto</th><th class="n">Margem</th></tr></thead><tbody>${
          top.map((t, i) => `<tr><td>${i + 1}</td><td>${esc(t.nome)}</td><td class="n">${num(t.qtd)}</td><td class="n">${brl(t.receita)}</td><td class="n">${brl(t.lucro)}</td><td class="n">${pct(t.receita ? t.lucro / t.receita : 0)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Sem vendas.</td></tr>'
        }</tbody></table></div></section>
        <section class="cartao"><h3>Vendas recentes</h3><div class="tabela-wrap"><table class="tabela"><thead><tr><th>Nº</th><th>Data</th><th>Loja</th><th>Canal</th><th>Pagamento</th><th>Cliente</th><th class="n">Total</th><th></th></tr></thead><tbody>${
          recentes
            .map(
              (v) => `<tr class="${v.status === 'estornada' ? 'riscado' : ''}"><td>${v.numero}</td><td>${fmtDataHora(v.ts)}</td><td>${esc(D.loja(v.lojaId)?.nome)}</td><td>${v.canal === 'totem' ? 'Totem' : 'Celular'}</td><td>${PAG[v.pagamento]}</td><td>${esc(D.cliente(v.clienteId)?.nome || '—')}</td><td class="n">${brl(v.total)}</td><td class="n"><button class="btn mini ghost" data-venda="${v.id}">Ver</button></td></tr>`,
            )
            .join('') || '<tr><td colspan="8" class="muted">Sem vendas.</td></tr>'
        }</tbody></table></div></section>`;
      $$('[data-venda]', c).forEach((b) => (b.onclick = () => detalheVenda(b.dataset.venda)));
    };
    desenhar();
    return desenhar;
  },

  // ---------- Produtos ----------
  produtos(main) {
    main.innerHTML =
      cab('Produtos', '<button class="btn ghost" data-a="csv">⬇ CSV</button><button class="btn primary" data-a="novo">+ Novo produto</button>') +
      `<div class="filtros"><input type="search" name="busca" placeholder="Buscar por nome ou código" value="${esc(F.busca)}" aria-label="Buscar"><select name="cat" aria-label="Categoria"><option value="">Todas as categorias</option>${D.db()
        .categorias.map((c) => `<option ${c === F.cat ? 'selected' : ''}>${esc(c)}</option>`)
        .join('')}</select></div><div data-c></div>`;
    const c = $('[data-c]', main);
    $('[name=busca]', main).addEventListener('input', (e) => {
      F.busca = e.target.value;
      lembrar();
      desenhar();
    });
    $('[name=cat]', main).addEventListener('change', (e) => {
      F.cat = e.target.value;
      lembrar();
      desenhar();
    });
    $('[data-a=novo]', main).onclick = () => formProduto();
    $('[data-a=csv]', main).onclick = () =>
      baixar(
        `produtos_${D.hoje()}.csv`,
        csv([['Nome', 'Código de barras', 'Categoria', 'Preço', 'Custo', 'Margem', 'Estoque mínimo', 'Estoque total', 'Ativo'], ...D.db().produtos.map((p) => [p.nome, p.ean, p.categoria, p.preco, p.custo, p.preco ? D.arred(((p.preco - p.custo) / p.preco) * 100) + '%' : '', p.minimo, D.estoqueTotal(p.id), p.ativo ? 'sim' : 'não'])]),
      );
    const desenhar = () => {
      const q = F.busca.trim().toLowerCase();
      const lista = D.db()
        .produtos.filter((p) => (!F.cat || p.categoria === F.cat) && (!q || p.nome.toLowerCase().includes(q) || (p.ean || '').includes(q)))
        .sort((a, b) => b.ativo - a.ativo || a.nome.localeCompare(b.nome));
      c.innerHTML = `<p class="muted">${lista.length} produtos</p><div class="tabela-wrap"><table class="tabela">
        <thead><tr><th></th><th>Produto</th><th>Código de barras</th><th>Categoria</th><th class="n">Preço</th><th class="n">Custo</th><th class="n">Margem</th><th class="n">Mín.</th><th class="n">Estoque total</th><th></th></tr></thead>
        <tbody>${lista
          .map(
            (p) => `<tr class="${p.ativo ? '' : 'inativo'}"><td class="emoji">${p.emoji}</td><td><b>${esc(p.nome)}</b>${p.ativo ? '' : ' <span class="badge">inativo</span>'}</td><td class="mono">${esc(p.ean || '—')}</td><td>${esc(p.categoria)}</td><td class="n">${brl(p.preco)}</td><td class="n">${brl(p.custo)}</td><td class="n">${pct(p.preco ? (p.preco - p.custo) / p.preco : 0)}</td><td class="n">${p.minimo}</td><td class="n">${num(D.estoqueTotal(p.id))}</td><td class="n"><button class="btn mini ghost" data-ed="${p.id}">Editar</button></td></tr>`,
          )
          .join('')}</tbody></table></div>`;
      $$('[data-ed]', c).forEach((b) => (b.onclick = () => formProduto(D.produto(b.dataset.ed))));
    };
    desenhar();
    return desenhar;
  },

  // ---------- Estoque ----------
  estoque(main) {
    garantirLoja('estLoja');
    main.innerHTML =
      cab('Estoque', '<button class="btn ghost" data-a="movs">Movimentações</button><button class="btn ghost" data-a="csv">⬇ CSV</button><button class="btn primary" data-a="entrada">+ Entrada de mercadoria</button>') +
      `<div class="filtros">${selLoja('estLoja', F.estLoja)}<input type="search" name="busca" placeholder="Buscar produto" value="${esc(F.busca)}" aria-label="Buscar"><label class="check"><input type="checkbox" name="soBaixo" ${F.soBaixo ? 'checked' : ''}> Só no mínimo / zerados</label></div><div data-c></div>`;
    const c = $('[data-c]', main);
    const filtros = $('.filtros', main);
    filtros.addEventListener('input', (e) => {
      const t = e.target;
      F[t.name] = t.type === 'checkbox' ? t.checked : t.value;
      lembrar();
      desenhar();
    });
    $('[data-a=entrada]', main).onclick = () => formEntrada(F.estLoja);
    $('[data-a=movs]', main).onclick = () => movimentacoes(F.estLoja);
    $('[data-a=csv]', main).onclick = () => {
      const l = D.loja(F.estLoja);
      baixar(
        `estoque_${l.nome.replace(/\W+/g, '_')}_${D.hoje()}.csv`,
        csv([['Produto', 'Código', 'Categoria', 'Estoque', 'Mínimo', 'Próxima validade', 'Custo unit.', 'Valor em estoque (custo)'], ...D.produtosAtivos().map((p) => {
          const q = D.estoque(p.id, l.id);
          return [p.nome, p.ean, p.categoria, q, p.minimo, fmtIso(D.proximaValidade(p.id, l.id)), p.custo, D.arred(q * p.custo)];
        })]),
      );
    };
    const desenhar = () => {
      const lojaId = F.estLoja;
      const ehDep = D.loja(lojaId)?.tipo === 'deposito';
      const q = F.busca.trim().toLowerCase();
      let valorCusto = 0;
      let valorVenda = 0;
      let unidades = 0;
      const linhas = D.produtosAtivos()
        .map((p) => {
          const est = D.estoque(p.id, lojaId);
          valorCusto += est * p.custo;
          valorVenda += est * p.preco;
          unidades += est;
          return { p, est, val: D.proximaValidade(p.id, lojaId) };
        })
        .filter((r) => (!q || r.p.nome.toLowerCase().includes(q) || (r.p.ean || '').includes(q)) && (!F.soBaixo || r.est <= r.p.minimo))
        .sort((a, b) => a.p.categoria.localeCompare(b.p.categoria) || a.p.nome.localeCompare(b.p.nome));
      c.innerHTML = `
        <div class="kpis">${kpi('Unidades em estoque', num(unidades))}${kpi('Valor a custo', brl(valorCusto))}${kpi('Valor a preço de venda', brl(valorVenda))}${kpi('Itens no mínimo', num(D.produtosAtivos().filter((p) => D.estoque(p.id, lojaId) <= p.minimo).length), ehDep ? 'depósito não gera alerta' : '')}</div>
        <div class="tabela-wrap"><table class="tabela">
          <thead><tr><th></th><th>Produto</th><th>Categoria</th><th class="n">Estoque</th><th class="n">Mínimo</th><th>Próx. validade</th><th>Situação</th><th class="n">Ações</th></tr></thead>
          <tbody>${linhas
            .map(({ p, est, val }) => {
              const sit = est === 0 ? '<span class="badge vermelho">zerado</span>' : est <= p.minimo ? '<span class="badge laranja">no mínimo</span>' : '<span class="badge verde">ok</span>';
              return `<tr><td class="emoji">${p.emoji}</td><td><b>${esc(p.nome)}</b></td><td>${esc(p.categoria)}</td><td class="n"><b>${est}</b></td><td class="n">${p.minimo}</td><td>${val ? `${fmtIso(val)} ${badgeDias(D.diasAte(val))}` : '—'}</td><td>${sit}</td>
                <td class="n nowrap"><button class="btn mini ghost" data-ent="${p.id}">+ Entrada</button><button class="btn mini ghost" data-per="${p.id}">− Perda</button><button class="btn mini ghost" data-inv="${p.id}">Contagem</button></td></tr>`;
            })
            .join('')}</tbody></table></div>`;
      $$('[data-ent]', c).forEach((b) => (b.onclick = () => formEntrada(lojaId, b.dataset.ent)));
      $$('[data-per]', c).forEach((b) => (b.onclick = () => formPerda(lojaId, b.dataset.per)));
      $$('[data-inv]', c).forEach((b) => (b.onclick = () => formInventario(lojaId, b.dataset.inv)));
    };
    desenhar();
    return desenhar;
  },

  // ---------- Validade ----------
  validade(main) {
    main.innerHTML =
      cab('Controle de validade') +
      `<div class="filtros">${selLoja('valLoja', F.valLoja, { todas: true })}<select name="valJanela" aria-label="Janela">${[['vencidos', 'Somente vencidos'], ['7', 'Vencidos + até 7 dias'], ['15', 'Vencidos + até 15 dias'], ['30', 'Vencidos + até 30 dias'], ['todos', 'Todos os lotes com validade']]
        .map(([v, t]) => `<option value="${v}" ${F.valJanela === v ? 'selected' : ''}>${t}</option>`)
        .join('')}</select></div><div data-c></div>`;
    const c = $('[data-c]', main);
    $('.filtros', main).addEventListener('change', (e) => {
      F[e.target.name] = e.target.value;
      lembrar();
      desenhar();
    });
    const desenhar = () => {
      const lim = F.valJanela === 'vencidos' ? -1 : F.valJanela === 'todos' ? Infinity : +F.valJanela;
      const lotes = D.db()
        .lotes.filter((l) => l.validade && (!F.valLoja || l.lojaId === F.valLoja) && D.loja(l.lojaId)?.ativa)
        .map((l) => ({ ...l, dias: D.diasAte(l.validade), p: D.produto(l.produtoId) }))
        .filter((l) => l.p && l.dias <= lim)
        .sort((a, b) => a.dias - b.dias);
      const vencidos = lotes.filter((l) => l.dias < 0);
      const risco = lotes.filter((l) => l.dias >= 0 && l.dias <= D.cfg().diasAlertaValidade);
      const custo = (arr) => arr.reduce((a, l) => a + l.qtd * l.p.custo, 0);
      const perdas30 = D.db().movimentos.filter((m) => m.tipo === 'perda' && m.ts >= Date.now() - 30 * DIA && (!F.valLoja || m.lojaId === F.valLoja));
      const custoPerdas = perdas30.reduce((a, m) => a + -m.qtd * (D.produto(m.produtoId)?.custo || 0), 0);
      c.innerHTML = `
        <div class="kpis">
          ${kpi('Vencidos (a custo)', brl(custo(vencidos)), `${vencidos.length} lotes · retire das prateleiras`, vencidos.length ? 'alerta-vermelho' : '')}
          ${kpi(`Vencendo em ${D.cfg().diasAlertaValidade} dias`, brl(custo(risco)), `${risco.length} lotes · faça promoção`)}
          ${kpi('Perdas registradas (30 d)', brl(custoPerdas), `${perdas30.length} baixas`)}
        </div>
        <p class="muted small">As vendas consomem primeiro os lotes que vencem antes (FEFO). Ao repor, posicione os produtos com validade mais curta na frente.</p>
        <div class="tabela-wrap"><table class="tabela">
          <thead><tr><th></th><th>Produto</th><th>Local</th><th class="n">Qtd</th><th>Validade</th><th>Prazo</th><th class="n">Custo</th><th></th></tr></thead>
          <tbody>${
            lotes
              .map(
                (l) => `<tr><td class="emoji">${l.p.emoji}</td><td><b>${esc(l.p.nome)}</b></td><td>${esc(D.loja(l.lojaId)?.nome)}</td><td class="n">${l.qtd}</td><td>${fmtIso(l.validade)}</td><td>${badgeDias(l.dias)}</td><td class="n">${brl(l.qtd * l.p.custo)}</td>
                <td class="n nowrap">${l.dias < 0 ? `<button class="btn mini danger" data-baixa="${l.id}">Dar baixa</button>` : `<button class="btn mini ghost" data-baixa="${l.id}">Baixa</button>`}</td></tr>`,
              )
              .join('') || '<tr><td colspan="8" class="muted">Nenhum lote nesta janela. 🎉</td></tr>'
          }</tbody></table></div>`;
      $$('[data-baixa]', c).forEach(
        (b) =>
          (b.onclick = () => {
            const l = lotes.find((x) => x.id === b.dataset.baixa);
            formPerda(l.lojaId, l.produtoId, { lote: l, motivo: l.dias < 0 ? 'Vencido' : 'Avaria' });
          }),
      );
    };
    desenhar();
    return desenhar;
  },

  // ---------- Reposição ----------
  reposicao(main) {
    garantirLoja('repLoja', false);
    if (!D.loja(F.repOrigem)?.ativa) F.repOrigem = D.lojasTodas().find((l) => l.tipo === 'deposito')?.id || D.lojasTodas().find((l) => l.id !== F.repLoja)?.id || '';
    main.innerHTML =
      cab('Reposição e transferências', '<button class="btn ghost" data-a="compras">⬇ Lista de compras (fornecedor)</button><button class="btn ghost" data-a="transf">↔ Transferência manual</button>') +
      `<div class="filtros"><label>Repor a loja ${selLoja('repLoja', F.repLoja, { deposito: false })}</label><label>a partir de ${selLoja('repOrigem', F.repOrigem)}</label></div><div data-c></div>`;
    const c = $('[data-c]', main);
    $('.filtros', main).addEventListener('change', (e) => {
      F[e.target.name] = e.target.value;
      lembrar();
      desenhar();
    });
    $('[data-a=transf]', main).onclick = () => formTransferencia();
    $('[data-a=compras]', main).onclick = () => {
      const dep = D.lojasTodas().find((l) => l.tipo === 'deposito');
      const nec = {};
      for (const l of D.lojasVenda()) for (const r of D.reposicao(l.id)) nec[r.produto.id] = (nec[r.produto.id] || 0) + r.sugerido;
      const linhas = D.produtosAtivos()
        .map((p) => {
          const emDep = dep ? D.estoque(p.id, dep.id) : 0;
          const n = (nec[p.id] || 0) + (dep ? p.minimo * 3 : 0);
          return { p, emDep, n, comprar: Math.max(0, n - emDep) };
        })
        .filter((x) => x.comprar > 0);
      if (!linhas.length) return toast('Nada para comprar agora: o depósito cobre as necessidades.', 'ok');
      baixar(
        `lista_de_compras_${D.hoje()}.csv`,
        csv([['Produto', 'Código', 'Categoria', 'Necessidade das lojas + reserva', 'Em depósito', 'Comprar', 'Custo unit.', 'Custo estimado'], ...linhas.map((x) => [x.p.nome, x.p.ean, x.p.categoria, x.n, x.emDep, x.comprar, x.p.custo, D.arred(x.comprar * x.p.custo)])]),
      );
    };
    const desenhar = () => {
      const lojaId = F.repLoja;
      const origem = F.repOrigem;
      const lista = D.reposicao(lojaId);
      const trs = D.db().transferencias.slice(-15).reverse();
      c.innerHTML = `
        <p class="muted small">Sugestão = o maior entre 2× o estoque mínimo e ${D.cfg().coberturaDias} dias de venda média (últimos 14 dias), menos o estoque atual.</p>
        <form data-f="rep"><div class="tabela-wrap"><table class="tabela">
          <thead><tr><th><input type="checkbox" data-todos checked aria-label="Selecionar todos"></th><th>Produto</th><th class="n">Estoque</th><th class="n">Mín.</th><th class="n">Venda/dia</th><th class="n">Sugerido</th><th class="n">Em ${esc(D.loja(origem)?.nome || '—')}</th><th class="n">Transferir</th></tr></thead>
          <tbody>${
            lista
              .map((r) => {
                const disp = origem ? D.estoque(r.produto.id, origem) : 0;
                const q = Math.min(r.sugerido, disp);
                return `<tr><td><input type="checkbox" name="sel" value="${r.produto.id}" ${q > 0 ? 'checked' : ''} ${disp ? '' : 'disabled'}></td><td>${r.produto.emoji} <b>${esc(r.produto.nome)}</b> ${r.critico ? `<span class="badge ${r.estoque ? 'laranja' : 'vermelho'}">${r.estoque ? 'no mínimo' : 'zerado'}</span>` : ''}</td>
                <td class="n">${r.estoque}</td><td class="n">${r.minimo}</td><td class="n">${num(r.media, 1)}</td><td class="n"><b>${r.sugerido}</b></td><td class="n">${disp < r.sugerido ? `<span class="txt-alerta">${disp}</span>` : disp}</td>
                <td class="n"><input type="number" class="qtd-in" name="q_${r.produto.id}" min="0" max="${disp}" value="${q}" aria-label="Quantidade"></td></tr>`;
              })
              .join('') || '<tr><td colspan="8" class="muted">Loja abastecida. Nada a repor. 👌</td></tr>'
          }</tbody></table></div>
          ${lista.length ? `<div class="barra-acoes"><button class="btn primary">Transferir selecionados</button><button type="button" class="btn ghost" data-a="imprimir">🖨 Imprimir lista do repositor</button></div>` : ''}
        </form>
        <section class="cartao"><h3>Últimas transferências</h3>${
          trs.length
            ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Data</th><th>De</th><th>Para</th><th>Itens</th></tr></thead><tbody>${trs
                .map((t) => `<tr><td>${fmtDataHora(t.ts)}</td><td>${esc(D.loja(t.origemId)?.nome)}</td><td>${esc(D.loja(t.destinoId)?.nome)}</td><td>${t.itens.map((i) => `${i.qtd}× ${esc(D.produto(i.produtoId)?.nome)}`).join(', ')}</td></tr>`)
                .join('')}</tbody></table></div>`
            : '<p class="muted">Nenhuma transferência ainda.</p>'
        }</section>`;
      const f = $('[data-f=rep]', c);
      $('[data-todos]', c)?.addEventListener('change', (e) => $$('[name=sel]:not(:disabled)', f).forEach((x) => (x.checked = e.target.checked)));
      $('[data-a=imprimir]', c)?.addEventListener('click', () => imprimirLista(lojaId, origem, f));
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const itens = $$('[name=sel]:checked', f).map((x) => ({ produtoId: x.value, qtd: Math.floor(+f[`q_${x.value}`].value || 0) }));
        try {
          if (!origem) throw new Error('Escolha a origem');
          const t = D.transferir(origem, lojaId, itens, 'Reposição sugerida');
          toast(`Transferência registrada: ${t.itens.reduce((a, i) => a + i.qtd, 0)} unidades`, 'ok');
        } catch (err) {
          toast(err.message, 'erro', 4000);
        }
      });
    };
    desenhar();
    return desenhar;
  },

  // ---------- Clientes ----------
  clientes(main) {
    main.innerHTML =
      cab('Clientes e carteira', '<button class="btn ghost" data-a="csv">⬇ CSV</button><button class="btn primary" data-a="novo">+ Novo cliente</button>') +
      `<div class="filtros"><input type="search" name="cliBusca" placeholder="Buscar por nome, CPF ou celular" value="${esc(F.cliBusca)}" aria-label="Buscar"></div><div data-c></div>`;
    const c = $('[data-c]', main);
    $('[name=cliBusca]', main).addEventListener('input', (e) => {
      F.cliBusca = e.target.value;
      lembrar();
      desenhar();
    });
    $('[data-a=novo]', main).onclick = () => formCliente();
    $('[data-a=csv]', main).onclick = () =>
      baixar(`clientes_${D.hoje()}.csv`, csv([['Nome', 'CPF', 'Celular', 'E-mail', 'Saldo', 'Cadastro'], ...D.db().clientes.map((x) => [x.nome, x.cpf, x.telefone, x.email, x.saldo, fmtData(x.criado)])]));
    const desenhar = () => {
      const q = F.cliBusca.trim().toLowerCase();
      const qd = q.replace(/\D/g, '');
      const desde = Date.now() - 30 * DIA;
      const st = {};
      for (const v of D.db().vendas) {
        if (!v.clienteId || v.status !== 'ok') continue;
        const s = (st[v.clienteId] ||= { n: 0, total: 0, ultima: 0 });
        s.n++;
        s.total += v.total;
        s.ultima = Math.max(s.ultima, v.ts);
      }
      const mov30 = D.db().carteira.filter((m) => m.ts >= desde);
      const lista = D.db()
        .clientes.filter((x) => !q || x.nome.toLowerCase().includes(q) || (qd.length >= 3 && (x.cpf.includes(qd) || x.telefone.includes(qd))))
        .sort((a, b) => a.nome.localeCompare(b.nome));
      c.innerHTML = `
        <div class="kpis">
          ${kpi('Clientes', num(D.db().clientes.length))}
          ${kpi('Saldo em carteiras', brl(D.db().clientes.reduce((a, x) => a + x.saldo, 0)), 'valor já recebido, a consumir')}
          ${kpi('Recargas (30 d)', brl(mov30.filter((m) => m.tipo === 'recarga').reduce((a, m) => a + m.valor, 0)))}
          ${kpi('Bônus concedido (30 d)', brl(mov30.filter((m) => m.tipo === 'bonus').reduce((a, m) => a + m.valor, 0)))}
        </div>
        <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Nome</th><th>Celular</th><th>CPF</th><th class="n">Saldo</th><th class="n">Compras</th><th class="n">Total gasto</th><th>Última compra</th><th class="n">Ações</th></tr></thead>
        <tbody>${lista
          .map((x) => {
            const s = st[x.id] || { n: 0, total: 0, ultima: 0 };
            return `<tr><td><b>${esc(x.nome)}</b></td><td class="mono">${esc(x.telefone)}</td><td class="mono">${esc(x.cpf || '—')}</td><td class="n"><b>${brl(x.saldo)}</b></td><td class="n">${s.n}</td><td class="n">${brl(s.total)}</td><td>${s.ultima ? fmtData(s.ultima) : '—'}</td>
              <td class="n nowrap"><button class="btn mini ghost" data-ext="${x.id}">Extrato</button><button class="btn mini ghost" data-rec="${x.id}">Recarga</button><button class="btn mini ghost" data-ed="${x.id}">Editar</button></td></tr>`;
          })
          .join('')}</tbody></table></div>`;
      $$('[data-ext]', c).forEach((b) => (b.onclick = () => extratoCliente(b.dataset.ext)));
      $$('[data-rec]', c).forEach((b) => (b.onclick = () => formRecarga(b.dataset.rec)));
      $$('[data-ed]', c).forEach((b) => (b.onclick = () => formCliente(D.cliente(b.dataset.ed))));
    };
    desenhar();
    return desenhar;
  },

  // ---------- Cupons ----------
  cupons(main) {
    main.innerHTML = cab('Cupons de desconto', '<button class="btn primary" data-a="novo">+ Novo cupom</button>') + '<div data-c></div>';
    const c = $('[data-c]', main);
    $('[data-a=novo]', main).onclick = () => formCupom();
    const desenhar = () => {
      c.innerHTML = `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Código</th><th>Desconto</th><th class="n">Compra mínima</th><th>Validade</th><th class="n">Usos</th><th>Situação</th><th></th></tr></thead><tbody>${
        D.db()
          .cupons.map((k) => {
            const exp = k.validade && D.diasAte(k.validade) < 0;
            return `<tr><td class="mono"><b>${esc(k.codigo)}</b></td><td>${k.tipo === 'pct' ? `${num(k.valor, 0)}%` : brl(k.valor)}</td><td class="n">${k.minimo ? brl(k.minimo) : '—'}</td><td>${k.validade ? fmtIso(k.validade) : 'sem prazo'}</td><td class="n">${k.usos || 0}</td><td>${!k.ativo ? '<span class="badge">pausado</span>' : exp ? '<span class="badge vermelho">expirado</span>' : '<span class="badge verde">ativo</span>'}</td><td class="n"><button class="btn mini ghost" data-ed="${k.id}">Editar</button></td></tr>`;
          })
          .join('') || '<tr><td colspan="7" class="muted">Nenhum cupom.</td></tr>'
      }</tbody></table></div><p class="muted small">Os clientes veem os cupons ativos na área “Minha carteira” e aplicam no pagamento.</p>`;
      $$('[data-ed]', c).forEach((b) => (b.onclick = () => formCupom(D.db().cupons.find((k) => k.id === b.dataset.ed))));
    };
    desenhar();
    return desenhar;
  },

  // ---------- Lojas ----------
  lojas(main) {
    main.innerHTML = cab('Lojas e totens', '<button class="btn primary" data-a="nova">+ Nova loja / depósito</button>') + '<div data-c></div>';
    const c = $('[data-c]', main);
    $('[data-a=nova]', main).onclick = () => formLoja();
    const desenhar = () => {
      c.innerHTML = `<div class="grade-lojas">${D.db()
        .lojas.map((l) => {
          const unidades = D.db().lotes.filter((x) => x.lojaId === l.id).reduce((a, x) => a + x.qtd, 0);
          return `<div class="cartao loja-card ${l.ativa ? '' : 'inativo'}">
            <div class="lc-topo"><span class="lc-ic">${l.tipo === 'deposito' ? '🏭' : '🏪'}</span><div><b>${esc(l.nome)}</b><small>${esc(l.endereco || 'sem endereço')}</small></div></div>
            <p class="muted small">${l.tipo === 'deposito' ? 'Depósito (não vende)' : 'Loja autônoma'} · ${num(unidades)} unidades em estoque ${l.ativa ? '' : '· <b>inativa</b>'}</p>
            <div class="lc-acoes">
              ${l.tipo === 'loja' && l.ativa ? `<a class="btn mini primary" href="#/totem/${l.id}" target="_blank" rel="noopener">Abrir totem ↗</a><button class="btn mini ghost" data-qr="${l.id}">QR Code do celular</button>` : ''}
              <button class="btn mini ghost" data-ed="${l.id}">Editar</button>
            </div></div>`;
        })
        .join('')}</div>
        <section class="cartao"><h3>Como instalar o totem</h3><ol class="passos">
          <li>Use um tablet ou monitor touch com um leitor de código de barras USB/Bluetooth (ele “digita” o código, não precisa configurar nada).</li>
          <li>Abra o link <b>Abrir totem</b> da loja, adicione à tela inicial e deixe em tela cheia (modo quiosque / fixação de tela do Android).</li>
          <li>Coloque a maquininha de cartão ao lado do totem. Nesta versão, o operador confirma a aprovação pelo botão de demonstração; a integração TEF/POS está no roteiro.</li>
          <li>Imprima o <b>QR Code do celular</b> e cole no balcão: o cliente compra e paga com saldo pelo próprio celular.</li>
        </ol></section>`;
      $$('[data-ed]', c).forEach((b) => (b.onclick = () => formLoja(D.loja(b.dataset.ed))));
      $$('[data-qr]', c).forEach((b) => (b.onclick = () => qrLoja(b.dataset.qr)));
    };
    desenhar();
    return desenhar;
  },

  // ---------- Configurações ----------
  config(main) {
    const desenhar = () => {
      const k = D.cfg();
      main.innerHTML =
        cab('Configurações') +
        `<div class="grade-2">
          <form class="cartao form-col" data-f="cfg">
            <h3>Geral</h3>
            <label>Nome do mercado<input name="nome" value="${esc(k.nome)}" required></label>
            <label>Mensagem no fim da compra<input name="slogan" value="${esc(k.slogan || '')}"></label>
            <label>PIN do administrador<input name="pinAdmin" value="${esc(k.pinAdmin)}" inputmode="numeric" minlength="4" required></label>
            <h3>Carteira</h3>
            <div class="lado"><label>Bônus na recarga (%)<input name="bonusRecargaPct" type="number" min="0" max="50" step="0.5" value="${k.bonusRecargaPct}"></label>
            <label>A partir de (R$)<input name="bonusRecargaMin" type="number" min="0" step="1" value="${k.bonusRecargaMin}"></label></div>
            <h3>Estoque</h3>
            <div class="lado"><label>Alerta de validade (dias)<input name="diasAlertaValidade" type="number" min="1" max="60" value="${k.diasAlertaValidade}"></label>
            <label>Cobertura da reposição (dias)<input name="coberturaDias" type="number" min="1" max="60" value="${k.coberturaDias}"></label></div>
            <button class="btn primary">Salvar configurações</button>
          </form>
          <div>
            <section class="cartao form-col"><h3>Backup</h3>
              <p class="muted small">Nesta versão os dados ficam salvos neste navegador. Faça backup com frequência e use “Importar” para levar os dados a outro aparelho.</p>
              <div class="lado"><button class="btn ghost" data-a="exportar">⬇ Exportar backup</button><label class="btn ghost">⬆ Importar backup<input type="file" accept=".json,application/json" data-a="importar" hidden></label></div>
            </section>
            <section class="cartao form-col zona-perigo"><h3>Dados</h3>
              <button class="btn ghost" data-a="demo">Restaurar dados de demonstração</button>
              <button class="btn danger" data-a="zero">Começar do zero (apaga tudo)</button>
            </section>
          </div>
        </div>`;
      $('[data-f=cfg]', main).addEventListener('submit', (e) => {
        e.preventDefault();
        const d = lerForm(e.target);
        if (!/^\d{4,8}$/.test(d.pinAdmin)) return toast('O PIN deve ter de 4 a 8 números', 'erro');
        D.salvarConfig(d);
        toast('Configurações salvas', 'ok');
      });
      $('[data-a=exportar]', main).onclick = () => baixar(`backup_mercado_${D.hoje()}.json`, D.exportar(), 'application/json');
      $('[data-a=importar]', main).addEventListener('change', async (e) => {
        const arq = e.target.files[0];
        if (!arq) return;
        if (!(await confirmar('Importar este backup substitui todos os dados atuais. Continuar?', { ok: 'Importar', perigo: true }))) return;
        try {
          D.importar(await arq.text());
          toast('Backup importado', 'ok');
        } catch (err) {
          toast(err.message, 'erro');
        }
      });
      $('[data-a=demo]', main).onclick = async () => {
        if (await confirmar('Substituir todos os dados pelos dados de demonstração?', { ok: 'Restaurar', perigo: true })) {
          D.restaurarDemo();
          toast('Dados de demonstração restaurados', 'ok');
        }
      };
      $('[data-a=zero]', main).onclick = async () => {
        if (await confirmar('Apagar produtos, estoque, vendas, clientes e cupons? As configurações são mantidas. Faça um backup antes.', { ok: 'Apagar tudo', perigo: true })) {
          D.comecarDoZero();
          toast('Tudo limpo. Cadastre suas lojas e produtos.', 'ok');
        }
      };
    };
    desenhar();
    return desenhar;
  },
};

// ================= Formulários e modais =================
function formProduto(p = null) {
  const m = modal({
    title: p ? 'Editar produto' : 'Novo produto',
    wide: true,
    body: `<form class="form-col">
      <input type="hidden" name="id" value="${p?.id || ''}">
      <div class="lado"><label class="cresce">Nome<input name="nome" value="${esc(p?.nome || '')}" required></label><label class="estreito">Ícone<input name="emoji" value="${esc(p?.emoji || '📦')}" maxlength="4"></label></div>
      <div class="lado"><label class="cresce">Código de barras (EAN)<input name="ean" value="${esc(p?.ean || '')}" inputmode="numeric" placeholder="Leia com o leitor ou digite"></label><button type="button" class="btn ghost" data-a="gerar">Gerar código interno</button></div>
      <label>Categoria<input name="categoria" value="${esc(p?.categoria || '')}" list="lista-cat" required><datalist id="lista-cat">${D.db().categorias.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
      <div class="lado"><label>Preço de venda (R$)<input name="preco" type="number" min="0" step="0.01" value="${p?.preco ?? ''}" required></label><label>Custo (R$)<input name="custo" type="number" min="0" step="0.01" value="${p?.custo ?? ''}"></label><label>Estoque mínimo por loja<input name="minimo" type="number" min="0" step="1" value="${p?.minimo ?? 3}"></label></div>
      <p class="muted small" data-margem></p>
      <label class="check"><input type="checkbox" name="ativo" ${p?.ativo === false ? '' : 'checked'}> Produto ativo (aparece no totem)</label>
    </form>`,
    actions: [{ label: 'Cancelar' }, { label: 'Salvar', cls: 'primary', onClick: (ctx) => (D.salvarProduto(lerForm(ctx.el.querySelector('form'))), toast('Produto salvo', 'ok')) }],
  });
  const f = m.el.querySelector('form');
  const margem = () => {
    const pr = +f.preco.value;
    const cu = +f.custo.value;
    $('[data-margem]', f).textContent = pr ? `Margem: ${pct((pr - cu) / pr)} · lucro de ${brl(pr - cu)} por unidade` : '';
  };
  f.addEventListener('input', margem);
  margem();
  $('[data-a=gerar]', f).onclick = () => (f.ean.value = D.eanInterno());
}

function formEntrada(lojaId, produtoId = '') {
  modal({
    title: `Entrada de mercadoria · ${D.loja(lojaId)?.nome}`,
    body: `<form class="form-col">
      <label>Produto<select name="produtoId" required>${produtoId ? '' : '<option value="">Selecione…</option>'}${optsProdutos(produtoId)}</select></label>
      <div class="lado"><label>Quantidade<input name="qtd" type="number" min="1" step="1" required></label><label>Validade do lote<input name="validade" type="date"></label></div>
      <label>Observação (nota fiscal, fornecedor…)<input name="obs"></label>
    </form>`,
    actions: [
      { label: 'Cancelar' },
      {
        label: 'Registrar entrada',
        cls: 'primary',
        onClick: (ctx) => {
          const d = lerForm(ctx.el.querySelector('form'));
          if (!d.produtoId) throw new Error('Selecione o produto');
          D.entrada(d.produtoId, lojaId, d.qtd, d.validade, d.obs);
          toast('Entrada registrada', 'ok');
        },
      },
    ],
  });
}

function formPerda(lojaId, produtoId, { lote = null, motivo = 'Avaria' } = {}) {
  const p = D.produto(produtoId);
  const max = lote ? lote.qtd : D.estoque(produtoId, lojaId);
  if (!max) return toast('Sem estoque para dar baixa', 'erro');
  modal({
    title: `Baixa de estoque · ${p.nome}`,
    body: `<form class="form-col">
      <p class="muted">${esc(D.loja(lojaId)?.nome)}${lote ? ` · lote com validade ${fmtIso(lote.validade)}` : ''} · disponível: <b>${max}</b></p>
      <label>Quantidade<input name="qtd" type="number" min="1" max="${max}" step="1" value="${lote ? lote.qtd : 1}" required></label>
      <label>Motivo<select name="motivo">${['Vencido', 'Avaria', 'Furto / diferença', 'Consumo interno', 'Outro'].map((x) => `<option ${x === motivo ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    </form>`,
    actions: [
      { label: 'Cancelar' },
      {
        label: 'Dar baixa',
        cls: 'danger',
        onClick: (ctx) => {
          const d = lerForm(ctx.el.querySelector('form'));
          D.perda(produtoId, lojaId, d.qtd, d.motivo, lote?.id);
          toast('Baixa registrada', 'ok');
        },
      },
    ],
  });
}

function formInventario(lojaId, produtoId) {
  const p = D.produto(produtoId);
  const atual = D.estoque(produtoId, lojaId);
  modal({
    title: `Contagem de estoque · ${p.nome}`,
    body: `<form class="form-col">
      <p class="muted">${esc(D.loja(lojaId)?.nome)} · no sistema: <b>${atual}</b></p>
      <label>Quantidade contada na prateleira<input name="contado" type="number" min="0" step="1" value="${atual}" required></label>
      <label>Validade (se houver sobra a incluir)<input name="validade" type="date"></label>
      <p class="muted small">Diferenças negativas indicam possíveis furtos ou leituras esquecidas e aparecem no histórico de movimentações.</p>
    </form>`,
    actions: [
      { label: 'Cancelar' },
      {
        label: 'Ajustar estoque',
        cls: 'primary',
        onClick: (ctx) => {
          const d = lerForm(ctx.el.querySelector('form'));
          const dif = D.inventario(produtoId, lojaId, d.contado, d.validade);
          toast(dif ? `Ajuste de ${dif > 0 ? '+' : ''}${dif} registrado` : 'Estoque confere 👍', 'ok');
        },
      },
    ],
  });
}

function formTransferencia() {
  const lojas = D.lojasTodas();
  const m = modal({
    title: 'Transferência entre lojas',
    body: `<form class="form-col">
      <div class="lado"><label>De${selLoja('origem', lojas.find((l) => l.tipo === 'deposito')?.id || lojas[0]?.id)}</label><label>Para${selLoja('destino', lojas.find((l) => l.tipo === 'loja')?.id)}</label></div>
      <div class="lado"><label class="cresce">Produto<select name="produtoId">${optsProdutos()}</select></label><label class="estreito">Qtd<input name="qtd" type="number" min="1" value="1"></label></div>
      <p class="muted small" data-disp></p>
    </form>`,
    actions: [
      { label: 'Cancelar' },
      {
        label: 'Transferir',
        cls: 'primary',
        onClick: (ctx) => {
          const d = lerForm(ctx.el.querySelector('form'));
          D.transferir(d.origem, d.destino, [{ produtoId: d.produtoId, qtd: Math.floor(d.qtd) }], 'Manual');
          toast('Transferência registrada', 'ok');
        },
      },
    ],
  });
  const f = m.el.querySelector('form');
  const disp = () => ($('[data-disp]', f).textContent = `Disponível na origem: ${D.estoque(f.produtoId.value, f.origem.value)} · no destino: ${D.estoque(f.produtoId.value, f.destino.value)}`);
  f.addEventListener('change', disp);
  disp();
}

function movimentacoes(lojaId) {
  const movs = D.db()
    .movimentos.filter((m) => m.lojaId === lojaId && m.tipo !== 'venda')
    .slice(-150)
    .reverse();
  modal({
    title: `Movimentações · ${D.loja(lojaId)?.nome}`,
    wide: true,
    body: movs.length
      ? `<p class="muted small">Entradas, perdas, contagens, transferências e estornos (vendas ficam em Vendas e relatórios).</p><div class="tabela-wrap"><table class="tabela"><thead><tr><th>Data</th><th>Tipo</th><th>Produto</th><th class="n">Qtd</th><th>Detalhe</th></tr></thead><tbody>${movs
          .map(
            (m) => `<tr><td>${fmtDataHora(m.ts)}</td><td>${TIPO_MOV[m.tipo] || m.tipo}</td><td>${esc(D.produto(m.produtoId)?.nome)}</td><td class="n ${m.qtd < 0 ? 'txt-alerta' : ''}">${m.qtd > 0 ? '+' : ''}${m.qtd}</td><td>${esc(m.motivo || m.obs || (m.destinoId ? '→ ' + D.loja(m.destinoId)?.nome : m.origemId ? '← ' + D.loja(m.origemId)?.nome : '') || (m.validade ? 'validade ' + fmtIso(m.validade) : ''))}</td></tr>`,
          )
          .join('')}</tbody></table></div>`
      : '<p class="muted">Nenhuma movimentação registrada ainda nesta loja.</p>',
  });
}

function imprimirLista(lojaId, origemId, form) {
  const itens = $$('[name=sel]:checked', form)
    .map((x) => ({ p: D.produto(x.value), q: +form[`q_${x.value}`].value || 0 }))
    .filter((i) => i.q > 0);
  const w = window.open('', '_blank');
  if (!w) return toast('Permita pop-ups para imprimir', 'erro');
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Lista de reposição</title><style>body{font:14px system-ui;margin:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:6px;text-align:left}h1{font-size:18px}</style>
    <h1>Reposição: ${esc(D.cfg().nome)} — ${esc(D.loja(lojaId)?.nome)}</h1><p>Separar em: ${esc(D.loja(origemId)?.nome)} · ${new Date().toLocaleString('pt-BR')}</p>
    <table><tr><th>✓</th><th>Produto</th><th>Código</th><th>Qtd</th></tr>${itens.map((i) => `<tr><td></td><td>${esc(i.p.nome)}</td><td>${esc(i.p.ean)}</td><td>${i.q}</td></tr>`).join('')}</table>
    <p>Lembre: produtos com validade mais curta na frente da prateleira.</p><script>print()<\/script>`);
  w.document.close();
}

function detalheVenda(id) {
  const v = D.db().vendas.find((x) => x.id === id);
  const cli = D.cliente(v.clienteId);
  modal({
    title: `Venda nº ${v.numero}`,
    body: `<div class="recibo">
      <div class="linha"><span>${fmtDataHora(v.ts)}</span><span>${esc(D.loja(v.lojaId)?.nome)}</span></div>
      <div class="linha"><span>Canal</span><span>${v.canal === 'totem' ? 'Totem' : 'Celular'}</span></div>
      <div class="linha"><span>Pagamento</span><span>${PAG[v.pagamento]}${v.autorizacao ? ` · aut. ${v.autorizacao}` : ''}</span></div>
      ${cli ? `<div class="linha"><span>Cliente</span><span>${esc(cli.nome)}</span></div>` : ''}
      <ul class="resumo-lista">${v.itens.map((i) => `<li><span>${i.qtd}× ${esc(i.nome)}${i.falta ? ` <span class="badge laranja" title="Vendido sem estoque no sistema">${i.falta} sem estoque</span>` : ''}</span><span>${brl(i.preco * i.qtd)}</span></li>`).join('')}</ul>
      ${v.desconto ? `<div class="linha desconto"><span>Desconto (${esc(v.cupom)})</span><span>− ${brl(v.desconto)}</span></div>` : ''}
      <div class="linha total"><span>Total</span><b>${brl(v.total)}</b></div>
      ${v.status === 'estornada' ? `<p class="badge vermelho">Estornada em ${fmtDataHora(v.estorno.ts)} ${esc(v.estorno.motivo)}</p>` : ''}
    </div>`,
    actions:
      v.status === 'ok'
        ? [
            { label: 'Fechar' },
            {
              label: 'Estornar venda',
              cls: 'danger',
              onClick: async () => {
                if (!(await confirmar(`Estornar a venda nº ${v.numero}? Os produtos voltam ao estoque${v.pagamento === 'saldo' ? ' e o valor volta para a carteira do cliente' : '. Estorne também na maquininha'}.`, { ok: 'Estornar', perigo: true }))) return false;
                D.estornarVenda(v.id, 'Estorno pelo painel');
                toast('Venda estornada', 'ok');
              },
            },
          ]
        : [{ label: 'Fechar' }],
  });
}

function formCliente(c = null) {
  modal({
    title: c ? 'Editar cliente' : 'Novo cliente',
    body: `<form class="form-col">
      <input type="hidden" name="id" value="${c?.id || ''}">
      <label>Nome<input name="nome" value="${esc(c?.nome || '')}" required></label>
      <div class="lado"><label>Celular<input name="telefone" value="${esc(c?.telefone || '')}" inputmode="tel" required></label><label>CPF<input name="cpf" value="${esc(c?.cpf || '')}" inputmode="numeric"></label></div>
      <label>E-mail<input name="email" type="email" value="${esc(c?.email || '')}"></label>
      <label>PIN (4 números)<input name="pin" value="${esc(c?.pin || '')}" inputmode="numeric" maxlength="4" required></label>
    </form>`,
    actions: [{ label: 'Cancelar' }, { label: 'Salvar', cls: 'primary', onClick: (ctx) => (D.salvarCliente(lerForm(ctx.el.querySelector('form'))), toast('Cliente salvo', 'ok')) }],
  });
}

function formRecarga(id) {
  const c = D.cliente(id);
  const { bonusRecargaPct: bp, bonusRecargaMin: bm } = D.cfg();
  modal({
    title: `Recarga · ${c.nome}`,
    body: `<form class="form-col">
      <p class="muted">Saldo atual: <b>${brl(c.saldo)}</b></p>
      <div class="lado"><label>Valor (R$)<input name="valor" type="number" min="1" step="0.01" required></label><label>Recebido em<select name="meio"><option>dinheiro</option><option>Pix</option><option>cartão</option><option>cortesia</option></select></label></div>
      ${bp > 0 ? `<p class="muted small">Recargas a partir de ${brl(bm)} ganham ${bp}% de bônus automaticamente.</p>` : ''}
    </form>`,
    actions: [
      { label: 'Cancelar' },
      {
        label: 'Recarregar',
        cls: 'primary',
        onClick: (ctx) => {
          const d = lerForm(ctx.el.querySelector('form'));
          const r = D.recarregar(id, d.valor, d.meio);
          toast(`Recarga feita. Novo saldo: ${brl(r.saldo)}${r.bonus ? ` (bônus ${brl(r.bonus)})` : ''}`, 'ok', 4000);
        },
      },
    ],
  });
}

function extratoCliente(id) {
  const c = D.cliente(id);
  const ext = D.extrato(id);
  modal({
    title: `Extrato · ${c.nome}`,
    wide: true,
    body: `<p>Saldo atual: <b>${brl(c.saldo)}</b></p><div class="tabela-wrap"><table class="tabela"><thead><tr><th>Data</th><th>Descrição</th><th class="n">Valor</th><th class="n">Saldo</th></tr></thead><tbody>${
      ext.map((m) => `<tr><td>${fmtDataHora(m.ts)}</td><td>${esc(m.descricao)}</td><td class="n ${m.valor < 0 ? 'txt-alerta' : 'txt-ok'}">${m.valor < 0 ? '−' : '+'} ${brl(Math.abs(m.valor))}</td><td class="n">${m.saldoApos != null ? brl(m.saldoApos) : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sem movimentações.</td></tr>'
    }</tbody></table></div>`,
    actions: [
      { label: 'Fechar' },
      {
        label: 'Ajuste manual',
        cls: 'ghost',
        onClick: () => {
          modal({
            title: 'Ajuste manual de saldo',
            body: `<form class="form-col"><label>Valor (use negativo para debitar)<input name="valor" type="number" step="0.01" required></label><label>Motivo<input name="motivo" required></label></form>`,
            actions: [
              { label: 'Cancelar' },
              {
                label: 'Aplicar',
                cls: 'primary',
                onClick: (ctx) => {
                  const d = lerForm(ctx.el.querySelector('form'));
                  if (!d.motivo) throw new Error('Informe o motivo');
                  D.ajustarSaldo(id, d.valor, d.motivo);
                  toast('Ajuste aplicado', 'ok');
                },
              },
            ],
          });
        },
      },
    ],
  });
}

function formCupom(k = null) {
  modal({
    title: k ? 'Editar cupom' : 'Novo cupom',
    body: `<form class="form-col">
      <input type="hidden" name="id" value="${k?.id || ''}">
      <label>Código<input name="codigo" value="${esc(k?.codigo || '')}" required style="text-transform:uppercase"></label>
      <div class="lado"><label>Tipo<select name="tipo"><option value="pct" ${k?.tipo !== 'valor' ? 'selected' : ''}>Percentual (%)</option><option value="valor" ${k?.tipo === 'valor' ? 'selected' : ''}>Valor fixo (R$)</option></select></label><label>Desconto<input name="valor" type="number" min="0" step="0.01" value="${k?.valor ?? ''}" required></label></div>
      <div class="lado"><label>Compra mínima (R$)<input name="minimo" type="number" min="0" step="0.01" value="${k?.minimo ?? 0}"></label><label>Válido até<input name="validade" type="date" value="${k?.validade || ''}"></label></div>
      <label class="check"><input type="checkbox" name="ativo" ${k?.ativo === false ? '' : 'checked'}> Ativo</label>
    </form>`,
    actions: [{ label: 'Cancelar' }, { label: 'Salvar', cls: 'primary', onClick: (ctx) => (D.salvarCupom(lerForm(ctx.el.querySelector('form'))), toast('Cupom salvo', 'ok')) }],
  });
}

function formLoja(l = null) {
  modal({
    title: l ? 'Editar loja' : 'Nova loja / depósito',
    body: `<form class="form-col">
      <input type="hidden" name="id" value="${l?.id || ''}">
      <label>Nome<input name="nome" value="${esc(l?.nome || '')}" required placeholder="Ex.: Cond. Jardim das Palmeiras"></label>
      <label>Endereço<input name="endereco" value="${esc(l?.endereco || '')}"></label>
      <label>Tipo<select name="tipo"><option value="loja" ${l?.tipo !== 'deposito' ? 'selected' : ''}>Loja autônoma (vende)</option><option value="deposito" ${l?.tipo === 'deposito' ? 'selected' : ''}>Depósito / estoque central</option></select></label>
      <label class="check"><input type="checkbox" name="ativa" ${l?.ativa === false ? '' : 'checked'}> Ativa</label>
    </form>`,
    actions: [{ label: 'Cancelar' }, { label: 'Salvar', cls: 'primary', onClick: (ctx) => (D.salvarLoja(lerForm(ctx.el.querySelector('form'))), toast('Loja salva', 'ok')) }],
  });
}

function qrLoja(id) {
  const l = D.loja(id);
  const url = `${location.href.split('#')[0]}#/celular/${id}`;
  const m = modal({
    title: `QR Code · ${l.nome}`,
    body: `<div class="qr-cartaz"><div class="qr-marca">${logoSVG(48)}<b>${esc(D.cfg().nome)}</b></div><p class="qr-chamada">Compre pelo celular</p><div class="qr" data-qr></div><p>Aponte a câmera, escaneie os produtos e pague com seu saldo.</p><small class="mono">${esc(url)}</small></div>`,
    actions: [
      { label: 'Copiar link', cls: 'ghost', onClick: () => (navigator.clipboard?.writeText(url).then(() => toast('Link copiado', 'ok')), false) },
      {
        label: 'Imprimir cartaz',
        cls: 'primary',
        onClick: (ctx) => {
          const w = window.open('', '_blank');
          if (!w) return toast('Permita pop-ups para imprimir', 'erro'), false;
          w.document.write(`<!doctype html><meta charset="utf-8"><title>QR ${esc(l.nome)}</title><style>body{font:18px system-ui;text-align:center;padding:40px}img{width:320px;height:320px}canvas{display:none}h1{color:#FF6B00}</style><h1>${esc(D.cfg().nome)}</h1><h2>Compre pelo celular</h2>${ctx.el.querySelector('[data-qr]').innerHTML}<p>Aponte a câmera, escaneie os produtos e pague com seu saldo.</p><p>${esc(l.nome)}</p><script>setTimeout(()=>print(),300)<\/script>`);
          w.document.close();
          return false;
        },
      },
    ],
  });
  qrcode(m.el.querySelector('[data-qr]'), url).catch((e) => toast(e.message, 'erro'));
}
