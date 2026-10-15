// Geladeira com trava (eWeLink) e verificação de maioridade.
//
// Modos da trava:
//  - simulada: só para testar o fluxo, não aciona nada.
//  - webhook:  o navegador chama direto o webhook de uma Cena do eWeLink. Serve para teste:
//              quem olhar o código da página consegue a URL e abre a geladeira.
//  - ponte:    o app chama a ponte (pasta /ponte). A ponte confere a maioridade pelo CPF no
//              provedor e só então aciona o eWeLink. As chaves ficam no servidor. Use em produção.
import * as D from './db.js';
import { digitos } from './ui.js';

import { chamarPonte } from './ponte.js';

export const statusPonte = () => chamarPonte('/status');

// Consulta a maioridade do cliente na ponte e grava o resultado no cadastro.
export async function verificarNaPonte(clienteId) {
  const c = D.cliente(clienteId);
  if (!D.cpfValido(c?.cpf)) throw new Error('Informe um CPF válido no cadastro');
  const r = await chamarPonte('/verificar', { cpf: digitos(c.cpf) });
  D.definirVerificacao(c.id, r.maior ? 'aprovado' : 'recusado', {
    fonte: 'ponte',
    nascimento: r.nascimento || null,
    obs: r.maior ? 'Maioridade confirmada pelo provedor' : r.motivo || 'Maioridade não confirmada pelo provedor',
  });
  return D.cliente(clienteId).verificacao;
}

export async function acionarTrava(g, { cliente = null, teste = false } = {}) {
  const t = g.trava;
  if (t.modo === 'simulada') return new Promise((ok) => setTimeout(ok, 700));
  if (t.modo === 'webhook') {
    if (!t.webhookUrl) throw new Error('URL do webhook não configurada');
    // A resposta vem "opaca" (no-cors): só dá para saber que a chamada saiu.
    await fetch(t.webhookUrl, { method: 'GET', mode: 'no-cors', cache: 'no-store' });
    return;
  }
  // Modo ponte: quem decide se abre é a ponte, conferindo a idade de novo.
  await chamarPonte('/destravar', { geladeira: t.ponteId || g.id, cpf: cliente ? digitos(cliente.cpf) : null, teste }, { admin: teste });
  // (a ponte confere a maioridade do CPF de novo, no servidor, antes de acionar o relé)
}

// Fluxo completo: confere a idade, destrava e registra a tentativa.
export async function abrirGeladeira({ geladeiraId, clienteId, canal }) {
  const g = D.geladeira(geladeiraId);
  const cli = D.cliente(clienteId);
  const base = { geladeiraId, lojaId: g.lojaId, clienteId, canal };
  // Cervejeira desligada na loja (ou inativa): o botão some e a trava também não abre.
  if (!D.geladeirasDaLoja(g.lojaId).includes(g)) {
    D.registrarAcesso({ ...base, ok: false, motivo: 'Cervejeira desligada nesta loja' });
    return { ok: false, motivo: 'Cervejeira desligada nesta loja', falhaTecnica: true };
  }
  // Regra fixa: só abre para cliente com maioridade confirmada (documento conferido ou consulta do CPF).
  const s = D.situacaoIdade(cli);
  if (!s.ok) {
    D.registrarAcesso({ ...base, ok: false, motivo: s.recusado ? 'Menor de 18 anos' : 'Idade não verificada' });
    return { ok: false, ...s };
  }
  try {
    await acionarTrava(g, { cliente: cli });
    D.registrarAcesso({ ...base, ok: true, motivo: 'Destravada' });
    return { ok: true, segundos: g.trava.segundos };
  } catch (e) {
    const negadoPelaPonte = e.status === 403;
    D.registrarAcesso({ ...base, ok: false, motivo: negadoPelaPonte ? 'Negado pela ponte: ' + e.message : 'Falha na trava: ' + e.message });
    return negadoPelaPonte ? { ok: false, motivo: e.message, recusado: true } : { ok: false, motivo: e.message, falhaTecnica: true };
  }
}
