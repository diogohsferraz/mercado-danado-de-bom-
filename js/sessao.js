// Sessões locais: cliente logado no celular e acesso ao painel administrativo.
import * as D from './db.js';

const K_CLI = 'mddb:cliente';
const K_ADM = 'mddb:admin';

const ler = (store, k) => {
  try {
    return store.getItem(k);
  } catch {
    return null;
  }
};
const escrever = (store, k, v) => {
  try {
    if (v == null) store.removeItem(k);
    else store.setItem(k, v);
  } catch {
    /* armazenamento indisponível */
  }
};

export function clienteLogado() {
  const id = ler(localStorage, K_CLI);
  return id && D.cliente(id) ? id : null;
}
export const entrarCliente = (id) => escrever(localStorage, K_CLI, id);
export const sairCliente = () => escrever(localStorage, K_CLI, null);

export const adminLogado = () => ler(sessionStorage, K_ADM) === '1';
export function entrarAdmin(pin) {
  if (String(pin) !== String(D.cfg().pinAdmin)) throw new Error('PIN incorreto');
  escrever(sessionStorage, K_ADM, '1');
}
export const sairAdmin = () => escrever(sessionStorage, K_ADM, null);
