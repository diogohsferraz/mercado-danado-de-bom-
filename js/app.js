// Roteador e página inicial.
import * as D from './db.js';
import { $, esc, logoSVG } from './ui.js';
import { renderCheckout } from './checkout.js';
import { renderCliente } from './cliente.js';
import { renderAdmin } from './admin.js';
import * as N from './nfce.js';

D.carregar();
const app = $('#app');
let desmontar = null;

function inicio(root) {
  const lojas = D.lojasVenda();
  root.innerHTML = `
    <div class="home">
      <header class="home-hero">
        ${logoSVG(84)}
        <h1>${esc(D.cfg().nome)}</h1>
        <p>${esc(D.cfg().slogan || '')}</p>
      </header>
      <div class="home-cards">
        <a class="home-card laranja" href="#/cliente"><span>👛</span><b>Minha carteira</b><small>Crie sua conta, recarregue e veja seu extrato</small></a>
        <div class="home-card">
          <span>📱</span><b>Comprar pelo celular</b><small>Escolha a loja onde você está</small>
          <div class="home-lojas">${lojas.map((l) => `<a class="btn mini ghost" href="#/celular/${l.id}">${esc(l.nome)}</a>`).join('') || '<em class="muted">Nenhuma loja ativa</em>'}</div>
        </div>
        <div class="home-card">
          <span>🖥️</span><b>Totem da loja</b><small>Abra no tablet/monitor de cada loja</small>
          <div class="home-lojas">${lojas.map((l) => `<a class="btn mini ghost" href="#/totem/${l.id}">${esc(l.nome)}</a>`).join('') || '<em class="muted">Nenhuma loja ativa</em>'}</div>
        </div>
        <a class="home-card preto" href="#/admin"><span>📊</span><b>Administração</b><small>Estoque, validade, reposição, vendas, clientes</small></a>
      </div>
      <p class="home-aviso">Versão de demonstração: os dados ficam salvos neste navegador e os pagamentos são simulados.</p>
    </div>`;
}

function rotear() {
  try {
    desmontar?.();
  } catch (e) {
    console.error(e);
  }
  desmontar = null;
  document.querySelectorAll('.modal-wrap').forEach((m) => m.remove());
  const [rota, arg] = (location.hash.replace(/^#\/?/, '') || '').split('/');
  document.body.dataset.rota = rota || 'inicio';
  app.innerHTML = '';
  if (rota === 'totem' || rota === 'celular') desmontar = renderCheckout(app, { lojaId: arg, modo: rota });
  else if (rota === 'cliente') desmontar = renderCliente(app);
  else if (rota === 'admin') desmontar = renderAdmin(app, arg || 'painel');
  else {
    inicio(app);
    desmontar = D.aoMudar(() => inicio(app));
  }
  document.title = `${D.cfg().nome}${rota === 'admin' ? ' · Administração' : rota === 'totem' ? ' · Totem' : ''}`;
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', rotear);
rotear();

// Fila de NFC-e: reenvia as notas que ficaram pendentes (sem internet ou SEFAZ fora do ar).
setTimeout(() => N.processarFila(), 5e3);
setInterval(() => N.processarFila(), 60e3);
window.addEventListener('online', () => N.processarFila());

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
