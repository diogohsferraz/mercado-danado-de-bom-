// Ponte do Mercado Danado de Bom (Cloudflare Worker).
//
// Fica entre o app e dois serviços que exigem chaves secretas:
//   1. o provedor que informa a data de nascimento a partir do CPF (Serpro ou outro);
//   2. a Cena do eWeLink (webhook) que aciona o relé da trava magnética.
// A maioridade é conferida AQUI, no servidor, antes de destravar. O navegador não decide.
//
// Rotas:
//   GET  /status      → saúde da ponte (sem chave)
//   POST /verificar   { cpf }               → { ok, maior, nascimento? }
//   POST /destravar   { geladeira, cpf }    → { ok }   (403 se menor ou não confirmado)
//   POST /destravar   { geladeira, teste: true } com X-Chave-Admin → aciona sem cliente
//   POST /nfe/baixar  { chave } com X-Chave-Admin → { ok, xml }  (NF-e de compra pela chave de acesso)
//
// Variáveis e segredos: veja ponte/README.md.

export default {
  async fetch(req, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ORIGEM || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Chave, X-Chave-Admin',
      Vary: 'Origin',
    };
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const rota = new URL(req.url).pathname.replace(/\/+$/, '') || '/';
    try {
      if (rota === '/status') return json({ ok: true, provedor: env.PROVEDOR || 'teste', nfe: env.NFE_PROVEDOR || 'não configurado', geladeiras: Object.keys(geladeiras(env)) });

      const admin = !!env.CHAVE_ADMIN && igual(req.headers.get('X-Chave-Admin'), env.CHAVE_ADMIN);
      const app = !!env.CHAVE_APP && igual(req.headers.get('X-Chave'), env.CHAVE_APP);
      if (!admin && !app) return json({ ok: false, erro: 'Chave inválida' }, 401);
      if (req.method !== 'POST') return json({ ok: false, erro: 'Use POST' }, 405);
      const corpo = await req.json().catch(() => ({}));

      if (rota === '/verificar') {
        const r = await maioridade(limparCpf(corpo.cpf), env);
        return json({ ok: true, maior: r.maior, ...(env.RETORNAR_NASCIMENTO === '1' && r.nascimento ? { nascimento: r.nascimento } : {}) });
      }

      if (rota === '/destravar') {
        const g = geladeiras(env)[corpo.geladeira];
        if (!g) return json({ ok: false, erro: 'Geladeira não cadastrada na ponte' }, 404);
        if (corpo.teste) {
          if (!admin) return json({ ok: false, erro: 'O teste exige a chave de administrador' }, 403);
        } else {
          // Regra fixa: sem maioridade confirmada, o relé não é acionado.
          const r = await maioridade(limparCpf(corpo.cpf), env);
          if (!r.maior) return json({ ok: false, erro: 'Maioridade não confirmada para este CPF' }, 403);
        }
        await acionarWebhook(g);
        return json({ ok: true });
      }
      if (rota === '/nfe/baixar') {
        if (!admin) return json({ ok: false, erro: 'O download de notas exige a chave de administrador' }, 403);
        const chave = String(corpo.chave || '').replace(/\D/g, '');
        if (!chaveNfeValida(chave)) return json({ ok: false, erro: 'Chave de acesso inválida' }, 400);
        return json({ ok: true, xml: await baixarNfe(chave, env) });
      }
      return json({ ok: false, erro: 'Rota não encontrada' }, 404);
    } catch (e) {
      return json({ ok: false, erro: e.message || 'Erro interno' }, e.status || 500);
    }
  },
};

