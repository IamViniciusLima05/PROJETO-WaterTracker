/* WaterTracker — registro de água, meta do dia, histórico e lembretes visuais */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const banco = {
  ler(k, padrao) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? padrao; } catch { return padrao; } },
  salvar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem storage */ } }
};
const ml = (v) => `${Math.round(v).toLocaleString('pt-BR')} ml`;
const iso = (d = new Date()) => new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const hhmm = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

let cfg = { meta: 2000, peso: '', copos: [200, 300, 500], lembrar: true, intervalo: 60, inicio: '08:00', fim: '22:00', notif: false, ...banco.ler('wt_cfg', {}) };
let dias = banco.ler('wt_dias', null);
if (!dias) {
  // alguns dias de exemplo para o gráfico não começar vazio
  dias = {};
  [1650, 2200, 1900, 2400, 1300, 2050].forEach((v, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const base = new Date(d); base.setHours(8, 0, 0, 0);
    const regs = []; let soma = 0, k = 0;
    while (soma < v) { const q = Math.min([250, 300, 500, 200][k % 4], v - soma); regs.push({ t: base.getTime() + k * 85 * 6e4, ml: q }); soma += q; k++; }
    dias[iso(d)] = { regs, meta: 2000 };
  });
}
const salvar = () => { banco.salvar('wt_dias', dias); banco.salvar('wt_cfg', cfg); };
const hoje = () => (dias[iso()] ||= { regs: [], meta: cfg.meta });
const total = (d) => (d?.regs || []).reduce((s, r) => s + r.ml, 0);

/* ---------- Desenho ---------- */
function desenhar() {
  const h = hoje(); h.meta = cfg.meta;
  const t = total(h), pct = Math.min(100, Math.round((t / cfg.meta) * 100));
  $('#data').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#bebido').textContent = Math.round(t).toLocaleString('pt-BR');
  $('#meta-txt').textContent = `de ${ml(cfg.meta)}`;
  $('#pct').textContent = `${Math.round((t / cfg.meta) * 100)}%`;
  $('#agua').style.height = `${pct}%`;
  $('#agua').classList.toggle('cheia', t >= cfg.meta);
  $('#garrafa').classList.toggle('alto', pct >= 55);
  $('#garrafa').setAttribute('aria-label', `${ml(t)} de ${ml(cfg.meta)}, ${pct}% da meta`);
  const falta = cfg.meta - t;
  $('#msg').textContent = t === 0 ? 'Comece o dia com um copo d’água 💧' : falta <= 0 ? '🎉 Meta do dia batida! Muito bem.' : pct >= 75 ? `Quase lá! Faltam ${ml(falta)}.` : `Faltam ${ml(falta)} — uns ${Math.ceil(falta / cfg.copos[0])} copos de ${cfg.copos[0]} ml.`;

  $('#rapidos').innerHTML = cfg.copos.map((c, i) => `<button class="rapido" data-ml="${c}"><span class="ic" aria-hidden="true">${['🥛', '🥤', '🍶'][i] || '💧'}</span>+${c} ml<small>${['copo', 'copo grande', 'garrafa'][i] || ''}</small></button>`).join('');

  const regs = [...h.regs].reverse();
  $('#registros').innerHTML = regs.length ? regs.map((r) => `<li><span class="hora">${hhmm(r.t)}</span>💧<b>${ml(r.ml)}</b><button class="x" data-tirar="${r.t}" aria-label="Remover ${r.ml} ml das ${hhmm(r.t)}">✕</button></li>`).join('') : '<li class="vazio">Nada registrado ainda hoje.</li>';
  $('#desfazer').hidden = !h.regs.length;
  desenharSemana(); proximoAviso();
}
function desenharSemana() {
  const lista = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); const k = iso(d); return { d, k, v: total(dias[k]), meta: dias[k]?.meta || cfg.meta }; });
  const max = Math.max(cfg.meta * 1.2, ...lista.map((x) => x.v));
  $('#semana').innerHTML = `<span class="linha-meta" style="bottom:${20 + (cfg.meta / max) * 110}px"><span>meta</span></span>` + lista.map((x, i) => `<div class="dia ${i === 6 ? 'hoje' : ''}"><span class="col ${x.v >= x.meta ? 'ok' : ''}" style="height:${Math.max(4, (x.v / max) * 110)}px" title="${ml(x.v)}"></span><small>${i === 6 ? 'Hoje' : x.d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').slice(0, 3)}</small></div>`).join('');
  const comDados = lista.filter((x) => x.v > 0);
  const media = comDados.length ? comDados.reduce((s, x) => s + x.v, 0) / comDados.length : 0;
  // sequência de dias seguidos batendo a meta (hoje conta se já bateu)
  let seq = 0; const d = new Date();
  if (total(dias[iso(d)]) < cfg.meta) d.setDate(d.getDate() - 1);
  while (total(dias[iso(d)]) >= (dias[iso(d)]?.meta || cfg.meta) && total(dias[iso(d)]) > 0) { seq++; d.setDate(d.getDate() - 1); }
  $('#numeros-sem').innerHTML = `<div><b>${ml(media).replace(' ml', '')}</b><small>ml por dia</small></div><div><b>${lista.filter((x) => x.v >= x.meta).length}/7</b><small>metas batidas</small></div><div><b>${seq}🔥</b><small>dias seguidos</small></div>`;
}

