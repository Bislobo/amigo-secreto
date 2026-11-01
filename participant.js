(function () {
  const { rpc, waLink, formatDate, esc, $ } = window.Amigo;
  const params = new URLSearchParams(location.search);
  const token = params.get('t');
  const demo = params.get('demo');
  let data = null;

  const show = (id, on) => $('#' + id).classList.toggle('hidden', !on);

  function showError(err) {
    const box = $('#error');
    box.textContent = err ? (err.message || String(err)) : '';
    show('error', !!err);
  }

  function demoData() {
    const names = [['Marta', 0], ['Pedro', 0], ['João', 0], ['Alexandre', 1], ['Graça', 0], ['Quim', 0],
      ['Anita', 0], ['Paulo A', 0], ['Ana', 0], ['Diogo', 0], ['Paulo F', 0], ['Luísa', 0], ['D. Amélia', 0],
      ['Filipe', 0], ['Marina', 0], ['Teste', 0]];
    return {
      event: { name: 'Amigo Secreto de Natal 2026 (demonstração)', budget: 60,
        status: demo === 'form' ? 'open' : 'drawn', deadline: new Date(Date.now() + 72 * 3600e3).toISOString() },
      me: { name: 'Ricardo', phone: '', house: 'Casa 2', wishes: [null, null, null], has_wishes: false },
      receiver: { name: 'Graça', has_wishes: true,
        wishes: ['Um livro de receitas', 'Uma manta para o sofá', 'Bombons de chocolate preto'] },
      others: names.slice(0, 15).map(([name, ex]) => ({ name, excluded: !!ex })),
    };
  }

  function resultText() {
    const r = data.receiver;
    const wishes = r.has_wishes
      ? r.wishes.map((w, i) => `${i + 1}. ${w}`).join('\n')
      : '(não escolheu desejos)';
    return `🎁 ${data.event.name}\n\nO meu amigo secreto é: *${r.name}*\n\nDesejos:\n${wishes}\n\n` +
      `Budget máximo: ${data.event.budget} €`;
  }

  function renderResult() {
    const r = data.receiver;
    $('#result-name').textContent = r.name;
    $('#result-wishes').innerHTML = r.has_wishes
      ? r.wishes.map((w) => `<li>${esc(w)}</li>`).join('')
      : '<li class="quiet">Não escolheu desejos a tempo. Vais ter de ser criativo!</li>';
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
    });
    renderResult();
    $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function render() {
    show('loading', false);
    $('#event-name').textContent = data.event.name;
    const first = data.me.name.split(' ')[0];
    if (data.event.status === 'drawn' && data.receiver) {
      $('#ready-hello').textContent = `Olá, ${first}!`;
      show('ready', true);
      return;
    }
    $('#hello').textContent = `Olá, ${first}!`;
    $('#budget-1').textContent = data.event.budget + ' €';
    $('#deadline').textContent = data.event.status === 'open'
      ? `Tens até ${formatDate(data.event.deadline)}. O sorteio é feito sozinho nessa altura, ou antes se toda a gente já tiver escolhido.`
      : 'O amigo secreto ainda não começou, mas já podes escrever os teus desejos.';
    ['w1', 'w2', 'w3'].forEach((id, i) => { $('#' + id).value = data.me.wishes[i] || ''; });
    if (data.me.has_wishes) {
      $('#saved').textContent = 'Os teus desejos estão guardados. Podes alterá-los até ao sorteio.';
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
      $('#saved').textContent = 'Guardado! 🎉 Podes voltar a este link para alterar até ao sorteio.';
      show('saved', true);
      if (!demo) { data = await rpc('get_me', { p_token: token }); if (data.event.status === 'drawn') { show('wishes', false); render(); } }
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
