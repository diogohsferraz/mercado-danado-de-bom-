// Utilitários de interface: formatação, toasts, modais, gráficos e arquivos.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = (v) => fmtBRL.format(Number(v) || 0);
export const num = (v, d = 0) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d });
export const pct = (v) => `${num(v * 100, 1)}%`;
export const fmtData = (ts) => new Date(ts).toLocaleDateString('pt-BR');
export const fmtDataHora = (ts) =>
  new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
export const fmtIso = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
export const digitos = (s) => String(s ?? '').replace(/\D/g, '');

export const logoSVG = (size = 40) => `
<svg class="logo" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
  <circle cx="32" cy="32" r="30" fill="#111"/>
  <circle cx="32" cy="32" r="30" fill="none" stroke="#FF6B00" stroke-width="4"/>
  <path d="M16 26h32l-4 20H20z" fill="#FF6B00"/>
  <path d="M24 26l6-10M40 26l-6-10" stroke="#B8F400" stroke-width="4" stroke-linecap="round"/>
  <path d="M24 34v6M32 34v6M40 34v6" stroke="#111" stroke-width="3" stroke-linecap="round"/>
</svg>`;

// ---------- Toast ----------
let toastBox;
export function toast(msg, tipo = 'info', ms = 2600) {
  if (!toastBox) {
    toastBox = document.createElement('div');
    toastBox.className = 'toasts';
    toastBox.setAttribute('role', 'status');
    document.body.appendChild(toastBox);
  }
  const t = document.createElement('div');
  t.className = `toast toast-${tipo}`;
  t.textContent = msg;
  toastBox.appendChild(t);
  while (toastBox.children.length > 3) toastBox.firstElementChild.remove();
  setTimeout(() => t.classList.add('sai'), ms);
  setTimeout(() => t.remove(), ms + 400);
}

