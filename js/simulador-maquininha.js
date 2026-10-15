// Maquininha simulada para PREVIEW no navegador (maquininha.html?simular=1).
// Imita a ponte do app Android (window.PlugPagNativo): mensagens da PlugPag, aprovação/recusa,
// Pix e a impressão do comprovante numa "bobina" na tela. Nunca liga no app real.
import { esc, brl } from './ui.js';

export function instalarSimulador() {
  if (window.PlugPagNativo) return;
  const css = document.createElement('style');
  css.textContent = `
    .sim-faixa{background:#B8F400;color:#111;font:600 12px/1.6 system-ui;text-align:center}
    .sim-painel{position:fixed;left:8px;right:8px;bottom:8px;z-index:2000;background:#1d1d1d;color:#fff;border:2px solid #FF6B00;border-radius:16px;padding:12px;font:15px system-ui;box-shadow:0 10px 30px rgba(0,0,0,.5)}
    .sim-painel b{color:#B8F400}.sim-painel small{color:#aaa;display:block;margin-bottom:8px}
    .sim-painel .sim-bt{display:flex;gap:8px;margin-top:10px}.sim-painel button{flex:1;border:0;border-radius:10px;padding:10px;font-weight:700;cursor:pointer}
    .sim-ok{background:#B8F400;color:#111}.sim-nao{background:#333;color:#fff}
    .sim-qr{background:#fff;color:#111;border-radius:8px;padding:10px;text-align:center;margin-top:8px;font:700 13px monospace}
    .sim-papel-fundo{position:fixed;inset:0;z-index:2100;background:rgba(0,0,0,.7);display:grid;place-items:center;padding:16px}
    .sim-papel{background:#fffef8;color:#111;width:300px;max-height:85vh;overflow:auto;padding:14px 12px 20px;font:12px/1.35 ui-monospace,monospace;box-shadow:0 10px 40px rgba(0,0,0,.6);border-top:6px dashed #ddd}
    .sim-papel div{white-space:pre-wrap;word-break:break-word}.sim-papel .c{text-align:center}.sim-papel .n{font-weight:700}.sim-papel .g{font-size:15px}
    .sim-papel button{margin-top:12px;width:100%;padding:10px;border:0;border-radius:8px;background:#FF6B00;color:#fff;font-weight:700}`;
  document.head.appendChild(css);
  const faixa = document.createElement('div');
  faixa.className = 'sim-faixa';
  faixa.textContent = 'PREVIEW · maquininha simulada (nenhum valor é cobrado)';
  document.body.prepend(faixa);

  const responder = (id, r, ms = 250) => setTimeout(() => window.__mdbNativo?.retorno(id, r), ms);
  const evento = (id, msg) => window.__mdbNativo?.evento(id, { codigo: 0, mensagem: msg });
  let painel = null;
  let pagamento = null;
  let seq = 0;
  const fechar = () => {
    painel?.remove();
    painel = null;
  };

  window.PlugPagNativo = {
    pagar(id, json) {
      const d = JSON.parse(json);
      const ref = d.referencia || String(++seq);
      fechar();
      painel = document.createElement('div');
      painel.className = 'sim-painel';
      const valor = brl(d.valorCentavos / 100);
      const etapas = d.tipo === 'pix' ? ['GERANDO QR CODE PIX', 'AGUARDANDO PAGAMENTO DO PIX'] : ['APROXIME, INSIRA OU PASSE O CARTÃO', 'PROCESSANDO', 'DIGITE A SENHA'];
      painel.innerHTML = `<small>Maquininha simulada · ${d.tipo.toUpperCase()} · ${valor}</small><div data-msg>${etapas[0]}</div>${d.tipo === 'pix' ? '<div class="sim-qr">▣ QR CODE PIX (simulado) ▣</div>' : ''}
        <div class="sim-bt"><button class="sim-ok">✔ Aprovar</button><button class="sim-nao">✖ Recusar</button></div>`;
      document.body.appendChild(painel);
      const msg = painel.querySelector('[data-msg]');
      etapas.forEach((t, k) => setTimeout(() => {
        if (pagamento === id) {
          msg.textContent = t;
          evento(id, t);
        }
      }, 400 + k * 900));
      pagamento = id;
      painel.querySelector('.sim-ok').onclick = () => {
        evento(id, 'APROVADO');
        fechar();
        pagamento = null;
        responder(id, { ok: true, transactionCode: 'SIM' + ref, transactionId: 'SIMID' + ref, nsu: String(100000 + Math.floor(Math.random() * 900000)), bandeira: d.tipo === 'pix' ? 'PIX' : 'VISA' });
      };
      painel.querySelector('.sim-nao').onclick = () => {
        fechar();
        pagamento = null;
        responder(id, { ok: false, mensagem: 'TRANSAÇÃO NEGADA (simulado)' });
      };
    },
    cancelarOperacao(id) {
      const p = pagamento;
      fechar();
      pagamento = null;
      responder(id, { ok: true }, 50);
      if (p) responder(p, { ok: false, mensagem: 'OPERAÇÃO CANCELADA' }, 100);
    },
    estornar(id) {
      responder(id, { ok: true, transactionCode: 'ESTORNO-SIM' }, 600);
    },
    imprimir(id, json) {
      const d = JSON.parse(json);
      const fundo = document.createElement('div');
      fundo.className = 'sim-papel-fundo';
      fundo.innerHTML = `<div class="sim-papel">${(d.linhas || [])
        .map((l) => `<div class="${l.centro ? 'c' : ''} ${l.negrito ? 'n' : ''} ${l.grande ? 'g' : ''}">${esc(l.t)}</div>`)
        .join('')}<button>Fechar (impressão simulada)</button></div>`;
      document.body.appendChild(fundo);
      fundo.querySelector('button').onclick = () => fundo.remove();
      responder(id, { ok: true }, 400);
    },
    reimprimirViaCliente(id) {
      window.PlugPagNativo.imprimir('_', JSON.stringify({ linhas: [{ t: 'VIA DO CLIENTE (simulada)', centro: true, negrito: true }, { t: 'Comprovante do cartão emitido pela PagBank', centro: true }] }));
      responder(id, { ok: true });
    },
    status(id) {
      responder(id, { ok: true, ativado: true, versaoApp: 'preview', webview: navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] || 'navegador' }, 50);
    },
    ativar(id) {
      responder(id, { ok: true });
    },
    configurar() {
      alert('No app da maquininha, aqui abre a configuração (endereço do site, código da loja e PIN).');
    },
  };
}
