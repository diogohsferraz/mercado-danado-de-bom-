// Leitura de código de barras: câmera do aparelho e leitor USB/Bluetooth (que "digita" o código + Enter).
import { modal, carregarScript, toast } from './ui.js';

// Leitor físico: teclas chegam muito rápido e terminam com Enter.
export function escutarLeitor(aoLer) {
  let buf = '';
  let ultimo = 0;
  const onKey = (e) => {
    const alvo = e.target;
    if (alvo instanceof HTMLElement && alvo.matches('input, textarea, select, [contenteditable]')) return;
    const agora = performance.now();
    if (agora - ultimo > 80) buf = '';
    ultimo = agora;
    if (e.key === 'Enter') {
      if (buf.length >= 6) {
        e.preventDefault();
        aoLer(buf);
      }
      buf = '';
    } else if (/^[0-9A-Za-z]$/.test(e.key)) buf += e.key;
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}

// Câmera: usa o BarcodeDetector nativo quando existe (Android/Chrome) e cai para a biblioteca html5-qrcode.
export function abrirCamera(aoLer, { continuo = true } = {}) {
  let parar = () => {};
  const m = modal({
    title: 'Aponte para o código de barras',
    cls: 'modal-cam',
    body: `<div class="cam"><video playsinline muted></video><div id="cam-lib"></div><div class="cam-mira"></div></div>
      <p class="muted center" data-status>Abrindo a câmera…</p>`,
    actions: [{ label: 'Concluir', cls: 'primary' }],
    onClose: () => parar(),
  });
  const status = m.el.querySelector('[data-status]');
  let ult = '';
  let ultT = 0;
  const emitir = (cod) => {
    const t = Date.now();
    if (cod === ult && t - ultT < 1800) return;
    ult = cod;
    ultT = t;
    aoLer(cod);
    if (!continuo) m.close();
  };

  (async () => {
    try {
      if ('BarcodeDetector' in window) {
        const fmts = await window.BarcodeDetector.getSupportedFormats();
        if (fmts.includes('ean_13')) {
          const det = new window.BarcodeDetector({ formats: fmts.filter((f) => ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'].includes(f)) });
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
          const video = m.el.querySelector('video');
          video.srcObject = stream;
          await video.play();
          status.textContent = 'Centralize o código na faixa laranja';
          let vivo = true;
          parar = () => {
            vivo = false;
            stream.getTracks().forEach((t) => t.stop());
          };
          const loop = async () => {
            if (!vivo) return;
            try {
              const r = await det.detect(video);
              if (r[0]?.rawValue) emitir(r[0].rawValue);
            } catch {
              /* quadro inválido */
            }
            setTimeout(loop, 180);
          };
          loop();
          return;
        }
      }
      await carregarScript('https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js');
      m.el.querySelector('video').remove();
      const F = window.Html5QrcodeSupportedFormats;
      const leitor = new window.Html5Qrcode('cam-lib', {
        formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128],
        verbose: false,
      });
      await leitor.start({ facingMode: 'environment' }, { fps: 12, qrbox: { width: 280, height: 130 } }, (txt) => emitir(txt));
      status.textContent = 'Centralize o código no quadro';
      parar = () => leitor.stop().catch(() => {});
    } catch (err) {
      console.warn(err);
      const msg =
        err?.name === 'NotAllowedError'
          ? 'Permissão da câmera negada. Libere o acesso nas configurações do navegador.'
          : err?.name === 'NotFoundError'
            ? 'Nenhuma câmera encontrada neste aparelho.'
            : 'Não foi possível abrir a câmera. Digite o código ou escolha o produto na lista.';
      status.textContent = msg;
      toast(msg, 'erro', 4500);
    }
  })();
  return m;
}