/* ---------- Registro ---------- */
function beber(q) {
  q = Math.round(+q); if (!q || q < 1) return;
  const antes = total(hoje());
  hoje().regs.push({ t: Date.now(), ml: q });
  ultimoAviso = Date.now(); fecharLembrete();
  salvar(); desenhar();
  if (antes < cfg.meta && antes + q >= cfg.meta) { toast('🎉 Meta do dia batida!'); confete(); } else toast(`+${q} ml`);
}
$('#rapidos').addEventListener('click', (e) => { const b = e.target.closest('[data-ml]'); if (b) beber(b.dataset.ml); });
$('#form-outro').addEventListener('submit', (e) => { e.preventDefault(); const v = +$('#outro-ml').value; if (v < 10 || v > 3000) { toast('Digite entre 10 e 3.000 ml'); return; } beber(v); $('#outro-ml').value = ''; });
$('#registros').addEventListener('click', (e) => { const b = e.target.closest('[data-tirar]'); if (!b) return; hoje().regs = hoje().regs.filter((r) => r.t !== +b.dataset.tirar); salvar(); desenhar(); });
$('#desfazer').addEventListener('click', () => { const r = hoje().regs.pop(); salvar(); desenhar(); if (r) toast(`Removido: ${r.ml} ml`); });

function confete() {
  for (let i = 0; i < 24; i++) {
    const s = document.createElement('span'); s.textContent = '💧';
    s.style.cssText = `position:fixed;left:${50 + (Math.random() - .5) * 40}%;top:40%;font-size:${16 + Math.random() * 18}px;pointer-events:none;z-index:60;transition:transform 1.4s cubic-bezier(.2,.8,.4,1),opacity 1.4s`;
    document.body.append(s);
    requestAnimationFrame(() => { s.style.transform = `translate(${(Math.random() - .5) * 500}px, ${(Math.random() - .3) * 500}px) rotate(${Math.random() * 360}deg)`; s.style.opacity = '0'; });
    setTimeout(() => s.remove(), 1500);
  }
}

/* ---------- Lembretes ---------- */
let ultimoAviso = (() => { const r = hoje().regs.at(-1); return r ? r.t : Date.now(); })();
let adiadoAte = 0, tituloTimer = null;
const minutos = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
function dentroDoHorario(d = new Date()) { const m = d.getHours() * 60 + d.getMinutes(); return m >= minutos(cfg.inicio) && m <= minutos(cfg.fim); }
function proximoAviso() {
  if (!cfg.lembrar) { $('#prox').textContent = 'Lembretes desligados.'; return; }
  if (total(hoje()) >= cfg.meta) { $('#prox').textContent = 'Meta batida — sem lembretes por hoje. 😊'; return; }
  const prox = Math.max(ultimoAviso + cfg.intervalo * 6e4, adiadoAte);
  $('#prox').textContent = dentroDoHorario() ? `⏰ Próximo lembrete às ${hhmm(prox)}` : `Lembretes das ${cfg.inicio} às ${cfg.fim}.`;
}
function verificar() {
  if (!cfg.lembrar || !$('#lembrete').hidden || total(hoje()) >= cfg.meta || !dentroDoHorario()) return;
  const agora = Date.now();
  if (agora < adiadoAte || agora - ultimoAviso < cfg.intervalo * 6e4) return;
  mostrarLembrete();
}
function mostrarLembrete() {
  const falta = cfg.meta - total(hoje());
  const minSem = Math.round((Date.now() - (hoje().regs.at(-1)?.t || ultimoAviso)) / 6e4);
  $('#lembrete-txt').textContent = `${hoje().regs.length ? `Último copo há ${minSem >= 60 ? `${Math.floor(minSem / 60)} h ${minSem % 60} min` : `${minSem} min`}. ` : ''}Faltam ${ml(falta)}.`;
  $('#lembrete-beber').textContent = `Bebi ${cfg.copos[0]} ml`;
  $('#lembrete').hidden = false; document.body.classList.add('lembrando');
  // título da aba pisca para chamar atenção quando a página está em segundo plano
  let alt = false; clearInterval(tituloTimer);
  tituloTimer = setInterval(() => { document.title = (alt = !alt) ? '💧 Beba água!' : 'WaterTracker | Beba água'; }, 1000);
  if (cfg.notif && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
    try { new Notification('Hora de beber água 💧', { body: `Faltam ${ml(falta)} para a meta de hoje.`, tag: 'watertracker' }); } catch { /* alguns celulares não permitem */ }
  }
}
function fecharLembrete() { $('#lembrete').hidden = true; document.body.classList.remove('lembrando'); clearInterval(tituloTimer); document.title = 'WaterTracker | Beba água'; }
$('#lembrete-beber').addEventListener('click', () => beber(cfg.copos[0]));
$('#lembrete-adiar').addEventListener('click', () => { adiadoAte = Date.now() + 15 * 6e4; ultimoAviso = Date.now() - cfg.intervalo * 6e4 + 15 * 6e4; fecharLembrete(); proximoAviso(); toast('Lembro de novo em 15 minutos'); });
let diaAtual = iso();
setInterval(() => { verificar(); if (iso() !== diaAtual) { diaAtual = iso(); desenhar(); } }, 20000);

