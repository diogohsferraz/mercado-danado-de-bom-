// Chamadas à ponte (servidor que guarda as chaves secretas). Ver /ponte.
import * as D from './db.js';

export async function chamarPonte(rota, corpo, { admin = false } = {}) {
  const { ponteUrl, ponteChave, ponteChaveAdmin } = D.cfg().idade;
  if (!ponteUrl) throw new Error('A ponte não está configurada (Administração → Configurações)');
  const headers = { 'Content-Type': 'application/json' };
  if (admin && ponteChaveAdmin) headers['X-Chave-Admin'] = ponteChaveAdmin;
  else headers['X-Chave'] = ponteChave;
  let r;
  try {
    r = await fetch(ponteUrl.replace(/\/+$/, '') + rota, { method: corpo ? 'POST' : 'GET', headers, body: corpo ? JSON.stringify(corpo) : undefined });
  } catch {
    throw new Error('Sem conexão com a ponte. Verifique a internet e o endereço configurado.');
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) {
    const e = new Error(j.erro || `A ponte respondeu com erro ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return j;
}
