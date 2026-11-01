// Funções partilhadas pelas páginas do organizador e do participante.
(function () {
  const cfg = window.AMIGO_CONFIG || {};

  function isConfigured() {
    return cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes('COLOCA-AQUI');
  }

  async function rpc(fn, params) {
    if (!isConfigured()) throw new Error('A app ainda não está ligada ao Supabase (ver config.js).');
    const headers = { 'Content-Type': 'application/json', apikey: cfg.SUPABASE_KEY };
    if (cfg.SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = 'Bearer ' + cfg.SUPABASE_KEY;
    const res = await fetch(cfg.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/rpc/' + fn, {
      method: 'POST', headers, body: JSON.stringify(params || {}),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error((data && (data.message || data.hint)) || 'Erro ' + res.status);
    return data;
  }

  // Normaliza um número para o formato do wa.me (só dígitos, com indicativo).
  function waNumber(phone) {
    let d = String(phone || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.length === 9 && d.startsWith('9')) d = '351' + d; // telemóvel português
    return d;
  }

  function waLink(phone, text) {
    return 'https://wa.me/' + waNumber(phone) + '?text=' + encodeURIComponent(text);
  }

  function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('pt-PT', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  const $ = (sel, root) => (root || document).querySelector(sel);

  // Converte qualquer fotografia num JPEG quadrado de 320x320 (~20–40 KB),
  // cortado ao centro (um pouco para cima, onde costuma estar a cara).
  async function photoFromFile(file, size = 320) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('Não foi possível ler esta imagem. Experimenta outra fotografia.'));
        i.src = url;
      });
      const w = img.naturalWidth, h = img.naturalHeight, side = Math.min(w, h);
      const sx = (w - side) / 2, sy = (h - side) * 0.3;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      let q = 0.85, out;
      do { out = canvas.toDataURL('image/jpeg', q); q -= 0.1; } while (out.length > 150000 && q > 0.3);
      return out;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // Círculo com a foto, ou com as iniciais quando não há foto.
  function avatar(photo, name, size) {
    const el = document.createElement('span');
    el.className = 'avatar';
    el.style.width = el.style.height = size + 'px';
    el.style.fontSize = Math.round(size * 0.38) + 'px';
    if (photo) {
      el.style.backgroundImage = `url("${photo}")`;
    } else {
      el.textContent = String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    }
    return el;
  }

  window.Amigo = { rpc, waNumber, waLink, formatDate, esc, $, isConfigured, photoFromFile, avatar };
})();