// ---------- utilidades ----------
function erro(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}
function igual(a, b) {
  // comparação em tempo constante
  a = String(a || '');
  b = String(b || '');
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
export function cpfValido(c) {
  if (!/^\d{11}$/.test(c) || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (n) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += +c[i] * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === +c[9] && dv(10) === +c[10];
}
function limparCpf(cpf) {
  const c = String(cpf || '').replace(/\D/g, '');
  if (!cpfValido(c)) throw erro('CPF inválido', 400);
  return c;
}
function geladeiras(env) {
  try {
    return JSON.parse(env.GELADEIRAS || '{}');
  } catch {
    throw erro('GELADEIRAS mal configurado (JSON inválido)', 500);
  }
}
// Aceita "ddmmaaaa", "dd/mm/aaaa" e "aaaa-mm-dd".
export function paraIso(txt) {
  const t = String(txt || '').trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{2})\/?(\d{2})\/?(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}
export function idade(iso, hoje = new Date()) {
  const [y, m, d] = iso.split('-').map(Number);
  let a = hoje.getUTCFullYear() - y;
  if (hoje.getUTCMonth() + 1 < m || (hoje.getUTCMonth() + 1 === m && hoje.getUTCDate() < d)) a--;
  return a;
}
async function hash(texto) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// ---------- maioridade ----------
// Guarda só o resultado (maior: sim/não) com o CPF em hash, para não pagar a consulta toda vez.
async function maioridade(cpf, env) {
  const chave = env.IDADES ? 'cpf:' + (await hash((env.SAL || '') + cpf)) : null;
  if (chave) {
    const salvo = await env.IDADES.get(chave, 'json');
    if (salvo) return salvo;
  }
  const nascimento = await consultarNascimento(cpf, env);
  const r = nascimento ? { maior: idade(nascimento) >= 18, nascimento } : { maior: false, nascimento: null };
  if (chave) {
    // "Maior" não muda: guarda por 1 ano. "Não confirmado": guarda 1 dia.
    await env.IDADES.put(chave, JSON.stringify({ maior: r.maior }), { expirationTtl: r.maior ? 365 * 86400 : 86400 });
  }
  return r;
}

async function consultarNascimento(cpf, env) {
  const prov = env.PROVEDOR || 'teste';

  if (prov === 'teste') {
    // Para testar sem custo: CPFs em TESTE_MENORES são tratados como menores.
    const menores = String(env.TESTE_MENORES || '').split(',').map((x) => x.replace(/\D/g, ''));
    return menores.includes(cpf) ? '2012-01-01' : '1990-01-01';
  }

  if (prov === 'serpro') {
    // API Consulta CPF do Serpro (contrato em loja.serpro.gov.br).
    // Confira os endereços no seu contrato; os padrões abaixo são os da documentação pública.
    const base = env.SERPRO_URL || 'https://gateway.apiserpro.serpro.gov.br/consulta-cpf-df/v1/cpf/';
    const tok = await fetch(env.SERPRO_TOKEN_URL || 'https://gateway.apiserpro.serpro.gov.br/token', {
      method: 'POST',
      headers: { Authorization: 'Basic ' + btoa(`${env.SERPRO_KEY}:${env.SERPRO_SECRET}`), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    if (!tok.ok) throw erro('Falha ao autenticar no provedor de CPF', 502);
    const { access_token } = await tok.json();
    const r = await fetch(base + cpf, { headers: { Authorization: 'Bearer ' + access_token, Accept: 'application/json' } });
    if (r.status === 404) return null;
    if (!r.ok) throw erro('Provedor de CPF indisponível', 502);
    const j = await r.json();
    return paraIso(j.nascimento);
  }

  if (prov === 'http') {
    // Qualquer provedor que responda JSON com a data de nascimento.
    // PROVEDOR_URL usa {cpf} no lugar do número; PROVEDOR_CAMPO é o caminho do campo (ex.: "dados.data_nascimento").
    const url = String(env.PROVEDOR_URL || '').replace('{cpf}', cpf);
    if (!url) throw erro('PROVEDOR_URL não configurado', 500);
    const headers = { Accept: 'application/json' };
    if (env.PROVEDOR_TOKEN) headers.Authorization = env.PROVEDOR_TOKEN;
    const r = await fetch(url, { headers });
    if (r.status === 404) return null;
    if (!r.ok) throw erro('Provedor de CPF indisponível', 502);
    const j = await r.json();
    const valor = String(env.PROVEDOR_CAMPO || 'nascimento')
      .split('.')
      .reduce((o, k) => (o == null ? o : o[k]), j);
    return paraIso(valor);
  }

  throw erro(`PROVEDOR desconhecido: ${prov}`, 500);
}

// ---------- trava (eWeLink) ----------
async function acionarWebhook(g) {
  if (!g.webhook) throw erro('Webhook da geladeira não configurado', 500);
  const r = await fetch(g.webhook, { method: g.metodo || 'GET' });
  if (!r.ok) throw erro(`eWeLink respondeu ${r.status}`, 502);
}

// ---------- NF-e de compra pela chave ----------
// A SEFAZ só libera o XML completo ao destinatário depois da "ciência da operação" (evento 210210),
// assinada com o certificado A1 da empresa. O provedor guarda o certificado e faz isso por nós.
export function chaveNfeValida(c) {
  if (!/^\d{44}$/.test(c)) return false;
  let soma = 0;
  let peso = 2;
  for (let i = 42; i >= 0; i--) {
    soma += +c[i] * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const dv = 11 - (soma % 11);
  return (dv >= 10 ? 0 : dv) === +c[43];
}

async function baixarNfe(chave, env) {
  const prov = env.NFE_PROVEDOR || '';
  let xml;
  if (prov === 'focus') {
    // Focus NFe (doc.focusnfe.com.br): o certificado A1 é cadastrado no painel deles.
    const base = (env.FOCUS_URL || 'https://api.focusnfe.com.br').replace(/\/+$/, '');
    const auth = 'Basic ' + btoa(`${env.FOCUS_TOKEN || ''}:`);
    // Ciência da operação: se já foi feita, o provedor recusa e seguimos para o download.
    await fetch(`${base}/v2/nfes_recebidas/${chave}/manifesto`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'ciencia' }),
    }).catch(() => null);
    const r = await fetch(`${base}/v2/nfes_recebidas/${chave}.xml`, { headers: { Authorization: auth } });
    if (r.status === 404) throw erro('A nota ainda não está disponível no provedor. Tente de novo em alguns minutos.', 404);
    if (r.status === 401 || r.status === 403) throw erro('Token do provedor de NF-e inválido', 502);
    if (!r.ok) throw erro(`Provedor de NF-e respondeu ${r.status}`, 502);
    xml = await r.text();
  } else if (prov === 'http') {
    // Qualquer serviço que devolva o XML: NFE_URL com {chave}; NFE_TOKEN vai no cabeçalho Authorization.
    const url = String(env.NFE_URL || '').replace('{chave}', chave);
    if (!url) throw erro('NFE_URL não configurado', 500);
    const r = await fetch(url, { headers: env.NFE_TOKEN ? { Authorization: env.NFE_TOKEN } : {} });
    if (r.status === 404) throw erro('Nota não encontrada no provedor', 404);
    if (!r.ok) throw erro(`Provedor de NF-e respondeu ${r.status}`, 502);
    xml = await r.text();
  } else throw erro('Download pela chave não configurado na ponte (defina NFE_PROVEDOR)', 501);
  if (!/<(nfeProc|NFe)[\s>]/.test(xml) || !xml.includes(chave)) throw erro('O provedor devolveu só o resumo da nota, não o XML completo. Aguarde a ciência ser processada e tente de novo.', 502);
  return xml;
}
