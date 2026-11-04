(function () {
  const { rpc, waLink, formatDate, esc, $, photoFromFile, avatar } = window.Amigo;
  const params = new URLSearchParams(location.search);
  const key = params.get('k');
  let state = null;

  function showError(err) {
    const box = $('#error');
    box.textContent = err ? (err.message || String(err)) : '';
    box.classList.toggle('hidden', !err);
    if (err) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function personLink(p) {
    return new URL('index.html?t=' + p.token, location.href).toString();
  }

  // Convites marcados como enviados ficam guardados só neste telemóvel/computador.
  const sentKey = 'amigo-sent-' + key;
  const sent = new Set(JSON.parse(localStorage.getItem(sentKey) || '[]'));
  function markSent(id) {
    sent.add(id);
    localStorage.setItem(sentKey, JSON.stringify([...sent]));
  }

  function inviteText(p) {
    return `Olá ${p.name}! ✨ ${state.name}\n\n` +
      `Abre o teu link pessoal e escolhe 3 coisas que gostavas de receber` +
      (state.deadline ? ` (até ${formatDate(state.deadline)})` : '') + `:\n${personLink(p)}\n\n` +
      `O budget máximo é de ${state.budget} €. Não partilhes este link, é só teu.`;
  }

  function drawnText(p) {
    return `Olá ${p.name}! ✨ O sorteio do «${state.name}» já foi feito.\n\n` +
      `Abre o teu link para veres quem te calhou:\n${personLink(p)}`;
  }

  async function create() {
    showError(null);
    try {
      const res = await rpc('create_event', {
        p_name: $('#ev-name').value,
        p_budget: parseInt($('#ev-budget').value, 10) || 60,
      });
      location.href = 'admin.html?k=' + res.admin_key + '&novo=1';
    } catch (e) { showError(e); }
  }

  async function load() {
    try {
      state = await rpc('admin_get', { p_admin_key: key });
      // Valores por omissão, caso a base de dados ainda não tenha as opções novas.
      state.use_houses = state.use_houses ?? true;
      state.wishes_enabled = state.wishes_enabled ?? true;
      state.draw_hours = state.draw_hours ?? 72;
      state.photos_enabled = state.photos_enabled ?? false;
      showError(null);
      render();
    } catch (e) { showError(e); }
  }

  function render() {
    renderHeader();
    renderList();
  }

  function renderHeader() {
    $('#admin').classList.remove('hidden');
    $('#key-notice').classList.toggle('hidden', !params.get('novo'));
    $('#ev-title').textContent = state.name;
    if (document.activeElement.id !== 'set-name') $('#set-name').value = state.name;
    if (document.activeElement.id !== 'set-budget') $('#set-budget').value = state.budget;
    $('#set-budget').disabled = state.status === 'drawn';
    $('#set-houses').checked = state.use_houses;
    $('#set-houses').disabled = state.status === 'drawn';
    $('#set-wishes').checked = state.wishes_enabled;
    $('#set-photos').checked = state.photos_enabled;
    $('#set-wishes').disabled = state.status !== 'setup';
    $('#wishes-locked').classList.toggle('hidden', state.status === 'setup');
    if (document.activeElement.id !== 'set-hours') $('#set-hours').value = state.draw_hours;
    $('#set-hours').disabled = state.status === 'drawn';
    syncSettingsForm();
    $('#p-house-wrap').classList.toggle('hidden', !state.use_houses);
    $('#import-help-houses').classList.toggle('hidden', !state.use_houses);
    $('#import-help-plain').classList.toggle('hidden', state.use_houses);
    const people = state.participants;
    const done = people.filter((p) => p.has_wishes).length;
    $('#count').textContent = `(${people.length})`;

    const status = $('#ev-status');
    const actions = $('#ev-actions');
    actions.innerHTML = '';
    if (state.status === 'setup') {
      status.innerHTML = 'Ainda não começou. Adiciona as pessoas' + (state.use_houses ? ' e as casas' : '') +
        ' e depois carrega em <b>Começar</b>. ' + (state.wishes_enabled
          ? `A partir daí contam ${state.draw_hours} horas até ao sorteio.`
          : 'Como não há desejos, o sorteio é feito logo.');
      const b = document.createElement('button');
      b.textContent = state.wishes_enabled ? `Começar (sorteio daqui a ${state.draw_hours} h)` : 'Começar e sortear já';
      b.disabled = !!state.problem || people.some((p) => !p.phone);
      b.onclick = start;
      actions.append(b);
      if (people.some((p) => !p.phone)) {
        actions.insertAdjacentHTML('beforeend', '<span class="quiet">Falta o WhatsApp de algumas pessoas.</span>');
      }
    } else if (state.status === 'open') {
      status.innerHTML = `A recolher desejos: <b>${done} de ${people.length}</b> já escolheram. ` +
        `O sorteio é feito sozinho a <b>${esc(formatDate(state.deadline))}</b>, ou logo que todos escolham.`;
      const b = document.createElement('button');
      b.className = 'secondary';
      b.textContent = 'Sortear já';
      b.onclick = drawNow;
      actions.append(b);
    } else {
      status.innerHTML = `✅ Sorteio feito a ${esc(formatDate(state.drawn_at))}. ` +
        (state.wishes_enabled ? 'Avisa cada pessoa para abrir o seu link. ' : 'Envia a cada pessoa o seu link. ') +
        'Esta página não mostra os pares.' +
        (state.wishes_enabled ? ` <b>${done} de ${people.length}</b> já escolheram desejos (ainda podem escolher ou mudar).` : '');
      const group = document.createElement('a');
      group.className = 'btn wa';
      group.target = '_blank';
      group.href = 'https://wa.me/?text=' + encodeURIComponent(
        `✨ O sorteio do «${state.name}» já foi feito! Abram o vosso link pessoal (o mesmo do convite) para verem quem vos calhou.`);
      group.textContent = 'Avisar o grupo no WhatsApp';
      actions.append(group);
      const redo = document.createElement('button');
      redo.className = 'secondary';
      redo.textContent = 'Fazer novo sorteio';
      redo.onclick = redraw;
      actions.append(redo);
    }

    const problem = $('#problem');
    problem.textContent = state.problem || '';
    problem.classList.toggle('hidden', !state.problem || state.status === 'drawn');
    $('#setup-tools').classList.toggle('hidden', state.status === 'drawn');

  }

  function renderList() {
    const people = state.participants;
    const houses = state.use_houses ? [...new Set(people.map((p) => p.house))] : [null];
    $('#houses').innerHTML = houses.filter(Boolean).map((h) => `<option value="${esc(h)}">`).join('');

    const list = $('#list');
    list.innerHTML = '';
    if (!people.length) list.innerHTML = '<p class="quiet">Ainda não há ninguém.</p>';
    for (const house of houses) {
      const div = document.createElement('div');
      div.className = 'house card';
      div.innerHTML = house === null ? '' : `<h3>${esc(house || 'Sem casa')}</h3>`;
      for (const p of people.filter((x) => house === null || x.house === house)) div.append(renderPerson(p));
      list.append(div);
    }
  }

  let photoTarget = null;

  function renderPerson(p) {
    const row = document.createElement('div');
    row.className = 'person';
    if (state.photos_enabled) {
      const btn = document.createElement('button');
      btn.className = 'avatar-btn';
      btn.title = p.photo ? 'Mudar a fotografia' : 'Pôr fotografia';
      btn.append(avatar(p.photo, p.name, 36));
      btn.onclick = () => { photoTarget = p; $('#admin-photo-input').click(); };
      row.append(btn);
    }
    row.insertAdjacentHTML('beforeend', `<span class="name">${esc(p.name)}</span>`);

    if (state.status !== 'drawn') {
      const phone = document.createElement('input');
      phone.value = p.phone;
      phone.placeholder = 'WhatsApp';
      phone.inputMode = 'tel';
      phone.onchange = () => savePhone(p, phone.value);
      row.append(phone);

      if (state.use_houses) {
      const house = document.createElement('input');
      house.value = p.house;
      house.placeholder = 'Casa';
      house.title = 'Mudar de casa';
      house.className = 'house-input';
      house.setAttribute('list', 'houses');
      house.onchange = () => saveHouse(p, house.value);
      row.append(house);
      }
    }

    const grow = document.createElement('span');
    grow.className = 'grow';
    row.append(grow);

    if (state.status !== 'setup' && state.wishes_enabled) {
      row.insertAdjacentHTML('beforeend', p.has_wishes
        ? '<span class="badge ok">✓ desejos</span>'
        : '<span class="badge">sem desejos</span>');
    }

    if (state.status === 'open' || state.status === 'drawn') {
      const a = document.createElement('a');
      a.className = 'btn wa small';
      a.target = '_blank';
      a.href = waLink(p.phone, state.status === 'open' ? inviteText(p) : drawnText(p));
      const sentId = state.status + ':' + (state.drawn_at || '') + ':' + p.id;
      const wasSent = sent.has(sentId);
      const label = state.status === 'open' ? 'convite' : (state.wishes_enabled ? 'aviso' : 'link');
      a.textContent = (wasSent ? 'Reenviar ' : 'Enviar ') + label;
      a.onclick = () => { markSent(sentId); setTimeout(renderList, 300); };
      if (wasSent) row.insertAdjacentHTML('beforeend', '<span class="badge sent">enviado</span>');
      row.append(a);
    }

    if (state.status !== 'drawn') {
      const del = document.createElement('button');
      del.className = 'danger small';
      del.textContent = '✕';
      del.title = 'Remover';
      del.onclick = () => remove(p);
      row.append(del);
    }
    return row;
  }

  async function save(p, changes) {
    try {
      await rpc('admin_save_participant', {
        p_admin_key: key, p_id: p ? p.id : null,
        p_name: changes.name ?? p.name, p_phone: changes.phone ?? p.phone, p_house: changes.house ?? p.house,
      });
      await load();
    } catch (e) { showError(e); }
  }

  // Guarda o número sem redesenhar a lista, para não perder o sítio onde se está a escrever.
  async function savePhone(p, phone) {
    try {
      await rpc('admin_save_participant', {
        p_admin_key: key, p_id: p.id, p_name: p.name, p_phone: phone, p_house: p.house,
      });
      p.phone = phone.trim();
      showError(null);
      if (state.status === 'setup') renderHeader();
    } catch (e) { showError(e); }
  }

  // Mudar de casa mantém o link e os desejos da pessoa.
  async function saveHouse(p, house) {
    house = house.trim();
    if (!house || house === p.house) return;
    try {
      await rpc('admin_save_participant', {
        p_admin_key: key, p_id: p.id, p_name: p.name, p_phone: p.phone, p_house: house,
      });
      await load();
    } catch (e) { showError(e); await load(); }
  }

  function syncSettingsForm() {
    const wishes = $('#set-wishes').checked;
    $('#hours-wrap').classList.toggle('hidden', !wishes);
    $('#no-wishes-note').classList.toggle('hidden', wishes);
  }

  async function saveSettings() {
    try {
      await rpc('admin_update_event', {
        p_admin_key: key, p_name: $('#set-name').value,
        p_budget: parseInt($('#set-budget').value, 10) || state.budget,
        p_use_houses: $('#set-houses').checked,
        p_wishes_enabled: state.status === 'setup' ? $('#set-wishes').checked : null,
        p_draw_hours: parseInt($('#set-hours').value, 10) || state.draw_hours,
        p_photos_enabled: $('#set-photos').checked,
      });
      await load();
      $('#settings-saved').classList.remove('hidden');
      setTimeout(() => $('#settings-saved').classList.add('hidden'), 2500);
    } catch (e) { showError(e); }
  }

  async function add() {
    const name = $('#p-name').value.trim();
    const house = $('#p-house').value.trim();
    if (!name || (state.use_houses && !house)) return showError(new Error(state.use_houses ? 'Escreve o nome e a casa.' : 'Escreve o nome.'));
    await save(null, { name, phone: $('#p-phone').value, house: state.use_houses ? house : '' });
    $('#p-name').value = '';
    $('#p-phone').value = '';
    $('#p-name').focus();
  }

  async function importList() {
    const lines = $('#import-text').value.split('\n').map((l) => l.trim()).filter(Boolean);
    try {
      for (const line of lines) {
        const idx = line.indexOf(':');
        if (state.use_houses && idx < 0) throw new Error('Falta a casa nesta linha (ex.: "Casa 1: Maria, José") → ' + line);
        const house = state.use_houses ? line.slice(0, idx).trim() : '';
        const names = (state.use_houses ? line.slice(idx + 1) : line.slice(idx + 1))
          .split(',').map((n) => n.trim()).filter(Boolean);
        for (const name of names) {
          await rpc('admin_save_participant', { p_admin_key: key, p_id: null, p_name: name, p_phone: '', p_house: house });
        }
      }
      $('#import-text').value = '';
      await load();
    } catch (e) { showError(e); await load(); }
  }

  async function remove(p) {
    if (!confirm(`Remover ${p.name}?`)) return;
    try { await rpc('admin_remove_participant', { p_admin_key: key, p_id: p.id }); await load(); }
    catch (e) { showError(e); }
  }

  async function start() {
    const msg = state.wishes_enabled
      ? `Começar agora? A contagem de ${state.draw_hours} horas começa já e depois envias os convites.`
      : 'Começar agora? O sorteio é feito já e depois envias a cada pessoa o seu link.';
    if (!confirm(msg)) return;
    try { await rpc('admin_start', { p_admin_key: key }); await load(); }
    catch (e) { showError(e); }
  }

  async function redraw() {
    if (!confirm('Fazer um novo sorteio? Os pares atuais deixam de valer e cada pessoa passa a ter outro amigo secreto. ' +
      'Os desejos e as fotos ficam. Depois tens de avisar toda a gente.')) return;
    try {
      await rpc('admin_redraw', { p_admin_key: key });
      await load();
      alert('Novo sorteio feito! Avisa as pessoas para voltarem a abrir o seu link.');
    } catch (e) { showError(e); }
  }

  async function drawNow() {
    if (!confirm('Fazer o sorteio já? Quem ainda não escolheu fica sem desejos.')) return;
    try { await rpc('admin_draw_now', { p_admin_key: key }); await load(); }
    catch (e) { showError(e); }
  }

  if (!window.Amigo.isConfigured()) {
    showError(new Error('A app ainda não está ligada ao Supabase: preenche o ficheiro config.js (ver README).'));
  } else if (!key) {
    $('#create').classList.remove('hidden');
    $('#create-btn').onclick = create;
  } else {
    $('#add-btn').onclick = add;
    $('#settings-btn').onclick = saveSettings;
    // As caixas de escolha guardam logo, para a lista mudar sem ter de carregar em Guardar.
    $('#set-wishes').onchange = () => { syncSettingsForm(); saveSettings(); };
    $('#set-houses').onchange = saveSettings;
    $('#set-photos').onchange = saveSettings;
    $('#admin-photo-input').onchange = async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f || !photoTarget) return;
      try {
        const photo = await photoFromFile(f);
        await rpc('admin_set_photo', { p_admin_key: key, p_id: photoTarget.id, p_photo: photo });
        await load();
      } catch (err) { showError(err); }
    };
    $('#import-btn').onclick = importList;
    load();
    setInterval(() => { if (document.visibilityState === 'visible' && !document.activeElement.matches('input, textarea')) load(); }, 30000);
  }
})();
