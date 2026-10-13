// Área do cliente: conta, saldo da carteira, recarga, extrato e cupons.
import * as D from './db.js';
import * as Sess from './sessao.js';
import { $, $$, esc, brl, toast, modal, logoSVG, fmtDataHora, fmtIso, lerForm } from './ui.js';
import * as G from './geladeira.js';

const ICONE = { recarga: '⬆️', bonus: '🎁', compra: '🛒', estorno: '↩️', ajuste: '✏️' };

export function renderCliente(root) {
  let aba = 'entrar';
  const desliga = D.aoMudar(() => desenhar());

  function desenhar() {
    const id = Sess.clienteLogado();
    root.innerHTML = `<div class="cli">
      <header class="cli-top"><a class="co-marca" href="#/">${logoSVG(36)}<span><b>${esc(D.cfg().nome)}</b><small>Minha carteira</small></span></a></header>
      <main class="cli-corpo">${id ? painel(D.cliente(id)) : acesso()}</main></div>`;
    id ? ligarPainel(D.cliente(id)) : ligarAcesso();
  }

  function acesso() {
    return `
      <div class="cartao cli-acesso">
        <div class="abas"><button data-aba="entrar" class="${aba === 'entrar' ? 'ativo' : ''}">Entrar</button><button data-aba="criar" class="${aba === 'criar' ? 'ativo' : ''}">Criar conta</button></div>
        ${
          aba === 'entrar'
            ? `<form class="form-col" data-f="entrar" autocomplete="on">
                <label>CPF ou celular<input name="ident" inputmode="numeric" required autocomplete="username"></label>
                <label>PIN (4 números)<input name="pin" type="password" inputmode="numeric" maxlength="4" required autocomplete="current-password"></label>
                <button class="btn primary grande bloco">Entrar</button>
                <p class="muted small">Demonstração: CPF <b>111.222.333-96</b>, PIN <b>1234</b></p>
              </form>`
            : `<form class="form-col" data-f="criar">
                <label>Nome completo<input name="nome" required autocomplete="name"></label>
                <label>Celular com DDD<input name="telefone" inputmode="tel" required placeholder="(82) 99999-0000" autocomplete="tel"></label>
                <label>CPF <small>(necessário para a geladeira de bebidas)</small><input name="cpf" inputmode="numeric" maxlength="14"></label>
                <label>Data de nascimento<input name="nascimento" type="date" required></label>
                <label class="check consent"><input type="checkbox" name="consentimento"> Autorizo o uso do meu CPF para confirmar que sou maior de 18 anos (LGPD, art. 7º). O dado é usado só para liberar produtos 18+.</label>
                <label>Crie um PIN de 4 números<input name="pin" type="password" inputmode="numeric" maxlength="4" pattern="\\d{4}" required></label>
                <button class="btn primary grande bloco">Criar minha carteira</button>
                <p class="muted small">Com a carteira você paga as compras direto pelo celular ou no totem e ganha bônus nas recargas.</p>
              </form>`
        }
      </div>`;
  }

  function ligarAcesso() {
    $$('[data-aba]', root).forEach((b) => (b.onclick = () => ((aba = b.dataset.aba), desenhar())));
    $('[data-f=entrar]', root)?.addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        const c = D.autenticar(e.target.ident.value, e.target.pin.value);
        Sess.entrarCliente(c.id);
        desenhar();
      } catch (err) {
        toast(err.message, 'erro');
      }
    });
    $('[data-f=criar]', root)?.addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        const c = D.salvarCliente(lerForm(e.target));
        Sess.entrarCliente(c.id);
        toast('Conta criada! Faça sua primeira recarga.', 'ok');
        desenhar();
        if (D.cfg().idade.modo === 'ponte' && c.cpf) verificar(c.id);
      } catch (err) {
        toast(err.message, 'erro', 3500);
      }
    });
  }

  function painel(c) {
    const ext = D.extrato(c.id).slice(0, 40);
    const compras = D.db().vendas.filter((v) => v.clienteId === c.id).length;
    const cupons = D.db().cupons.filter((k) => k.ativo && (!k.validade || D.diasAte(k.validade) >= 0));
    const { bonusRecargaPct: bp, bonusRecargaMin: bm } = D.cfg();
    return `
      <div class="carteira-card">
        <div class="cc-topo"><span>Olá, ${esc(c.nome.split(' ')[0])}</span><button class="link claro" data-a="sair">Sair</button></div>
        <small>Saldo disponível</small>
        <div class="saldo">${brl(c.saldo)}</div>
        <div class="cc-acoes">
          <button class="btn lime" data-a="recarregar">⬆️ Recarregar</button>
          <button class="btn ghost-escuro" data-a="comprar">🛒 Comprar agora</button>
        </div>
        ${bp > 0 ? `<p class="bonus-tag">🎁 Ganhe ${bp}% de bônus em recargas a partir de ${brl(bm)}</p>` : ''}
      </div>
      ${blocoIdade(c)}
      ${
        cupons.length
          ? `<h3 class="sec">Cupons disponíveis</h3><div class="cupons">${cupons
              .map((k) => `<div class="cupom-tag"><b>${esc(k.codigo)}</b><span>${k.tipo === 'pct' ? `${k.valor}% off` : `${brl(k.valor)} off`}${k.minimo ? ` acima de ${brl(k.minimo)}` : ''}${k.validade ? ` · até ${fmtIso(k.validade)}` : ''}</span></div>`)
              .join('')}</div>`
          : ''
      }
      <h3 class="sec">Extrato <small class="muted">${compras} compras</small></h3>
      <div class="cartao extrato">${
        ext.length
          ? ext
              .map(
                (m) => `<div class="ext-item"><span class="ext-ic">${ICONE[m.tipo] || '•'}</span><span class="ext-info"><b>${esc(m.descricao)}</b><small>${fmtDataHora(m.ts)}</small></span><span class="ext-val ${m.valor < 0 ? 'neg' : 'pos'}">${m.valor < 0 ? '−' : '+'} ${brl(Math.abs(m.valor))}</span></div>`,
              )
              .join('')
          : '<p class="muted">Nenhuma movimentação ainda.</p>'
      }</div>
      <details class="cartao"><summary>Meus dados</summary>
        <form class="form-col" data-f="dados">
          <input type="hidden" name="id" value="${c.id}">
          <label>Nome<input name="nome" value="${esc(c.nome)}" required></label>
          <label>Celular<input name="telefone" value="${esc(c.telefone)}" required></label>
          <label>CPF<input name="cpf" value="${esc(c.cpf)}"></label>
          <label>Data de nascimento<input name="nascimento" type="date" value="${esc(c.nascimento || '')}"></label>
          ${c.consentimento ? '' : '<label class="check consent"><input type="checkbox" name="consentimento"> Autorizo o uso do meu CPF para verificar a maioridade (LGPD).</label>'}
          <p class="muted small">Alterar CPF ou data de nascimento exige nova verificação de idade.</p>
          <label>PIN<input name="pin" type="password" inputmode="numeric" maxlength="4" value="${esc(c.pin)}" required></label>
          <button class="btn primary">Salvar</button>
        </form>
      </details>`;
  }

  function ligarPainel(c) {
    $('[data-a=sair]', root).onclick = () => {
      Sess.sairCliente();
      aba = 'entrar';
      desenhar();
    };
    $('[data-a=recarregar]', root).onclick = () => abrirRecarga(c);
    $('[data-a=verificar]', root)?.addEventListener('click', () => verificar(c.id));
    $('[data-a=comprar]', root).onclick = () => escolherLoja();
    $('[data-f=dados]', root).addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        D.salvarCliente(lerForm(e.target));
        toast('Dados atualizados', 'ok');
      } catch (err) {
        toast(err.message, 'erro');
      }
    });
  }

  function blocoIdade(c) {
    const st = c.verificacao?.status || 'pendente';
    const modo = D.cfg().idade.modo;
    const temGeladeira = D.db().geladeiras.some((g) => g.ativa && g.apenasMaiores);
    if (!temGeladeira && !D.db().produtos.some((p) => p.restrito18 && p.ativo)) return '';
    const falta = !D.cpfValido(c.cpf) ? 'Informe seu CPF em “Meus dados”.' : !c.nascimento ? 'Informe sua data de nascimento em “Meus dados”.' : '';
    const texto =
      st === 'aprovado'
        ? 'Maioridade confirmada. Você já pode abrir a geladeira de bebidas e comprar produtos 18+.'
        : st === 'recusado'
          ? 'Não conseguimos confirmar que você tem 18 anos ou mais. Se houve erro, fale com o responsável pela loja.'
          : falta || (modo === 'ponte' ? 'Toque em verificar: consultamos seu CPF na hora.' : 'Mostre um documento com foto ao responsável pela loja para liberar a geladeira de bebidas.');
    return `<div class="cartao verif verif-${st}">
      <div class="verif-topo"><span class="verif-ic">${st === 'aprovado' ? '✅' : st === 'recusado' ? '⛔' : '🔞'}</span><div><b>Verificação de idade</b><small>${st === 'aprovado' ? 'Aprovada' : st === 'recusado' ? 'Recusada' : 'Pendente'}</small></div></div>
      <p>${texto}</p>
      ${st === 'pendente' && modo === 'ponte' && !falta ? '<button class="btn primary bloco" data-a="verificar">Verificar minha idade</button>' : ''}
    </div>`;
  }

  async function verificar(id) {
    try {
      toast('Consultando…', 'info', 1500);
      const v = await G.verificarNaPonte(id);
      toast(v.status === 'aprovado' ? 'Maioridade confirmada ✅' : 'Não foi possível confirmar a maioridade', v.status === 'aprovado' ? 'ok' : 'erro', 4000);
    } catch (err) {
      toast(err.message, 'erro', 4500);
    }
  }

  function abrirRecarga(c) {
    const { bonusRecargaPct: bp, bonusRecargaMin: bm } = D.cfg();
    let valor = 50;
    const m = modal({
      title: 'Recarregar carteira',
      body: `<form class="form-col">
          <div class="valores">${[20, 50, 100, 200].map((v) => `<button type="button" class="chip ${v === valor ? 'ativo' : ''}" data-v="${v}">${brl(v)}</button>`).join('')}</div>
          <label>Outro valor<input name="valor" type="number" min="5" step="0.01" value="${valor}"></label>
          <label>Pagar com<select name="meio"><option value="cartão de crédito">Cartão de crédito</option><option value="cartão de débito">Cartão de débito</option></select></label>
          <p class="bonus-info"></p>
          <p class="muted small">Modo demonstração: o pagamento é simulado. Na versão com integração, aqui abre o checkout do meio de pagamento.</p>
        </form>`,
      actions: [
        { label: 'Cancelar' },
        {
          label: 'Pagar e recarregar',
          cls: 'primary',
          onClick: (ctx) => {
            const f = ctx.el.querySelector('form');
            const v = Number(f.valor.value);
            if (!(v >= 5)) throw new Error('Valor mínimo de recarga: R$ 5,00');
            const r = D.recarregar(c.id, v, f.meio.value);
            toast(`Recarga de ${brl(v)} concluída${r.bonus ? ` + ${brl(r.bonus)} de bônus 🎁` : ''}`, 'ok', 4000);
          },
        },
      ],
    });
    const f = m.el.querySelector('form');
    const info = () => {
      const v = Number(f.valor.value) || 0;
      $('.bonus-info', f).innerHTML = bp > 0 ? (v >= bm ? `🎁 Você ganha <b>${brl((v * bp) / 100)}</b> de bônus!` : `Recarregue a partir de ${brl(bm)} e ganhe ${bp}% de bônus.`) : '';
      $$('[data-v]', f).forEach((b) => b.classList.toggle('ativo', +b.dataset.v === v));
    };
    $$('[data-v]', f).forEach((b) => (b.onclick = () => ((f.valor.value = b.dataset.v), info())));
    f.valor.addEventListener('input', info);
    info();
  }

  function escolherLoja() {
    const lojas = D.lojasVenda();
    if (lojas.length === 1) return (location.hash = `#/celular/${lojas[0].id}`);
    modal({
      title: 'Em qual loja você está?',
      body: `<div class="lista-lojas">${lojas.map((l) => `<a class="loja-item" href="#/celular/${l.id}"><b>📍 ${esc(l.nome)}</b><small>${esc(l.endereco)}</small></a>`).join('')}</div><p class="muted small">Dica: na loja, leia o QR Code colado no balcão para abrir direto.</p>`,
      actions: [],
    });
    $$('.loja-item').forEach((a) => a.addEventListener('click', () => document.querySelector('.modal-wrap')?.remove()));
  }

  desenhar();
  return desliga;
}
