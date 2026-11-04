(function () {
  const { rpc, waLink, formatDate, esc, $, avatar } = window.Amigo;
  const params = new URLSearchParams(location.search);
  const token = params.get('t');
  const demo = params.get('demo');
  let data = null;

  const show = (id, on) => $('#' + id).classList.toggle('hidden', !on);

  function showError(err) {
    const box = $('#error');
    box.textContent = err ? (err.message || String(err)) : '';
    show('error', !!err);
    if (err) $('#error').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function demoData() {
    const names = [['Maria', 0], ['José', 0], ['Rita', 0], ['Tiago', 1], ['Sofia', 0], ['Rui', 0],
      ['Inês', 0], ['Nuno', 0], ['Carla', 0], ['Hugo', 0], ['Marta', 0], ['Luís', 0], ['Teresa', 0],
      ['Bruno', 0], ['Joana', 0]];
    return {
      event: { name: 'Amigo Secreto de Natal 2026 (demonstração)', budget: 60,
        use_houses: params.get('casas') !== '0', wishes_enabled: params.get('desejos') !== '0',
        photos_enabled: params.get('fotos') === '1',
        status: demo === 'form' ? 'open' : 'drawn', deadline: new Date(Date.now() + 72 * 3600e3).toISOString() },
      me: { name: 'Miguel', phone: '', house: 'Casa 2', wishes: [null, null, null], has_wishes: false },
      receiver: { name: 'Sofia', has_wishes: true,
        wishes: ['Um livro de receitas', 'Uma manta para o sofá', 'Bombons de chocolate preto'] },
      others: names.map(([name, ex]) => ({ name, excluded: !!ex && params.get('casas') !== '0' })),
    };
  }

  function resultText() {
    const r = data.receiver;
    const wishes = r.has_wishes
      ? r.wishes.map((w, i) => `${i + 1}. ${w}`).join('\n')
      : '(não escolheu desejos)';
    return `✨ ${data.event.name}\n\nO meu amigo secreto é: *${r.name}*\n\n` +
      (data.event.wishes_enabled ? `Desejos:\n${wishes}\n\n` : '') +
      `Budget máximo: ${data.event.budget} €`;
  }

  function renderResult() {
    const r = data.receiver;
    $('#result-name').textContent = r.name;
    const rp = $('#result-photo');
    rp.innerHTML = '';
    if (data.event.photos_enabled && r.photo) {
      const a = avatar(r.photo, r.name, 120);
      a.classList.add('result-photo');
      a.style.display = 'block';
      rp.append(a);
    }
    const showWishes = data.event.wishes_enabled !== false;
    $('#result-wishes-title').classList.toggle('hidden', !showWishes);
    $('#result-wishes').classList.toggle('hidden', !showWishes);
    $('#result-wishes').innerHTML = r.has_wishes
      ? r.wishes.map((w) => `<li>${esc(w)}</li>`).join('')
      : '<li class="quiet">Ainda não escolheu desejos. Volta a abrir este link mais tarde: ainda os pode escolher.</li>';
    $('#budget-2').textContent = data.event.budget + ' €';
    $('#wa-save').href = data.me.phone
      ? waLink(data.me.phone, resultText())
      : 'https://wa.me/?text=' + encodeURIComponent(resultText());
    show('result', true);
  }

  async function playDraw() {
    show('ready', false);
    show('result', false);
    show('draw', true);
    $('#stage').scrollIntoView({ behavior: 'smooth', block: 'start' });
    await window.Draw.play($('#stage'), {
      me: data.me, others: data.others, receiver: data.receiver,
      useHouses: data.event.use_houses !== false,
      photos: !!data.event.photos_enabled,
    });
    renderResult();
    $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function render() {
    show('loading', false);
    $('#event-name').textContent = data.event.name;
    const first = data.me.name.split(' ')[0];
    const drawn = data.event.status === 'drawn' && data.receiver;
    if (drawn) {
      $('#ready-hello').textContent = `Olá, ${first}!`;
      show('ready', true);
      if (data.event.wishes_enabled === false) return;
      // Depois do sorteio ainda se pode escrever ou mudar os desejos: o formulário vai para o fim da página.
      document.querySelector('main').append($('#wishes'));
    }
    if (data.event.wishes_enabled === false) {
      $('#waiting-hello').textContent = `Olá, ${first}!`;
      show('waiting', true);
      return;
    }
    $('#hello').textContent = drawn ? 'Os teus desejos' : `Olá, ${first}!`;
    $('#budget-1').textContent = data.event.budget + ' €';
    $('#deadline').textContent = drawn
      ? 'O sorteio já foi feito, mas ainda podes escrever ou mudar os teus desejos. Quem te calhou vê sempre a versão mais recente.'
      : data.event.status === 'open'
      ? `Tens até ${formatDate(data.event.deadline)}. O sorteio é feito sozinho nessa altura, ou antes se toda a gente já tiver escolhido.`
      : 'O amigo secreto ainda não começou, mas já podes escrever os teus desejos.';
    ['w1', 'w2', 'w3'].forEach((id, i) => { $('#' + id).value = data.me.wishes[i] || ''; });
    if (data.me.has_wishes) {
      $('#saved').textContent = 'Os teus desejos estão guardados. Podes alterá-los sempre que quiseres.';
      show('saved', true);
    }
    show('wishes', true);
  }

  async function save() {
    const w = ['w1', 'w2', 'w3'].map((id) => $('#' + id).value.trim());
    if (w.some((x) => !x)) return showError(new Error('Escreve as 3 coisas que gostavas de receber.'));
    showError(null);
    $('#save').disabled = true;
    try {
      if (!demo) await rpc('submit_wishes', { p_token: token, p_wish1: w[0], p_wish2: w[1], p_wish3: w[2] });
      $('#saved').textContent = 'Guardado! ✨ Podes voltar a este link para alterar sempre que quiseres.';
      show('saved', true);
      if (!demo) {
        const wasDrawn = data.event.status === 'drawn';
        data = await rpc('get_me', { p_token: token });
        // Se estes desejos fecharam o sorteio, mostra logo o botão para o ver.
        if (!wasDrawn && data.event.status === 'drawn') render();
      }
    } catch (e) { showError(e); }
    $('#save').disabled = false;
  }

  $('#save').onclick = save;
  $('#start-draw').onclick = playDraw;
  $('#replay').onclick = playDraw;
  $('#skip').onclick = () => window.Draw.skip();

  (async function init() {
    try {
      if (demo) data = demoData();
      else if (!token) { show('loading', false); show('no-token', true); return; }
      else data = await rpc('get_me', { p_token: token });
      render();
    } catch (e) { show('loading', false); showError(e); }
  })();
})();
