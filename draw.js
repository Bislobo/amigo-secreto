// Animação do sorteio. Draw.play(stage, {me, others, receiver}) devolve uma Promise
// que termina quando a revelação acaba (ou quando a pessoa carrega em "Saltar").
(function () {
  let skipping = false;
  let wake = null;

  function sleep(ms) {
    if (skipping) return Promise.resolve();
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      wake = () => { clearTimeout(t); resolve(); };
    });
  }

  function anim(el, frames, opts) {
    if (skipping) {
      const last = frames[frames.length - 1];
      Object.assign(el.style, last);
      return Promise.resolve();
    }
    const a = el.animate(frames, Object.assign({ fill: 'forwards', easing: 'ease-in-out' }, opts));
    return a.finished.catch(() => {});
  }

  function rand(min, max) { return min + Math.random() * (max - min); }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Posições aleatórias dentro do pote, sem bolas muito encavalitadas.
  function bowlSpots(n, cx, cy, r) {
    const spots = [];
    let tries = 0;
    while (spots.length < n && tries < 5000) {
      tries++;
      const ang = rand(0, Math.PI * 2);
      const dist = Math.sqrt(Math.random()) * (r - 26);
      const p = { x: cx + Math.cos(ang) * dist, y: cy + Math.sin(ang) * dist * 0.9 + 12 };
      const minGap = tries > 3000 ? 18 : 34;
      if (spots.every((s) => Math.hypot(s.x - p.x, s.y - p.y) > minGap)) spots.push(p);
    }
    while (spots.length < n) spots.push({ x: cx + rand(-60, 60), y: cy + rand(-40, 60) });
    return spots;
  }

  function setCaption(stage, text) {
    const c = stage.querySelector('#caption');
    c.style.opacity = 0;
    return sleep(250).then(() => { c.textContent = text; c.style.opacity = 1; });
  }

  function confetti(stage, cx, cy) {
    const colors = ['#e6c36a', '#ffffff', '#7fa2ff', '#ff7a7a', '#5fd39a'];
    for (let i = 0; i < 70; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = cx + 'px';
      c.style.top = cy + 'px';
      c.style.background = colors[i % colors.length];
      stage.append(c);
      const dx = rand(-220, 220), dy = rand(-160, 40);
      c.animate([
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) rotate(${rand(-360, 360)}deg)`, opacity: 1, offset: 0.4 },
        { transform: `translate(${dx * 1.3}px, ${dy + 420}px) rotate(${rand(-720, 720)}deg)`, opacity: 0 },
      ], { duration: rand(1800, 2800), easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' })
        .finished.then(() => c.remove()).catch(() => c.remove());
    }
  }

  async function play(stage, { me, others, receiver, useHouses = true, photos = false }) {
    skipping = false;
    // Limpa uma execução anterior.
    stage.querySelectorAll('.ball, .ball-half, .confetti').forEach((el) => el.remove());
    const tray = stage.querySelector('#tray');
    tray.innerHTML = '';
    stage.querySelector('#tray-wrap').classList.remove('on');
    const card = stage.querySelector('#reveal-card');
    card.classList.add('hidden');
    card.getAnimations().forEach((a) => a.cancel());
    stage.querySelector('#caption').textContent = '';
    stage.querySelector('#stage-title').textContent = 'Sorteio · ' + me.name;

    const bowl = stage.querySelector('#bowl');
    const W = stage.clientWidth;
    const cx = W / 2, cy = bowl.offsetTop + bowl.offsetHeight / 2, r = bowl.offsetWidth / 2;

    // Uma bola por cada outra pessoa. A bola do amigo secreto é igual às outras.
    const people = shuffle(others);
    const spots = bowlSpots(people.length, cx, cy, r);
    const balls = people.map((p, i) => {
      const b = document.createElement('div');
      b.className = 'ball';
      b.style.left = spots[i].x + 'px';
      b.style.top = spots[i].y + 'px';
      b.style.opacity = 0;
      stage.append(b);
      return { el: b, person: p, x: spots[i].x, y: spots[i].y };
    });

    // 1. As bolas caem no pote.
    await setCaption(stage, `Estão no pote ${people.length} nomes.`);
    await Promise.all(balls.map((b, i) => anim(b.el, [
      { transform: `translateY(${-b.y - 40}px)`, opacity: 1 },
      { transform: 'translateY(8px)', opacity: 1, offset: 0.85 },
      { transform: 'translateY(0)', opacity: 1 },
    ], { duration: 700, delay: i * 70, easing: 'ease-in' })));
    await sleep(700);

    // 2. Saem as pessoas da mesma casa.
    const excluded = balls.filter((b) => b.person.excluded);
    stage.querySelector('#tray-wrap').classList.add('on');
    const meChip = makeChip(tray, 'Tu, ' + me.name.split(' ')[0], photos && me.photo);
    await setCaption(stage, !useHouses
      ? 'Só tu não te podes calhar. Todos os outros estão em jogo!'
      : excluded.length
        ? `Primeiro saem as pessoas da tua casa (${me.house}).`
        : `Na tua casa (${me.house}) não há mais ninguém, só tu.`);
    meChip.classList.add('on');
    await sleep(600);
    for (const b of excluded) {
      const chip = makeChip(tray, b.person.name, photos && b.person.photo);
      if (photos && b.person.photo) {
        b.el.style.background = `center / cover no-repeat url("${b.person.photo}")`;
      }
      const sr = stage.getBoundingClientRect();
      const dr = chip.querySelector('.dot').getBoundingClientRect();
      const tx = dr.left + dr.width / 2 - sr.left - b.x;
      const ty = dr.top + dr.height / 2 - sr.top - b.y;
      b.el.style.zIndex = 5;
      await anim(b.el, [
        { transform: 'translate(0,0) scale(1)' },
        { transform: `translate(0px, ${-r - 10}px) scale(1.25)`, offset: 0.45 },
        { transform: `translate(${tx}px, ${ty}px) scale(0.62)` },
      ], { duration: 1100 });
      chip.classList.add('on');
      b.el.remove();
      await sleep(250);
    }
    const remaining = balls.filter((b) => !b.person.excluded);
    await sleep(500);

    // 3. Baralhar.
    await setCaption(stage, `Ficam ${remaining.length} bolas. A baralhar…`);
    await Promise.all(remaining.map((b) => {
      const frames = [{ transform: 'translate(0,0)' }];
      for (let k = 0; k < 8; k++) frames.push({ transform: `translate(${rand(-22, 22)}px, ${rand(-22, 22)}px)` });
      frames.push({ transform: 'translate(0,0)' });
      return anim(b.el, frames, { duration: 2600, easing: 'ease-in-out' });
    }));
    if (!skipping) await anim(bowl, [
      { transform: 'rotate(0)' }, { transform: 'rotate(-4deg)' }, { transform: 'rotate(4deg)' }, { transform: 'rotate(0)' },
    ], { duration: 500, fill: 'none' });

    // 4. Sai uma bola.
    await setCaption(stage, 'E o teu amigo secreto é…');
    const pick = remaining[Math.floor(Math.random() * remaining.length)];
    pick.el.classList.add('gold');
    pick.el.style.zIndex = 6;
    const topY = 175;
    await anim(pick.el, [
      { transform: 'translate(0,0) scale(1)' },
      { transform: `translate(${(cx - pick.x) * 0.3}px, ${-r - 30 - (pick.y - cy)}px) scale(1.6)`, offset: 0.5 },
      { transform: `translate(${cx - pick.x}px, ${topY - pick.y}px) scale(2.6)` },
    ], { duration: 1600 });
    await anim(pick.el, [
      { transform: `translate(${cx - pick.x}px, ${topY - pick.y}px) scale(2.6) rotate(0)` },
      { transform: `translate(${cx - pick.x}px, ${topY - pick.y}px) scale(2.75) rotate(-8deg)` },
      { transform: `translate(${cx - pick.x}px, ${topY - pick.y}px) scale(2.6) rotate(8deg)` },
      { transform: `translate(${cx - pick.x}px, ${topY - pick.y}px) scale(2.6) rotate(0)` },
    ], { duration: 900 });
    await sleep(500);

    // 5. A bola abre e aparece o nome.
    pick.el.remove();
    const halves = ['top', 'bottom'].map((side) => {
      const h = document.createElement('div');
      h.className = 'ball-half ' + side;
      h.style.left = cx + 'px';
      h.style.top = (side === 'top' ? topY - 48 : topY) + 'px';
      stage.append(h);
      return h;
    });
    stage.querySelector('#reveal-name').textContent = receiver.name;
    const rphoto = stage.querySelector('#reveal-photo');
    rphoto.classList.toggle('hidden', !(photos && receiver.photo));
    if (photos && receiver.photo) rphoto.style.backgroundImage = `url("${receiver.photo}")`;
    card.classList.remove('hidden');
    const cardAnim = anim(card, [
      { transform: 'scale(0.2)', opacity: 0 },
      { transform: 'scale(1.08)', opacity: 1, offset: 0.7 },
      { transform: 'scale(1)', opacity: 1 },
    ], { duration: 700, delay: 150 });
    await Promise.all([
      anim(halves[0], [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-90px) rotate(-25deg)', opacity: 0 }], { duration: 700 }),
      anim(halves[1], [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(110px) rotate(20deg)', opacity: 0 }], { duration: 700 }),
      cardAnim,
    ]);
    if (!skipping) confetti(stage, cx, topY);
    await setCaption(stage, `🎉 Vais oferecer um presente a ${receiver.name}!`);
    halves.forEach((h) => h.remove());
    await sleep(1600);
    if (skipping) {
      card.classList.remove('hidden');
      card.style.opacity = 1;
      card.style.transform = 'none';
    }
  }

  function makeChip(tray, label, photo) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = '<span class="dot"></span><span class="label"></span>';
    if (photo) {
      const dot = chip.querySelector('.dot');
      dot.classList.add('photo');
      dot.style.backgroundImage = `url("${photo}")`;
    }
    chip.querySelector('.label').textContent = label;
    tray.append(chip);
    return chip;
  }

  function skip() {
    skipping = true;
    document.querySelectorAll('.stage *').forEach((el) => el.getAnimations().forEach((a) => a.finish()));
    if (wake) wake();
  }

  window.Draw = { play, skip };
})();