/* ---------- Configurações ---------- */
function sugestao() {
  const p = parseFloat($('#c-peso').value);
  $('#c-sugestao').innerHTML = p >= 20 ? `Sugestão para ${p} kg: <b>${ml(Math.round((p * 35) / 50) * 50)}</b> por dia (35 ml por kg). <button type="button" class="link" id="usar-sug">Usar</button> Em dias quentes ou com exercício, beba mais. Se você tem orientação médica sobre líquidos, siga a do seu médico.`
    : 'Informe o peso para ver uma sugestão (cerca de 35 ml por kg). Em dias quentes ou com exercício, beba mais. Se você tem orientação médica sobre líquidos, siga a do seu médico.';
}
$('#c-peso').addEventListener('input', sugestao);
$('#c-sugestao').addEventListener('click', (e) => { if (e.target.id === 'usar-sug') $('#c-meta').value = Math.round((parseFloat($('#c-peso').value) * 35) / 50) * 50; });
$('#abrir-config').addEventListener('click', () => {
  $('#dlg-config').returnValue = '';
  $('#c-meta').value = cfg.meta; $('#c-peso').value = cfg.peso; cfg.copos.forEach((c, i) => { $(`#c-copo${i + 1}`).value = c; });
  $('#c-lembrar').checked = cfg.lembrar; $('#c-intervalo').value = cfg.intervalo; $('#c-inicio').value = cfg.inicio; $('#c-fim').value = cfg.fim; $('#c-notif').checked = cfg.notif;
  const z = $('#zerar-hoje'); z.textContent = 'Zerar hoje';
  sugestao(); $('#dlg-config').showModal();
});
$('#c-notif').addEventListener('change', async (e) => {
  if (!e.target.checked) return;
  if (!('Notification' in window)) { toast('Seu navegador não tem notificações'); e.target.checked = false; return; }
  const p = await Notification.requestPermission();
  if (p !== 'granted') { toast('Permissão de notificação negada'); e.target.checked = false; }
});
$('#zerar-hoje').addEventListener('click', (e) => {
  if (e.target.textContent !== 'Confirmar') { e.target.textContent = 'Confirmar'; return; }
  hoje().regs = []; salvar(); desenhar(); $('#dlg-config').close('zerar'); toast('Registros de hoje apagados');
});
$('#dlg-config').addEventListener('close', () => {
  if ($('#dlg-config').returnValue !== 'salvar') return;
  cfg.meta = Math.min(6000, Math.max(500, Math.round(+$('#c-meta').value || 2000)));
  cfg.peso = $('#c-peso').value;
  cfg.copos = [1, 2, 3].map((i) => Math.min(2000, Math.max(10, Math.round(+$(`#c-copo${i}`).value || [200, 300, 500][i - 1])))).sort((a, b) => a - b);
  cfg.lembrar = $('#c-lembrar').checked; cfg.intervalo = +$('#c-intervalo').value;
  cfg.inicio = $('#c-inicio').value || '08:00'; cfg.fim = $('#c-fim').value || '22:00'; cfg.notif = $('#c-notif').checked;
  salvar(); desenhar(); toast('Configurações salvas');
});

let timerToast;
function toast(msg) { const t = $('#toast'); (document.querySelector('dialog[open]') || document.body).append(t); t.textContent = msg; t.hidden = false; clearTimeout(timerToast); timerToast = setTimeout(() => { t.hidden = true; }, 2200); }

salvar();
desenhar();
verificar();