// ---------- Modal ----------
// actions: [{ label, cls, onClick(ctx) }] — se onClick retornar false, o modal continua aberto.
export function modal({ title = '', body = '', actions = [{ label: 'Fechar' }], onClose, wide = false, cls = '' }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `
    <div class="modal ${wide ? 'modal-wide' : ''} ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="x" data-x aria-label="Fechar">✕</button></div>
      <div class="modal-body">${body}</div>
      ${actions.length ? `<div class="modal-foot">${actions.map((a, i) => `<button type="button" class="btn ${a.cls || 'ghost'}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div>` : ''}
    </div>`;
  document.body.appendChild(wrap);
  let fechado = false;
  const ctx = {
    el: wrap.querySelector('.modal'),
    close() {
      if (fechado) return;
      fechado = true;
      wrap.remove();
      document.removeEventListener('keydown', onKey);
      onClose?.();
    },
  };
  const onKey = (e) => e.key === 'Escape' && ctx.close();
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('mousedown', (e) => e.target === wrap && ctx.close());
  wrap.querySelector('[data-x]').onclick = ctx.close;
  wrap.querySelectorAll('.modal-foot [data-i]').forEach((b) => {
    b.onclick = async () => {
      const a = actions[+b.dataset.i];
      try {
        const r = a.onClick ? await a.onClick(ctx) : undefined;
        if (r !== false) ctx.close();
      } catch (err) {
        toast(err.message || String(err), 'erro', 4000);
      }
    };
  });
  // Enter em formulário dispara a primeira ação primária
  const form = wrap.querySelector('form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      wrap.querySelector('.modal-foot .primary')?.click();
    });
  }
  setTimeout(() => wrap.querySelector('input:not([type=hidden]):not([readonly]), select, textarea')?.focus(), 30);
  return ctx;
}

export function confirmar(msg, { ok = 'Confirmar', perigo = false } = {}) {
  return new Promise((res) => {
    let r = false;
    modal({
      title: 'Confirmação',
      body: `<p>${esc(msg)}</p>`,
      actions: [
        { label: 'Cancelar' },
        { label: ok, cls: perigo ? 'danger' : 'primary', onClick: () => (r = true) },
      ],
      onClose: () => res(r),
    });
  });
}

export function lerForm(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'number') o[el.name] = el.value === '' ? null : Number(el.value);
    else o[el.name] = el.value.trim();
  }
  return o;
}

// ---------- Arquivos ----------
export function baixar(nome, conteudo, mime = 'text/plain;charset=utf-8') {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

// CSV com ";" e BOM para abrir direto no Excel em português.
export function csv(linhas) {
  const cel = (v) => {
    if (typeof v === 'number') v = String(v).replace('.', ',');
    v = String(v ?? '');
    return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  return '﻿' + linhas.map((l) => l.map(cel).join(';')).join('\r\n');
}

// ---------- Gráficos (SVG simples) ----------
export function grafBarras(serie, { altura = 190, fmt = brl, cada = 1, cor = 'var(--laranja)' } = {}) {
  if (!serie.length) return '<p class="muted">Sem dados no período.</p>';
  const bw = 26;
  const w = Math.max(serie.length * bw, 320);
  const h = altura;
  const base = h - 22;
  const max = Math.max(...serie.map((s) => s.valor), 1);
  const passo = w / serie.length;
  const linhasGuia = [0.25, 0.5, 0.75, 1]
    .map((f) => `<line x1="0" x2="${w}" y1="${base - f * (base - 14)}" y2="${base - f * (base - 14)}" class="guia"/>`)
    .join('');
  const barras = serie
    .map((s, i) => {
      const bh = (s.valor / max) * (base - 14);
      const x = i * passo + passo * 0.14;
      const lw = passo * 0.72;
      return `<g><rect x="${x.toFixed(1)}" y="${(base - bh).toFixed(1)}" width="${lw.toFixed(1)}" height="${Math.max(bh, 0).toFixed(1)}" rx="3" fill="${s.cor || cor}"><title>${esc(s.rotulo)}: ${esc(fmt(s.valor))}</title></rect>${
        i % cada === 0 ? `<text x="${(x + lw / 2).toFixed(1)}" y="${h - 6}" text-anchor="middle" class="eixo">${esc(s.curto ?? s.rotulo)}</text>` : ''
      }</g>`;
    })
    .join('');
  return `<div class="graf"><div class="graf-max">${esc(fmt(max))}</div><svg viewBox="0 0 ${w} ${h}" role="img">${linhasGuia}${barras}</svg></div>`;
}

export function barraHoriz(itens, { fmt = brl } = {}) {
  if (!itens.length) return '<p class="muted">Sem dados no período.</p>';
  const max = Math.max(...itens.map((i) => i.valor), 1);
  return `<div class="hbars">${itens
    .map(
      (i) => `<div class="hbar"><span class="hb-rot">${esc(i.rotulo)}</span><span class="hb-trilho"><span style="width:${((i.valor / max) * 100).toFixed(1)}%;${i.cor ? `background:${i.cor}` : ''}"></span></span><span class="hb-val">${esc(fmt(i.valor))}</span></div>`,
    )
    .join('')}</div>`;
}

// ---------- Som de leitura ----------
let audioCtx;
export function bip(ok = true) {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = ok ? 1250 : 220;
    o.type = ok ? 'sine' : 'square';
    g.gain.value = 0.08;
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + (ok ? 0.09 : 0.25));
  } catch {
    /* sem áudio */
  }
}

// ---------- Scripts externos sob demanda ----------
const scripts = {};
export function carregarScript(src) {
  return (scripts[src] ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = () => {
      delete scripts[src];
      rej(new Error('Não foi possível carregar um componente. Verifique a internet.'));
    };
    document.head.appendChild(s);
  }));
}

// QR Code gerado localmente (js/vendor/qrcode-generator.js, MIT): funciona sem internet.
export async function qrcode(el, texto, tamanho = 220) {
  await carregarScript('js/vendor/qrcode-generator.js');
  const qr = window.qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  const n = qr.getModuleCount() + 8;
  el.innerHTML = qr.createImgTag(Math.max(1, Math.floor(tamanho / n)), 4);
  const img = el.querySelector('img');
  if (img) Object.assign(img.style, { width: tamanho + 'px', height: tamanho + 'px', imageRendering: 'pixelated' });
}

// Teclado numérico na tela (totem). Escreve no input com foco dentro de `escopo`.
export function tecladoHTML() {
  return `<div class="teclado">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫']
    .map((k) => `<button type="button" class="tecla" data-k="${k}">${k}</button>`)
    .join('')}</div>`;
}
export function ligarTeclado(escopo) {
  let alvo = escopo.querySelector('input');
  escopo.querySelectorAll('input').forEach((i) => i.addEventListener('focus', () => (alvo = i)));
  escopo.querySelectorAll('.tecla').forEach((b) => {
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.onclick = () => {
      if (!alvo) return;
      const k = b.dataset.k;
      const max = +alvo.maxLength > 0 ? +alvo.maxLength : 99;
      if (k === 'C') alvo.value = '';
      else if (k === '⌫') alvo.value = alvo.value.slice(0, -1);
      else if (alvo.value.length < max) alvo.value += k;
      alvo.dispatchEvent(new Event('input', { bubbles: true }));
      alvo.focus();
    };
  });
}
