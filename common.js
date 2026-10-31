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

  window.Amigo = { rpc, waNumber, waLink, formatDate, esc, $, isConfigured };
})();
