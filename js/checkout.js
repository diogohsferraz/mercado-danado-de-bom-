// Autoatendimento: modo totem (tela na loja) e modo celular (cliente no próprio aparelho).
import * as D from './db.js';
import * as Sess from './sessao.js';
import { $, $$, esc, brl, toast, modal, bip, logoSVG, tecladoHTML, ligarTeclado } from './ui.js';
import { abrirCamera, escutarLeitor } from './scanner.js';
import * as G from './geladeira.js';

const NOME_PAG = { credito: 'Cartão de crédito', debito: 'Cartão de débito', saldo: 'Saldo da carteira' };
const OCIOSO_MS = 120e3;

export function renderCheckout(root, { lojaId, modo }) {
  const L = D.loja(lojaId);
  if (!L || L.tipo !== 'loja' || !L.ativa) {
    root.innerHTML = `<div class="pag-vazia">${logoSVG(64)}<h2>Loja não encontrada</h2><p>O link pode estar desatualizado.</p><a class="btn primary" href="#/">Voltar ao início</a></div>`;
    return;
  }
  const totem = modo === 'totem';
  const chaveCarrinho = `mddb:carrinho:${lojaId}`;
  const st = { cart: new Map(), cupom: '', etapa: 'compra', cat: 'Todos', busca: '', venda: null, clienteId: totem ? null : Sess.clienteLogado() };
  const limpar = [];

  if (!totem) {
    try {
      const salvo = JSON.parse(sessionStorage.getItem(chaveCarrinho) || 'null');
      if (salvo) {
        salvo.itens.forEach((i) => D.produto(i.produtoId) && st.cart.set(i.produtoId, i.qtd));
        st.cupom = salvo.cupom || '';
      }
    } catch {
      /* sem carrinho salvo */
    }
  }
  const persistir = () => {
    if (totem) return;
    try {
      sessionStorage.setItem(chaveCarrinho, JSON.stringify({ itens: itens(), cupom: st.cupom }));
    } catch {
      /* ignora */
    }
  };

  const itens = () => [...st.cart].map(([produtoId, qtd]) => ({ produtoId, qtd }));
  const conta = () => D.calcular(itens(), st.cupom);

  root.innerHTML = `
    <div class="co ${totem ? 'co-totem' : 'co-cel'}">
      <header class="co-top">
        <a class="co-marca" href="${totem ? '#/totem/' + lojaId : '#/'}">${logoSVG(totem ? 46 : 36)}<span><b>${esc(D.cfg().nome)}</b><small>📍 ${esc(L.nome)}</small></span></a>
        <div class="co-top-dir" data-conta></div>
      </header>
      <div class="co-corpo"></div>
    </div>`;
  const corpo = $('.co-corpo', root);
  const contaEl = $('[data-conta]', root);

  function renderConta() {
    if (totem) {
      const ident = st.clienteId && D.cliente(st.clienteId);
      contaEl.innerHTML = `${ident ? `<button class="chip-conta" data-a="sair-id" title="Encerrar identificação">👤 ${esc(ident.nome.split(' ')[0])}${D.situacaoIdade(ident).ok ? ' ✓' : ''} · sair</button>` : ''}<span class="relogio"></span><a class="link-discreto" href="#/admin" title="Administração">⚙</a>`;
      $('[data-a=sair-id]', contaEl)?.addEventListener('click', () => {
        st.clienteId = null;
        renderConta();
        if (st.etapa === 'pagamento') telaPagamento();
      });
      const r = $('.relogio', contaEl);
      const tick = () => (r.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      tick();
      return;
    }
    const c = st.clienteId && D.cliente(st.clienteId);
    contaEl.innerHTML = c
      ? `<a class="chip-conta" href="#/cliente">👤 ${esc(c.nome.split(' ')[0])} · <b>${brl(c.saldo)}</b></a>`
      : `<button class="chip-conta" data-a="login">👤 Entrar</button>`;
    $('[data-a=login]', contaEl)?.addEventListener('click', () => abrirLogin());
  }

  // ---------- Etapa: compra ----------
  function telaCompra() {
    st.etapa = 'compra';
    const cats = ['Todos', ...D.db().categorias.filter((c) => D.produtosAtivos().some((p) => p.categoria === c))];
    corpo.innerHTML = `
      <section class="co-catalogo">
        <div class="co-scan">
          <button class="btn primary grande" data-a="camera">📷 Escanear código de barras</button>
          ${D.geladeirasDaLoja(lojaId).length ? '<button class="btn lime grande" data-a="geladeira">🧊 Abrir geladeira</button>' : ''}
          <form class="co-busca" autocomplete="off">
            <input type="search" name="q" placeholder="${totem ? 'Passe no leitor, digite o código ou o nome' : 'Buscar produto ou digitar código'}" value="${esc(st.busca)}" aria-label="Buscar produto">
          </form>
        </div>
        ${totem ? '<p class="dica">Use o leitor ao lado da tela ou toque nos produtos abaixo 👇</p>' : ''}
        <div class="chips" role="tablist">${cats.map((c) => `<button class="chip ${c === st.cat ? 'ativo' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
        <div class="grade-prod"></div>
      </section>
      <aside class="co-carrinho">
        <div class="cc-head"><h2>🛒 Seu carrinho</h2><button class="link" data-a="esvaziar">Esvaziar</button></div>
        <div class="cc-lista"></div>
        <div class="cc-pe">
          <div class="cc-total"><span>Total</span><b data-total>R$ 0,00</b></div>
          <button class="btn lime grande bloco" data-a="pagar">Pagar</button>
          ${totem ? '<button class="btn ghost-escuro bloco" data-a="codigo">📲 Montei no celular — digitar código</button>' : ''}
        </div>
      </aside>
      ${totem ? '' : '<button class="cc-barra" data-a="abrir-carrinho"><span>🛒 <b data-qtd>0</b> itens</span><b data-total>R$ 0,00</b><span class="cc-ver">Ver carrinho ›</span></button>'}`;

    $('[data-a=camera]', corpo).onclick = () => abrirCamera(lerCodigo);
    $('[data-a=geladeira]', corpo)?.addEventListener('click', () => telaGeladeira());
    const form = $('.co-busca', corpo);
    const inp = form.q;
    inp.addEventListener('input', () => {
      st.busca = inp.value;
      renderGrade();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = inp.value.trim();
      if (/^\d{6,14}$/.test(v)) {
        lerCodigo(v);
        inp.value = st.busca = '';
        renderGrade();
        return;
      }
      const lista = filtrados();
      if (lista.length === 1) {
        adicionar(lista[0].id);
        inp.value = st.busca = '';
        renderGrade();
      }
    });
    $$('[data-cat]', corpo).forEach((b) =>
      b.addEventListener('click', () => {
        st.cat = b.dataset.cat;
        $$('[data-cat]', corpo).forEach((x) => x.classList.toggle('ativo', x === b));
        renderGrade();
      }),
    );
    $('[data-a=esvaziar]', corpo).onclick = () => {
      st.cart.clear();
      st.cupom = '';
      renderCarrinho();
    };
    $('[data-a=pagar]', corpo).onclick = () => st.cart.size && telaPagamento();
    $('[data-a=codigo]', corpo)?.addEventListener('click', abrirCodigo);
    $('[data-a=abrir-carrinho]', corpo)?.addEventListener('click', () => {
      $('.co-carrinho', corpo).classList.add('aberto');
      document.body.classList.add('sem-rolagem');
    });
    renderGrade();
    renderCarrinho();
  }

  function filtrados() {
    const q = st.busca.trim().toLowerCase();
    return D.produtosAtivos().filter(
      (p) => (st.cat === 'Todos' || p.categoria === st.cat) && (!q || p.nome.toLowerCase().includes(q) || (p.ean && p.ean.includes(q))),
    );
  }

  function renderGrade() {
    const g = $('.grade-prod', corpo);
    if (!g) return;
    const lista = filtrados();
    g.innerHTML = lista.length
      ? lista
          .map((p) => {
            const q = st.cart.get(p.id) || 0;
            return `<button class="prod" data-p="${p.id}"><span class="prod-emoji">${p.emoji}</span><span class="prod-nome">${esc(p.nome)}</span><span class="prod-preco">${brl(p.preco)}</span>${p.restrito18 ? '<span class="selo18">18+</span>' : ''}${q ? `<span class="prod-qtd">${q}</span>` : ''}</button>`;
          })
          .join('')
      : '<p class="muted">Nenhum produto encontrado.</p>';
    $$('[data-p]', g).forEach((b) => (b.onclick = () => adicionar(b.dataset.p)));
  }

  function renderCarrinho() {
    const lista = $('.cc-lista', corpo);
    if (!lista) return;
    const c = conta();
    lista.innerHTML = c.linhas.length
      ? c.linhas
          .map(
            (l) => `<div class="cc-item">
              <span class="cc-emoji">${l.emoji}</span>
              <span class="cc-info"><b>${esc(l.nome)}${l.restrito18 ? ' <span class="selo18">18+</span>' : ''}</b><small>${brl(l.preco)} un.</small></span>
              <span class="qtd"><button data-menos="${l.produtoId}" aria-label="Diminuir">−</button><b>${l.qtd}</b><button data-mais="${l.produtoId}" aria-label="Aumentar">+</button></span>
              <span class="cc-val">${brl(l.total)}</span>
            </div>`,
          )
          .join('')
      : `<div class="cc-vazio"><span>🧺</span><p>${totem ? 'Passe o primeiro produto no leitor' : 'Escaneie ou toque em um produto para começar'}</p></div>`;
    if (!totem && c.linhas.length) lista.insertAdjacentHTML('afterbegin', '<button class="link cc-fechar" data-a="fechar-carrinho">‹ Continuar comprando</button>');
    $$('[data-menos]', lista).forEach((b) => (b.onclick = () => adicionar(b.dataset.menos, -1, false)));
    $$('[data-mais]', lista).forEach((b) => (b.onclick = () => adicionar(b.dataset.mais, 1, false)));
    $('[data-a=fechar-carrinho]', lista)?.addEventListener('click', fecharCarrinhoCel);
    $$('[data-total]', corpo).forEach((e) => (e.textContent = brl(c.subtotal)));
    $$('[data-qtd]', corpo).forEach((e) => (e.textContent = c.qtdItens));
    $('[data-a=pagar]', corpo).disabled = !c.linhas.length;
    const barra = $('.cc-barra', corpo);
    if (barra) barra.hidden = !c.linhas.length;
    renderGrade();
    persistir();
  }
  function fecharCarrinhoCel() {
    $('.co-carrinho', corpo)?.classList.remove('aberto');
    document.body.classList.remove('sem-rolagem');
  }

  function adicionar(pid, delta = 1, avisar = true) {
    const p = D.produto(pid);
    if (!p || !p.ativo) return;
    const q = (st.cart.get(pid) || 0) + delta;
    if (q <= 0) st.cart.delete(pid);
    else st.cart.set(pid, Math.min(q, 99));
    if (delta > 0) bip();
    if (avisar) toast(`${p.emoji} ${p.nome} adicionado`, 'ok', 1400);
    if (st.etapa === 'compra') renderCarrinho();
  }

  function lerCodigo(cod) {
    const p = D.produtoPorEan(cod);
    if (!p) {
      bip(false);
      toast(`Código ${cod} não cadastrado. Escolha o produto na lista.`, 'erro', 3500);
      return;
    }
    if (st.etapa !== 'compra') telaCompra();
    adicionar(p.id);
  }

  // ---------- Etapa: pagamento ----------
  function telaPagamento() {
    st.etapa = 'pagamento';
    fecharCarrinhoCel();
    const c = conta();
    if (st.cupom && c.erroCupom) st.cupom = '';
    const r = conta();
    const restrito = r.linhas.some((l) => l.restrito18);
    const ident = st.clienteId && D.cliente(st.clienteId);
    const identOk = ident && D.situacaoIdade(ident).ok;
    corpo.innerHTML = `
      <section class="pay">
        <button class="link voltar" data-a="voltar">‹ Voltar ao carrinho</button>
        <h1>Como você quer pagar?</h1>
        ${restrito ? `<div class="aviso-18"><span>🔞</span><p>Seu carrinho tem bebida alcoólica, proibida para menores de 18 anos.${identOk ? ` Maioridade confirmada: <b>${esc(ident.nome.split(' ')[0])}</b> ✓` : ' Vamos confirmar sua identidade antes do pagamento.'}</p></div>` : ''}
        <div class="pay-grade">
          <div class="cartao pay-resumo">
            <h3>Resumo · ${r.qtdItens} ${r.qtdItens === 1 ? 'item' : 'itens'}</h3>
            <ul class="resumo-lista">${r.linhas.map((l) => `<li><span>${l.qtd}× ${esc(l.nome)}</span><span>${brl(l.total)}</span></li>`).join('')}</ul>
            <div class="linha"><span>Subtotal</span><span>${brl(r.subtotal)}</span></div>
            ${r.desconto ? `<div class="linha desconto"><span>Cupom ${esc(r.cupom)}</span><span>− ${brl(r.desconto)}</span></div>` : ''}
            <form class="cupom" autocomplete="off">
              <input name="cupom" placeholder="Cupom de desconto" value="${esc(st.cupom)}" aria-label="Cupom">
              <button class="btn ghost">${r.cupom ? 'Remover' : 'Aplicar'}</button>
            </form>
            <div class="linha total"><span>Total</span><b>${brl(r.total)}</b></div>
          </div>
          <div class="pay-opcoes">
            ${
              totem
                ? `<button class="opcao" data-pag="credito"><span>💳</span><b>Crédito</b><small>Maquininha ao lado</small></button>
                   <button class="opcao" data-pag="debito"><span>💳</span><b>Débito</b><small>Maquininha ao lado</small></button>
                   <button class="opcao destaque" data-pag="saldo"><span>👛</span><b>Saldo da carteira</b><small>CPF ou celular + PIN</small></button>`
                : `<button class="opcao destaque" data-pag="saldo"><span>👛</span><b>Pagar com saldo</b><small>Rápido, direto pelo celular</small></button>
                   <button class="opcao" data-pag="totem"><span>💳</span><b>Cartão no totem</b><small>Gera um código para pagar na maquininha</small></button>`
            }
          </div>
        </div>
      </section>`;
    $('[data-a=voltar]', corpo).onclick = telaCompra;
    const f = $('.cupom', corpo);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      if (r.cupom) {
        st.cupom = '';
        return telaPagamento();
      }
      const cod = f.cupom.value.trim();
      if (!cod) return;
      const t = D.calcular(itens(), cod);
      if (t.erroCupom) return toast(t.erroCupom, 'erro', 3500);
      st.cupom = t.cupom;
      toast(`Cupom aplicado: − ${brl(t.desconto)}`, 'ok');
      telaPagamento();
    });
    $$('[data-pag]', corpo).forEach(
      (b) =>
        (b.onclick = () => {
          const t = b.dataset.pag;
          const seguir = () => (t === 'totem' ? telaCodigoCelular() : telaCartao(t));
          if (t === 'saldo') telaSaldo();
          else if (restrito) exigirMaior(seguir);
          else seguir();
        }),
    );
    persistir();
  }

  function telaCartao(tipo) {
    st.etapa = 'cartao';
    const r = conta();
    corpo.innerHTML = `
      <section class="pay pay-centro">
        <div class="maquininha">💳</div>
        <h1>${brl(r.total)}</h1>
        <p class="grande-txt">Aproxime, insira ou passe seu cartão de <b>${tipo === 'credito' ? 'crédito' : 'débito'}</b> na maquininha.</p>
        <p class="aguarde"><span class="pontos"></span> Aguardando pagamento</p>
        <div class="demo-box">
          <small>Modo demonstração: a maquininha ainda não está integrada.</small>
          <div class="demo-botoes">
            <button class="btn lime" data-a="aprovar">✔ Simular aprovado</button>
            <button class="btn ghost-escuro" data-a="recusar">✖ Simular recusado</button>
          </div>
        </div>
        <button class="link" data-a="cancelar">Cancelar e escolher outra forma</button>
      </section>`;
    $('[data-a=cancelar]', corpo).onclick = telaPagamento;
    $('[data-a=recusar]', corpo).onclick = () => {
      bip(false);
      toast('Pagamento recusado pela maquininha. Tente de novo ou use outra forma.', 'erro', 4500);
      telaPagamento();
    };
    $('[data-a=aprovar]', corpo).onclick = () =>
      concluir({ pagamento: tipo, autorizacao: String(Math.floor(100000 + Math.random() * 900000)) });
  }

  function telaSaldo() {
    st.etapa = 'saldo';
    const r = conta();
    const logado = st.clienteId && D.cliente(st.clienteId);
    corpo.innerHTML = `
      <section class="pay pay-centro">
        <button class="link voltar" data-a="voltar">‹ Outras formas de pagamento</button>
        <h1>👛 Pagar ${brl(r.total)} com saldo</h1>
        ${logado ? `<p class="grande-txt">Olá, <b>${esc(logado.nome.split(' ')[0])}</b>! Seu saldo: <b>${brl(logado.saldo)}</b></p>` : '<p class="grande-txt">Identifique-se com seu CPF ou celular.</p>'}
        <form class="form-saldo cartao" autocomplete="off">
          ${logado ? '' : `<label>CPF ou celular<input name="ident" inputmode="numeric" maxlength="14" required></label>`}
          <label>PIN (4 números)<input name="pin" type="password" inputmode="numeric" maxlength="4" pattern="\\d{4}" required></label>
          ${totem ? tecladoHTML() : ''}
          <button class="btn lime grande bloco">Confirmar pagamento</button>
          ${totem ? '' : '<a class="link" href="#/cliente">Não tem conta? Crie a sua e recarregue</a>'}
        </form>
      </section>`;
    $('[data-a=voltar]', corpo).onclick = telaPagamento;
    const f = $('.form-saldo', corpo);
    if (totem) ligarTeclado(f);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        const cli = logado ? D.autenticar(logado.cpf || logado.telefone, f.pin.value) : D.autenticar(f.ident.value, f.pin.value);
        if (cli.saldo + 1e-9 < r.total) {
          bip(false);
          return modal({
            title: 'Saldo insuficiente',
            body: `<p>Seu saldo é <b>${brl(cli.saldo)}</b> e a compra é de <b>${brl(r.total)}</b>.</p><p>${totem ? 'Recarregue pelo celular em “Minha carteira” ou pague no cartão.' : 'Faça uma recarga e volte para concluir.'}</p>`,
            actions: totem ? [{ label: 'Pagar no cartão', cls: 'primary', onClick: telaPagamento }] : [{ label: 'Voltar' }, { label: 'Recarregar agora', cls: 'primary', onClick: () => (location.hash = '#/cliente') }],
          });
        }
        if (r.linhas.some((l) => l.restrito18)) {
          const si = D.situacaoIdade(cli);
          if (!si.ok) return negadoIdade(si);
        }
        st.clienteId = cli.id;
        if (!totem) Sess.entrarCliente(cli.id);
        concluir({ pagamento: 'saldo', clienteId: cli.id });
      } catch (err) {
        bip(false);
        toast(err.message, 'erro', 3500);
        f.pin.value = '';
      }
    });
  }

  function concluir({ pagamento, autorizacao = null, clienteId = null }) {
    try {
      st.venda = D.finalizarVenda({ lojaId, canal: modo, itens: itens(), pagamento, clienteId: clienteId || st.clienteId, cupom: st.cupom, autorizacao });
    } catch (err) {
      toast(err.message, 'erro', 4500);
      return telaPagamento();
    }
    st.cart.clear();
    st.cupom = '';
    persistir();
    telaFim();
  }

  function telaFim() {
    st.etapa = 'fim';
    const v = st.venda;
    const cli = v.clienteId && D.cliente(v.clienteId);
    corpo.innerHTML = `
      <section class="pay pay-centro fim">
        <div class="ok-circulo">✓</div>
        <h1>Compra concluída!</h1>
        <p class="grande-txt">${esc(D.cfg().slogan || 'Obrigado e volte sempre!')}</p>
        <div class="cartao recibo">
          <div class="linha"><span>Compra nº</span><b>${v.numero}</b></div>
          <div class="linha"><span>${new Date(v.ts).toLocaleString('pt-BR')}</span><span>${esc(L.nome)}</span></div>
          <ul class="resumo-lista">${v.itens.map((i) => `<li><span>${i.qtd}× ${esc(i.nome)}</span><span>${brl(i.preco * i.qtd)}</span></li>`).join('')}</ul>
          ${v.desconto ? `<div class="linha desconto"><span>Desconto (${esc(v.cupom)})</span><span>− ${brl(v.desconto)}</span></div>` : ''}
          <div class="linha total"><span>Total</span><b>${brl(v.total)}</b></div>
          <div class="linha"><span>Pagamento</span><span>${NOME_PAG[v.pagamento]}${v.autorizacao ? ` · aut. ${v.autorizacao}` : ''}</span></div>
          ${cli ? `<div class="linha"><span>Saldo restante</span><b>${brl(cli.saldo)}</b></div>` : ''}
        </div>
        <button class="btn primary grande" data-a="nova">Nova compra${totem ? ' <small data-cont></small>' : ''}</button>
      </section>`;
    $('[data-a=nova]', corpo).onclick = reiniciar;
    renderConta();
    if (totem) {
      let s = 15;
      const el = $('[data-cont]', corpo);
      const iv = setInterval(() => {
        s--;
        if (el) el.textContent = `(${s})`;
        if (s <= 0 || st.etapa !== 'fim') {
          clearInterval(iv);
          if (st.etapa === 'fim') reiniciar();
        }
      }, 1000);
      limpar.push(() => clearInterval(iv));
    }
  }

  function telaCodigoCelular() {
    const cod = D.guardarCarrinho(lojaId, itens(), st.cupom);
    st.etapa = 'codigo';
    const r = conta();
    corpo.innerHTML = `
      <section class="pay pay-centro">
        <h1>Pague no totem da loja</h1>
        <p class="grande-txt">No totem, toque em <b>“Montei no celular — digitar código”</b> e informe:</p>
        <div class="codigo-grande">${cod.slice(0, 3)} ${cod.slice(3)}</div>
        <p>Total: <b>${brl(r.total)}</b> · válido por 30 minutos</p>
        <button class="btn primary grande" data-a="feito">Já paguei / nova compra</button>
        <button class="link" data-a="voltar">‹ Voltar</button>
      </section>`;
    $('[data-a=voltar]', corpo).onclick = telaPagamento;
    $('[data-a=feito]', corpo).onclick = () => {
      st.cart.clear();
      st.cupom = '';
      persistir();
      telaCompra();
    };
  }

  function abrirCodigo() {
    const m = modal({
      title: 'Código do celular',
      body: `<form class="form-codigo"><p>Digite o código de 6 números que apareceu no seu celular.</p><input name="cod" inputmode="numeric" maxlength="6" class="input-grande" required>${tecladoHTML()}</form>`,
      actions: [
        { label: 'Cancelar' },
        {
          label: 'Carregar carrinho',
          cls: 'primary',
          onClick: (ctx) => {
            const c = D.resgatarCarrinho(ctx.el.querySelector('[name=cod]').value, lojaId);
            c.itens.forEach((i) => D.produto(i.produtoId) && st.cart.set(i.produtoId, (st.cart.get(i.produtoId) || 0) + i.qtd));
            if (c.cupom) st.cupom = c.cupom;
            toast('Carrinho carregado! Escolha crédito ou débito.', 'ok');
            telaPagamento();
          },
        },
      ],
    });
    ligarTeclado(m.el.querySelector('form'));
  }

  // ---------- Identificação e maioridade ----------
  function telaIdentificar({ titulo, texto, aoOk, voltar = telaCompra }) {
    st.etapa = 'identificar';
    const logado = !totem && st.clienteId && D.cliente(st.clienteId);
    corpo.innerHTML = `
      <section class="pay pay-centro">
        <button class="link voltar" data-a="voltar">‹ Voltar</button>
        <h1>${titulo}</h1>
        <p class="grande-txt">${texto}</p>
        <form class="form-ident cartao" autocomplete="off">
          ${logado ? `<p>Olá, <b>${esc(logado.nome.split(' ')[0])}</b>! Confirme com seu PIN.</p>` : '<label>CPF ou celular<input name="ident" inputmode="numeric" maxlength="14" required></label>'}
          <label>PIN (4 números)<input name="pin" type="password" inputmode="numeric" maxlength="4" required></label>
          ${totem ? tecladoHTML() : ''}
          <button class="btn lime grande bloco">Continuar</button>
          ${totem ? '' : '<a class="link" href="#/cliente">Ainda não tem cadastro? Crie sua conta</a>'}
        </form>
      </section>`;
    $('[data-a=voltar]', corpo).onclick = voltar;
    const f = $('.form-ident', corpo);
    if (totem) ligarTeclado(f);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        const cli = logado ? D.autenticar(logado.cpf || logado.telefone, f.pin.value) : D.autenticar(f.ident.value, f.pin.value);
        st.clienteId = cli.id;
        if (!totem) Sess.entrarCliente(cli.id);
        renderConta();
        aoOk(cli);
      } catch (err) {
        bip(false);
        toast(err.message, 'erro', 3500);
        f.pin.value = '';
      }
    });
  }

  function exigirMaior(seguir) {
    const cli = st.clienteId && D.cliente(st.clienteId);
    const continuar = (c) => {
      const si = D.situacaoIdade(c);
      return si.ok ? seguir() : negadoIdade(si);
    };
    if (cli) return continuar(cli);
    telaIdentificar({
      titulo: '🔞 Confirme sua identidade',
      texto: 'Bebida alcoólica só pode ser vendida para maiores de 18 anos. Informe seu CPF ou celular e o PIN da sua conta.',
      aoOk: continuar,
      voltar: telaPagamento,
    });
  }

  function negadoIdade(si, { geladeira = false } = {}) {
    st.etapa = 'negado';
    bip(false);
    const comoResolver = si.pendente
      ? D.cfg().idade.modo === 'ponte'
        ? 'Abra “Minha carteira” no celular, confira seu CPF e data de nascimento e toque em “Verificar minha idade”.'
        : 'Mostre um documento com foto ao responsável pela loja para liberar seu cadastro.'
      : si.recusado
        ? 'Se você acha que houve um erro, fale com o responsável pela loja.'
        : '';
    corpo.innerHTML = `
      <section class="pay pay-centro">
        <div class="negado-circulo">⛔</div>
        <h1>${geladeira ? 'Não foi possível abrir a geladeira' : 'Não podemos concluir esta compra'}</h1>
        <p class="grande-txt">${esc(si.motivo)}</p>
        ${comoResolver ? `<p>${comoResolver}</p>` : ''}
        ${!geladeira && st.cart.size ? '<button class="btn primary grande" data-a="tirar18">Remover itens 18+ e continuar</button>' : ''}
        <button class="btn ghost-escuro" data-a="voltar">${geladeira ? 'Voltar às compras' : 'Voltar ao carrinho'}</button>
      </section>`;
    $('[data-a=voltar]', corpo).onclick = () => {
      if (totem) st.clienteId = null;
      renderConta();
      telaCompra();
    };
    $('[data-a=tirar18]', corpo)?.addEventListener('click', () => {
      for (const id of [...st.cart.keys()]) if (D.produto(id)?.restrito18) st.cart.delete(id);
      if (totem) st.clienteId = null;
      renderConta();
      st.cart.size ? telaPagamento() : telaCompra();
    });
  }

  // ---------- Geladeira com trava ----------
  function telaGeladeira(escolhida = null) {
    const gs = D.geladeirasDaLoja(lojaId);
    const g = escolhida || (gs.length === 1 ? gs[0] : null);
    if (!g) {
      st.etapa = 'geladeira';
      corpo.innerHTML = `
        <section class="pay pay-centro">
          <button class="link voltar" data-a="voltar">‹ Voltar</button>
          <h1>🧊 Qual geladeira?</h1>
          <div class="pay-opcoes lista-gel">${gs.map((x) => `<button class="opcao" data-g="${x.id}"><span>🧊</span><b>${esc(x.nome)}</b><small>${x.apenasMaiores ? 'Somente maiores de 18 anos' : 'Livre'}</small></button>`).join('')}</div>
        </section>`;
      $('[data-a=voltar]', corpo).onclick = telaCompra;
      $$('[data-g]', corpo).forEach((b) => (b.onclick = () => telaGeladeira(D.geladeira(b.dataset.g))));
      return;
    }
    const executar = async (cli) => {
      st.etapa = 'abrindo';
      corpo.innerHTML = `<section class="pay pay-centro"><div class="maquininha">🧊</div><h1>${g.apenasMaiores ? 'Conferindo sua idade…' : 'Destravando…'}</h1><p class="aguarde"><span class="pontos"></span> Aguarde um instante</p></section>`;
      const r = await G.abrirGeladeira({ geladeiraId: g.id, clienteId: cli.id, canal: modo });
      if (st.etapa !== 'abrindo') return;
      if (!r.ok && r.falhaTecnica) {
        bip(false);
        toast(`Não foi possível destravar: ${r.motivo}`, 'erro', 5000);
        return telaCompra();
      }
      if (!r.ok) return negadoIdade(r, { geladeira: true });
      telaGeladeiraAberta(g, r.segundos, cli);
    };
    // No totem, cada abertura pede CPF/celular + PIN (outra pessoa pode estar usando a tela).
    telaIdentificar({
      titulo: `🧊 ${esc(g.nome)}`,
      texto: g.apenasMaiores ? 'Exclusiva para maiores de 18 anos. Identifique-se para destravar a porta.' : 'Identifique-se para destravar a porta.',
      aoOk: executar,
    });
  }

  function telaGeladeiraAberta(g, segundos, cli) {
    st.etapa = 'aberta';
    bip();
    corpo.innerHTML = `
      <section class="pay pay-centro fim">
        <div class="ok-circulo">🔓</div>
        <h1>Geladeira destravada!</h1>
        <p class="grande-txt">${esc(cli.nome.split(' ')[0])}, puxe a porta agora. Ela trava de novo em <b data-seg>${segundos}</b> s.</p>
        <p>Pegue seus produtos, feche a porta e escaneie tudo aqui para pagar.</p>
        <button class="btn primary grande" data-a="comprar">📷 Escanear meus produtos</button>
      </section>`;
    $('[data-a=comprar]', corpo).onclick = telaCompra;
    let s = segundos;
    const iv = setInterval(() => {
      s--;
      const el = $('[data-seg]', corpo);
      if (el) el.textContent = Math.max(s, 0);
      if (s <= 0 || st.etapa !== 'aberta') {
        clearInterval(iv);
        if (st.etapa === 'aberta') telaCompra();
      }
    }, 1000);
    limpar.push(() => clearInterval(iv));
  }

  function abrirLogin() {
    modal({
      title: 'Entrar na carteira',
      body: `<form class="form-col"><label>CPF ou celular<input name="ident" inputmode="numeric" required></label><label>PIN<input name="pin" type="password" inputmode="numeric" maxlength="4" required></label><a class="link" href="#/cliente">Criar conta</a></form>`,
      actions: [
        { label: 'Cancelar' },
        {
          label: 'Entrar',
          cls: 'primary',
          onClick: (ctx) => {
            const f = ctx.el.querySelector('form');
            const c = D.autenticar(f.ident.value, f.pin.value);
            Sess.entrarCliente(c.id);
            st.clienteId = c.id;
            toast(`Bem-vindo(a), ${c.nome.split(' ')[0]}!`, 'ok');
            renderConta();
          },
        },
      ],
    });
  }

  function reiniciar() {
    st.cart.clear();
    st.cupom = '';
    st.busca = '';
    st.cat = 'Todos';
    st.venda = null;
    if (totem) st.clienteId = null;
    persistir();
    renderConta();
    document.querySelectorAll('.modal-wrap').forEach((m) => m.remove());
    telaCompra();
  }

  // ---------- Ciclo de vida ----------
  renderConta();
  telaCompra();
  limpar.push(escutarLeitor(lerCodigo));
  limpar.push(
    D.aoMudar(() => {
      renderConta();
      if (st.etapa === 'compra') renderCarrinho();
    }),
  );
  if (totem) {
    const iv = setInterval(() => {
      const r = $('.relogio', root);
      if (r) r.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }, 15e3);
    let timer;
    const armar = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (st.cart.size || st.etapa !== 'compra') reiniciar();
      }, OCIOSO_MS);
    };
    ['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, armar));
    armar();
    limpar.push(() => {
      clearInterval(iv);
      clearTimeout(timer);
      ['pointerdown', 'keydown'].forEach((ev) => document.removeEventListener(ev, armar));
    });
  }
  return () => {
    limpar.forEach((f) => f());
    document.body.classList.remove('sem-rolagem');
  };
}

