(function () {
  const { rpc, waLink, formatDate, esc, $ } = window.Amigo;
  const params = new URLSearchParams(location.search);
  const key = params.get('k');
  let state = null;

  function showError(err) {
    const box = $('#error');
    box.textContent = err ? (err.message || String(err)) : '';
    box.classList.toggle('hidden', !err);
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
    return `Olá ${p.name}! 🎁 Este ano há amigo secreto da família.\n\n` +
      `Abre o teu link pessoal e escolhe 3 coisas que gostavas de receber` +
      (state.deadline ? ` (até ${formatDate(state.deadline)})` : '') + `:\n${personLink(p)}\n\n` +
      `O budget máximo é de ${state.budget} €. Não partilhes este link, é só teu.`;
  }

  function drawnText(p) {
    return `Olá ${p.name}! 🎉 O sorteio do amigo secreto já foi feito.\n\n` +
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
    const people = state.participants;
    const done = people.filter((p) => p.has_wishes).length;
    $('#count').textContent = `(${people.length})`;

    const status = $('#ev-status');
    const actions = $('#ev-actions');
    actions.innerHTML = '';
    if (state.status === 'setup') {
      status.innerHTML = 'Ainda não começou. Adiciona as pessoas e as casas e depois carrega em <b>Começar</b>. ' +
        'A partir daí contam 72 horas até ao sorteio.';
      const b = document.createElement('button');
      b.textContent = 'Começar (inicia as 72 h)';
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
      status.innerHTML = `✅ Sorteio feito a ${esc(formatDate(state.drawn_at))}. Avisa cada pessoa para abrir o seu link. ` +
        'Esta página não mostra os pares.';
      const group = document.createElement('a');
      group.className = 'btn wa';
      group.target = '_blank';
      group.href = 'https://wa.me/?text=' + encodeURIComponent(
        '🎉 O sorteio do amigo secreto já foi feito! Abram o vosso link pessoal (o mesmo do convite) para verem quem vos calhou.');
      group.textContent = 'Avisar o grupo da família';
      actions.append(group);
    }

    const problem = $('#problem');
    problem.textContent = state.problem || '';
    problem.classList.toggle('hidden', !state.problem || state.status === 'drawn');
    $('#setup-tools').classList.toggle('hidden', state.status === 'drawn');

  }

  function renderList() {
    const people = state.participants;
    const houses = [...new Set(people.map((p) => p.house))];
    $('#houses').innerHTML = houses.map((h) => `<option value="${esc(h)}">`).join('');

    const list = $('#list');
    list.innerHTML = '';
    if (!people.length) list.innerHTML = '<p class="quiet">Ainda não há ninguém.</p>';
    for (const house of houses) {
      const div = document.createElement('div');
      div.className = 'house card';
      div.innerHTML = `<h3>${esc(house)}</h3>`;
      for (const p of people.filter((x) => x.house === house)) div.append(renderPerson(p));
      list.append(div);
    }
  }

  function renderPerson(p) {
    const row = document.createElement('div');
    row.className = 'person';
    row.innerHTML = `<span class="name">${esc(p.name)}</span>`;

    if (state.status !== 'drawn') {
      const phone = document.createElement('input');
      phone.value = p.phone;
      phone.placeholder = 'WhatsApp';
      phone.inputMode = 'tel';
      phone.onchange = () => savePhone(p, phone.value);
      row.append(phone);

      const house = document.createElement('input');
      house.value = p.house;
      house.placeholder = 'Casa';
      house.title = 'Mudar de casa';
      house.className = 'house-input';
      house.setAttribute('list', 'houses');
      house.onchange = () => saveHouse(p, house.value);
      row.append(house);
    }

    const grow = document.createElement('span');
    grow.className = 'grow';
    row.append(grow);

    if (state.status !== 'setup') {
      row.insertAdjacentHTML('beforeend', p.has_wishes
        ? '<span class="badge ok">✓ desejos</span>'
        : '<span class="badge">sem desejos</span>');
    }

    if (state.status === 'open' || state.status === 'drawn') {
      const a = document.createElement('a');
      a.className = 'btn wa small';
      a.target = '_blank';
      a.href = waLink(p.phone, state.status === 'open' ? inviteText(p) : drawnText(p));
      const wasSent = state.status === 'open' && sent.has(p.id);
      a.textContent = state.status === 'open' ? (wasSent ? 'Reenviar convite' : 'Enviar convite') : 'Avisar';
      a.onclick = () => { if (state.status === 'open') { markSent(p.id); setTimeout(renderList, 300); } };
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

  async function add() {
    const name = $('#p-name').value.trim();
    const house = $('#p-house').value.trim();
    if (!name || !house) return showError(new Error('Escreve o nome e a casa.'));
    await save(null, { name, phone: $('#p-phone').value, house });
    $('#p-name').value = '';
    $('#p-phone').value = '';
    $('#p-name').focus();
  }

  async function importList() {
    const lines = $('#import-text').value.split('\n').map((l) => l.trim()).filter(Boolean);
    try {
      for (const line of lines) {
        const idx = line.indexOf(':');
        if (idx < 0) throw new Error('Linha sem ":" → ' + line);
        const house = line.slice(0, idx).trim();
        const names = line.slice(idx + 1).split(',').map((n) => n.trim()).filter(Boolean);
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
    if (!confirm('Começar agora? A contagem de 72 horas começa já e depois envias os convites.')) return;
    try { await rpc('admin_start', { p_admin_key: key }); await load(); }
    catch (e) { showError(e); }
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
    $('#import-btn').onclick = importList;
    load();
    setInterval(() => { if (document.visibilityState === 'visible' && !document.activeElement.matches('input, textarea')) load(); }, 30000);
  }
})();
