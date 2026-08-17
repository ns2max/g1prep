/* Ontario G1 Study Guide — app logic */
(function(){
'use strict';

const DATA = window.__G1_DATA__;
const rulesAll = [...DATA.rules1_68, ...DATA.rules69_123].sort((a,b)=>a.num-b.num);
const signsAll = DATA.signs.slice().sort((a,b)=>a.num-b.num);

const LS_KEY = 'g1_progress_v1';
function loadProgress(){
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {signs:{}, rules:{}}; }
  catch(e){ return {signs:{}, rules:{}}; }
}
function saveProgress(p){ localStorage.setItem(LS_KEY, JSON.stringify(p)); }
let progress = loadProgress();

const QS_KEY = 'g1_quizstate_v1';
function loadQuizState(){
  try { return JSON.parse(localStorage.getItem(QS_KEY)) || {}; }
  catch(e){ return {}; }
}
function saveQuizState(s){ localStorage.setItem(QS_KEY, JSON.stringify(s)); }
let quizState = loadQuizState();

function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

/* ---------- Navigation ---------- */
const views = document.querySelectorAll('.view');
const navBtns = document.querySelectorAll('.navbtn');
function showView(id){
  views.forEach(v=>v.classList.toggle('active', v.id === 'view-'+id));
  navBtns.forEach(b=>b.classList.toggle('active', b.dataset.view === id));
  window.scrollTo(0,0);
  location.hash = id;
}
navBtns.forEach(b=>b.addEventListener('click', ()=>showView(b.dataset.view)));
window.addEventListener('hashchange', ()=>{
  const id = location.hash.replace('#','') || 'overview';
  showView(id);
});

/* ---------- Quiz Engine (shared by Signs + Rules) ---------- */
function makeQuizEngine(opts){
  // opts: {containerId, bank, kind: 'sign'|'rule', progressKey}
  const container = document.getElementById(opts.containerId);
  let deck = [];
  let idx = 0;
  let mode = 'study'; // study | quiz
  let selected = null;
  let sessionCorrect = 0, sessionSeen = 0;
  let missedThisSession = [];
  let gen = 0; // bumped on any deck reset, invalidates pending auto-advance timers

  function persistState(){
    quizState[opts.progressKey] = {
      deck: deck.map(d=>d.num),
      idx, sessionCorrect, sessionSeen, missedThisSession
    };
    saveQuizState(quizState);
  }

  function resetDeck(filterFn, doShuffle){
    let bank = opts.bank.filter(filterFn || (()=>true));
    deck = doShuffle ? shuffle(bank) : bank;
    idx = 0; selected = null; sessionCorrect = 0; sessionSeen = 0; missedThisSession = []; gen++;
    persistState();
    render();
  }

  function resumeDeck(){
    const saved = quizState[opts.progressKey];
    if(saved && Array.isArray(saved.deck) && saved.deck.length){
      const byNum = new Map(opts.bank.map(d=>[d.num, d]));
      const restored = saved.deck.map(n=>byNum.get(n)).filter(Boolean);
      if(restored.length === saved.deck.length && saved.idx < restored.length){
        deck = restored;
        idx = saved.idx;
        sessionCorrect = saved.sessionCorrect || 0;
        sessionSeen = saved.sessionSeen || 0;
        missedThisSession = saved.missedThisSession || [];
        selected = null; gen++;
        render();
        return true;
      }
    }
    return false;
  }

  function currentItem(){ return deck[idx]; }

  function markProgress(item, correct){
    const key = String(item.num);
    const store = progress[opts.progressKey];
    if(!store[key]) store[key] = {seen:0, correct:0};
    store[key].seen++;
    if(correct) store[key].correct++;
    saveProgress(progress);
  }

  function choose(choiceIdx){
    if(selected !== null) return;
    selected = choiceIdx;
    const item = currentItem();
    const correct = (choiceIdx+1) === item.answer;
    sessionSeen++;
    if(correct) sessionCorrect++; else missedThisSession.push(item.num);
    markProgress(item, correct);
    persistState();
    render();
    if(correct){
      const genAtChoice = gen;
      setTimeout(()=>{ if(gen === genAtChoice) next(); }, 700);
    }
  }

  function next(){
    if(idx < deck.length-1){ idx++; selected = null; persistState(); render(); }
    else { persistState(); render(true); }
  }
  function prev(){
    if(idx > 0){ idx--; selected = null; persistState(); render(); }
  }

  function statLine(){
    const key = String(currentItem() ? currentItem().num : '');
    return '';
  }

  function render(finished){
    if(deck.length === 0){
      container.innerHTML = '<p class="empty">No items match this filter.</p>';
      return;
    }
    if(finished){
      const pct = sessionSeen ? Math.round(100*sessionCorrect/sessionSeen) : 0;
      container.innerHTML = `
        <div class="quiz-done">
          <h3>Session complete</h3>
          <p class="score-big">${sessionCorrect} / ${sessionSeen} correct (${pct}%)</p>
          ${missedThisSession.length ? `<p>Missed: ${missedThisSession.sort((a,b)=>a-b).join(', ')}</p>` : '<p>Perfect run! 🎉</p>'}
          <div class="quiz-controls">
            <button class="btn" data-action="restart-same">Repeat this set</button>
            <button class="btn" data-action="restart-missed">Retry missed only</button>
          </div>
        </div>`;
      container.querySelector('[data-action="restart-same"]').addEventListener('click', ()=>{ idx=0; selected=null; sessionCorrect=0; sessionSeen=0; missedThisSession=[]; gen++; persistState(); render(); });
      container.querySelector('[data-action="restart-missed"]').addEventListener('click', ()=>{
        const missedSet = new Set(missedThisSession);
        deck = deck.filter(d=>missedSet.has(d.num));
        idx=0; selected=null; sessionCorrect=0; sessionSeen=0; missedThisSession=[]; gen++;
        persistState();
        render();
      });
      return;
    }
    const item = currentItem();
    const isSign = opts.kind === 'sign';
    const qText = isSign ? 'What does this sign mean?' : item.question;
    let choicesHtml = item.choices.map((c,i)=>{
      let cls = 'choice';
      if(selected !== null){
        if((i+1) === item.answer) cls += ' correct';
        else if(i === selected) cls += ' incorrect';
      }
      return `<button class="${cls}" data-choice="${i}" ${selected!==null?'disabled':''}>${i+1}. ${escapeHtml(c)}</button>`;
    }).join('');

    container.innerHTML = `
      <div class="quiz-progress">Question ${idx+1} of ${deck.length} &middot; #${item.num} &middot; Session: ${sessionCorrect}/${sessionSeen}</div>
      <div class="quiz-card">
        <img class="quiz-img" src="${item.image}" alt="${isSign?'Sign':'Illustration'} for question ${item.num}" onerror="this.style.display='none'">
        <div class="quiz-q">${escapeHtml(qText)}</div>
        <div class="choices">${choicesHtml}</div>
        ${selected!==null ? `<div class="answer-banner ${((selected+1)===item.answer)?'ok':'bad'}">${((selected+1)===item.answer)?'Correct!':'Incorrect — correct answer is #'+item.answer}</div>` : ''}
      </div>
      <div class="quiz-controls">
        <button class="btn" data-action="prev" ${idx===0?'disabled':''}>&larr; Prev</button>
        <button class="btn primary" data-action="next">${idx===deck.length-1 ? 'Finish' : 'Next →'}</button>
      </div>`;
    container.querySelectorAll('[data-choice]').forEach(b=>b.addEventListener('click', ()=>choose(parseInt(b.dataset.choice,10))));
    container.querySelector('[data-action="next"]').addEventListener('click', next);
    const prevBtn = container.querySelector('[data-action="prev"]');
    if(prevBtn) prevBtn.addEventListener('click', prev);
  }

  return { resetDeck, resumeDeck, render };
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ---------- Signs view ---------- */
const signEngine = makeQuizEngine({containerId:'signs-quiz', bank: signsAll, kind:'sign', progressKey:'signs'});
if(!signEngine.resumeDeck()) signEngine.resetDeck(null, false);
document.getElementById('signs-shuffle').addEventListener('click', ()=>signEngine.resetDeck(null, true));
document.getElementById('signs-order').addEventListener('click', ()=>signEngine.resetDeck(null, false));

/* ---------- Rules view ---------- */
const ruleEngine = makeQuizEngine({containerId:'rules-quiz', bank: rulesAll, kind:'rule', progressKey:'rules'});
if(!ruleEngine.resumeDeck()) ruleEngine.resetDeck(null, false);
document.getElementById('rules-shuffle').addEventListener('click', ()=>ruleEngine.resetDeck(null, true));
document.getElementById('rules-order').addEventListener('click', ()=>ruleEngine.resetDeck(null, false));

/* ---------- Sign gallery (browse-all reference grid) ---------- */
function renderSignGallery(){
  const grid = document.getElementById('signs-gallery');
  grid.innerHTML = signsAll.map(s=>`
    <div class="gallery-card">
      <img src="${s.image}" alt="Sign ${s.num}" loading="lazy" onerror="this.style.display='none'">
      <div class="gallery-num">#${s.num}</div>
      <div class="gallery-answer">${escapeHtml(s.choices[s.answer-1])}</div>
    </div>`).join('');
}
renderSignGallery();

/* ---------- Rules browse-all list ---------- */
function renderRulesList(){
  const list = document.getElementById('rules-list');
  list.innerHTML = rulesAll.map(r=>`
    <details class="rule-item">
      <summary>#${r.num}. ${escapeHtml(r.question)}</summary>
      <div class="rule-body">
        <img class="rule-img" src="${r.image}" alt="Illustration for question ${r.num}" onerror="this.style.display='none'">
        <ol class="rule-choices">
          ${r.choices.map((c,i)=>`<li class="${(i+1)===r.answer?'correct-choice':''}">${escapeHtml(c)}</li>`).join('')}
        </ol>
      </div>
    </details>`).join('');
}
renderRulesList();

/* ---------- Road Test reference ---------- */
function renderSectionArticle(topic, imgBase){
  let html = `<article class="topic" id="topic-${topic.id}"><h3>${topic.num}. ${escapeHtml(topic.title)}</h3>`;
  const imgs = topic.images || [];
  if(imgs.length){
    html += `<div class="topic-images">` + imgs.map(k=>`<img src="${imgBase}/${k}.png" alt="${escapeHtml(topic.title)}" loading="lazy" onerror="this.parentElement.removeChild(this)">`).join('') + `</div>`;
  }
  (topic.body||[]).forEach(p=> html += `<p>${escapeHtml(p)}</p>`);
  if(topic.list){
    html += '<dl class="deflist">' + topic.list.map(l=>`<dt>${escapeHtml(l.term)}</dt><dd>${escapeHtml(l.def)}</dd>`).join('') + '</dl>';
  }
  (topic.body2||[]).forEach(p=> html += `<p>${escapeHtml(p)}</p>`);
  if(topic.list2){
    html += '<dl class="deflist">' + topic.list2.map(l=>`<dt>${escapeHtml(l.term)}</dt><dd>${escapeHtml(l.def)}</dd>`).join('') + '</dl>';
  }
  if(topic.olist){
    html += '<ol>' + topic.olist.map(x=>`<li>${escapeHtml(x)}</li>`).join('') + '</ol>';
  }
  if(topic.ulist){
    html += '<ul>' + topic.ulist.map(x=>`<li>${escapeHtml(x)}</li>`).join('') + '</ul>';
  }
  if(topic.table){
    html += `<p class="table-caption">${escapeHtml(topic.table.caption||'')}</p><table class="ref-table"><thead><tr>` +
      topic.table.headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('') + '</tr></thead><tbody>' +
      topic.table.rows.map(r=>`<tr>${r.map(c=>`<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('') + '</tbody></table>';
  }
  if(topic.sub){
    topic.sub.forEach(s=>{
      html += `<h4>${escapeHtml(s.h||'')}</h4>`;
      if(s.p) html += `<p>${escapeHtml(s.p)}</p>`;
      if(s.images) html += `<div class="topic-images">` + s.images.map(k=>`<img src="${imgBase}/${k}.png" alt="" loading="lazy" onerror="this.parentElement.removeChild(this)">`).join('') + `</div>`;
      if(s.steps) html += '<ol>' + s.steps.map(x=>`<li>${escapeHtml(x)}</li>`).join('') + '</ol>';
      if(s.note) html += `<p class="note">★ ${escapeHtml(s.note)}</p>`;
    });
  }
  if(topic.note) html += `<p class="note">★ ${escapeHtml(topic.note)}</p>`;
  html += '</article>';
  return html;
}

function renderRoadTest(){
  const el = document.getElementById('roadtest-content');
  el.innerHTML = DATA.roadtest.map(t=>renderSectionArticle(t, 'assets/images/roadtest')).join('');
  const toc = document.getElementById('roadtest-toc');
  toc.innerHTML = DATA.roadtest.map(t=>`<a href="#topic-${t.id}" data-jump="${t.id}">${t.num}. ${escapeHtml(t.title)}</a>`).join('');
  toc.querySelectorAll('a').forEach(a=>a.addEventListener('click', (e)=>{
    e.preventDefault();
    document.getElementById('topic-'+a.dataset.jump).scrollIntoView({behavior:'smooth', block:'start'});
  }));
}
renderRoadTest();

function renderBonus(){
  const el = document.getElementById('bonus-content');
  el.innerHTML = DATA.bonus.map(t=>renderSectionArticle(t, 'assets/images/bonus')).join('');
}
renderBonus();

/* ---------- Licensing table ---------- */
function renderLicensing(){
  const el = document.getElementById('licensing-content');
  const L = DATA.licensing;
  el.innerHTML = `<h3>${escapeHtml(L.title)}</h3><table class="ref-table"><thead><tr>${L.headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${
    L.rows.map(r=>`<tr><td class="cls-cell">${escapeHtml(r[0])}</td><td>${escapeHtml(r[1])}</td><td>${escapeHtml(r[2])}</td></tr>`).join('')
  }</tbody></table>`;
}
renderLicensing();

/* ---------- Overview ---------- */
function renderOverview(){
  const I = DATA.intro;
  const el = document.getElementById('overview-content');
  let html = `<p class="lead">${escapeHtml(I.intro).replace(/\n\n/g,'</p><p class="lead">')}</p>`;
  html += '<ul class="parts">' + I.parts.map(p=>`<li>${escapeHtml(p)}</li>`).join('') + '</ul>';

  html += '<h3>Knowledge Test Format</h3>';
  html += `<p>${escapeHtml(I.knowledgeTestInfo.typesOfQuestions)}</p>`;
  html += `<p>${escapeHtml(I.knowledgeTestInfo.visionTest)}</p>`;
  html += `<p>${escapeHtml(I.knowledgeTestInfo.retake)}</p>`;

  html += '<h3>Graduated Licensing System</h3>';
  html += `<p>${escapeHtml(I.graduatedLicensing.body)}</p>`;
  html += `<div class="flow">${I.graduatedLicensing.flow.map(s=>`<span class="flow-step">${escapeHtml(s)}</span>`).join('<span class="flow-arrow">&darr;</span>')}</div>`;
  html += `<h4>${escapeHtml(I.graduatedLicensing.g1.title)}</h4><p>${escapeHtml(I.graduatedLicensing.g1.body)}</p><ul>${I.graduatedLicensing.g1.rules.map(r=>`<li>${escapeHtml(r)}</li>`).join('')}</ul><p class="note">★ ${escapeHtml(I.graduatedLicensing.g1.note)}</p>`;
  html += `<h4>${escapeHtml(I.graduatedLicensing.g2.title)}</h4><p>${escapeHtml(I.graduatedLicensing.g2.body)}</p><ul>${I.graduatedLicensing.g2.rules.map(r=>`<li>${escapeHtml(r)}</li>`).join('')}</ul>`;
  html += `<p><strong>${escapeHtml(I.graduatedLicensing.g2.teenRules.intro)}</strong></p><ul>${I.graduatedLicensing.g2.teenRules.rules.map(r=>`<li>${escapeHtml(r)}</li>`).join('')}</ul>`;
  html += `<p class="note">★ Exemptions: ${I.graduatedLicensing.g2.exemptions.map(escapeHtml).join(' ')}</p>`;
  html += `<h4>${escapeHtml(I.graduatedLicensing.fiveYearRule.title)}</h4><p>${escapeHtml(I.graduatedLicensing.fiveYearRule.body)}</p>`;

  html += '<h3>Demerit Point System</h3>';
  html += '<div class="demerit-table">' + I.demeritPoints.groups.map(g=>`
    <div class="demerit-row"><div class="demerit-points">${g.points} Points</div><ul>${g.items.map(i=>`<li>${escapeHtml(i)}</li>`).join('')}</ul></div>
  `).join('') + '</div>';

  html += '<h3>What to Bring to Your Knowledge Test</h3><ul>' + I.thingsToBring.map(t=>`<li>${escapeHtml(t)}</li>`).join('') + '</ul>';
  html += '<table class="ref-table"><thead><tr><th>Requirement</th><th>Accepted forms</th></tr></thead><tbody>' +
    I.acceptedForms.map(f=>`<tr><td>${escapeHtml(f.type)}</td><td>${escapeHtml(f.examples)}</td></tr>`).join('') + '</tbody></table>';

  html += '<h3>DriveTest Centres (selected)</h3><ul class="centres">' + I.examCentres.map(c=>`<li><strong>${escapeHtml(c.name)}</strong> — ${escapeHtml(c.address)}, ${escapeHtml(c.tel)}, ${escapeHtml(c.hours)}</li>`).join('') + '</ul>';
  html += `<p class="note">${escapeHtml(I.examCentresNote)}</p>`;
  html += '<details class="more-centres"><summary>More DriveTest Centres</summary><ul class="centres">' + I.driveTestCentresMore.map(c=>`<li>${c.num}. <strong>${escapeHtml(c.city)}</strong>: ${escapeHtml(c.address)}${c.tel?', '+escapeHtml(c.tel):''}</li>`).join('') + `</ul><p class="note">${escapeHtml(I.driveTestCentresMoreNote)}</p></details>`;

  html += `<p class="attribution">${escapeHtml(I.attribution)}<br>${escapeHtml(I.publisher)} — ISBN ${escapeHtml(I.isbn)}</p>`;
  el.innerHTML = html;
}
renderOverview();

/* ---------- Progress dashboard ---------- */
function renderProgress(){
  const el = document.getElementById('progress-content');
  function summarize(store, total){
    const keys = Object.keys(store);
    const attempted = keys.length;
    let correct = 0, seen = 0;
    keys.forEach(k=>{ correct += store[k].correct; seen += store[k].seen; });
    const mastered = keys.filter(k=>store[k].correct>0 && store[k].correct===store[k].seen).length;
    return {attempted, total, correct, seen, mastered};
  }
  const s = summarize(progress.signs, signsAll.length);
  const r = summarize(progress.rules, rulesAll.length);
  el.innerHTML = `
    <div class="progress-grid">
      <div class="progress-card"><h4>Traffic Signs</h4><p>${s.attempted}/${s.total} attempted</p><p>${s.seen? Math.round(100*s.correct/s.seen):0}% accuracy across ${s.seen} answers</p></div>
      <div class="progress-card"><h4>Rules of the Road</h4><p>${r.attempted}/${r.total} attempted</p><p>${r.seen? Math.round(100*r.correct/r.seen):0}% accuracy across ${r.seen} answers</p></div>
    </div>
    <button class="btn" id="reset-progress">Reset all progress</button>`;
  document.getElementById('reset-progress').addEventListener('click', ()=>{
    if(confirm('Reset all saved progress?')){
      progress = {signs:{}, rules:{}};
      saveProgress(progress);
      renderProgress();
    }
  });
}
renderProgress();
document.querySelectorAll('.navbtn').forEach(b=>b.addEventListener('click', ()=>{ if(b.dataset.view==='progress') renderProgress(); }));

/* ---------- Practice Exam (real format: 20 signs + 20 rules, pass = <=4 wrong per section) ---------- */
let examState = null;
function startExam(){
  const examSigns = shuffle(signsAll).slice(0,20).map(x=>({...x, section:'sign'}));
  const examRules = shuffle(rulesAll).slice(0,20).map(x=>({...x, section:'rule'}));
  examState = {
    items: [...examSigns, ...examRules],
    idx: 0,
    answers: new Array(40).fill(null)
  };
  renderExam();
}
function renderExam(){
  const el = document.getElementById('exam-content');
  if(!examState){
    el.innerHTML = `<div class="exam-intro">
      <p>Simulates the real G1 Knowledge Test format as described in the handbook: <strong>40 multiple-choice questions</strong> — 20 on traffic signs, 20 on general driving knowledge (Rules of the Road). You must score <strong>no more than 4 incorrect in each section</strong> to pass.</p>
      <button class="btn primary" id="start-exam">Start Practice Exam</button>
    </div>`;
    document.getElementById('start-exam').addEventListener('click', startExam);
    return;
  }
  const item = examState.items[examState.idx];
  const isSign = item.section === 'sign';
  const qText = isSign ? 'What does this sign mean?' : item.question;
  const chosen = examState.answers[examState.idx];
  const choicesHtml = item.choices.map((c,i)=>{
    let cls = 'choice';
    if(chosen === i) cls += ' selected';
    return `<button class="${cls}" data-choice="${i}">${i+1}. ${escapeHtml(c)}</button>`;
  }).join('');
  el.innerHTML = `
    <div class="quiz-progress">Question ${examState.idx+1} of 40 &middot; Section: ${isSign?'Traffic Signs':'Rules of the Road'}</div>
    <div class="quiz-card">
      <img class="quiz-img" src="${item.image}" alt="" onerror="this.style.display='none'">
      <div class="quiz-q">${escapeHtml(qText)}</div>
      <div class="choices">${choicesHtml}</div>
    </div>
    <div class="quiz-controls">
      <button class="btn" data-action="prev" ${examState.idx===0?'disabled':''}>&larr; Prev</button>
      <button class="btn primary" data-action="next">${examState.idx===39 ? 'Submit Exam' : 'Next →'}</button>
    </div>`;
  el.querySelectorAll('[data-choice]').forEach(b=>b.addEventListener('click', ()=>{
    examState.answers[examState.idx] = parseInt(b.dataset.choice,10);
    renderExam();
  }));
  el.querySelector('[data-action="next"]').addEventListener('click', ()=>{
    if(examState.idx < 39){ examState.idx++; renderExam(); }
    else finishExam();
  });
  const prevBtn = el.querySelector('[data-action="prev"]');
  if(prevBtn) prevBtn.addEventListener('click', ()=>{ examState.idx--; renderExam(); });
}
function finishExam(){
  const el = document.getElementById('exam-content');
  let signWrong = 0, ruleWrong = 0, signTotal=0, ruleTotal=0;
  const missed = [];
  examState.items.forEach((item, i)=>{
    const chosen = examState.answers[i];
    const correct = chosen !== null && (chosen+1) === item.answer;
    if(item.section === 'sign') signTotal++; else ruleTotal++;
    if(!correct){
      if(item.section === 'sign') signWrong++; else ruleWrong++;
      missed.push({num:item.num, section:item.section, question: item.section==='sign' ? 'Sign #'+item.num : item.question});
    }
  });
  const pass = signWrong <= 4 && ruleWrong <= 4;
  el.innerHTML = `
    <div class="quiz-done">
      <h3>${pass ? 'PASS ✅' : 'DID NOT PASS ❌'}</h3>
      <p class="score-big">Signs: ${signTotal-signWrong}/${signTotal} correct (${signWrong} wrong, max 4 allowed)</p>
      <p class="score-big">Rules: ${ruleTotal-ruleWrong}/${ruleTotal} correct (${ruleWrong} wrong, max 4 allowed)</p>
      ${missed.length ? `<div class="missed-list"><h4>Review missed questions:</h4><ul>${missed.map(m=>`<li>[${m.section}] #${m.num}${m.section==='rule' ? ': '+escapeHtml(m.question) : ''}</li>`).join('')}</ul></div>` : '<p>Perfect score! 🎉</p>'}
      <button class="btn primary" id="retry-exam">New Practice Exam</button>
    </div>`;
  document.getElementById('retry-exam').addEventListener('click', ()=>{ examState = null; renderExam(); });
}
renderExam();
document.querySelectorAll('.navbtn').forEach(b=>b.addEventListener('click', ()=>{ if(b.dataset.view==='exam' && !examState) renderExam(); }));

/* ---------- Search ---------- */
const searchInput = document.getElementById('global-search');
const searchResults = document.getElementById('search-results');
searchInput.addEventListener('input', ()=>{
  const q = searchInput.value.trim().toLowerCase();
  if(q.length < 2){ searchResults.innerHTML=''; searchResults.classList.remove('open'); return; }
  const results = [];
  rulesAll.forEach(r=>{ if(r.question.toLowerCase().includes(q)) results.push({type:'Rule', num:r.num, text:r.question}); });
  DATA.roadtest.forEach(t=>{ if(t.title.toLowerCase().includes(q)) results.push({type:'Road Test', num:t.num, text:t.title, jump:t.id}); });
  DATA.bonus.forEach(t=>{ if(t.title.toLowerCase().includes(q)) results.push({type:'Bonus', num:t.num, text:t.title}); });
  searchResults.innerHTML = results.slice(0,15).map(r=>`<div class="search-hit" data-type="${r.type}" data-jump="${r.jump||''}">${r.type} ${r.num}: ${escapeHtml(r.text)}</div>`).join('') || '<div class="search-hit">No matches</div>';
  searchResults.classList.add('open');
  searchResults.querySelectorAll('.search-hit[data-type="Road Test"]').forEach(h=>h.addEventListener('click', ()=>{
    showView('roadtest');
    setTimeout(()=>{ const t=document.getElementById('topic-'+h.dataset.jump); if(t) t.scrollIntoView({behavior:'smooth'}); }, 50);
    searchResults.classList.remove('open');
  }));
});

/* ---------- Theme toggle ---------- */
const themeBtn = document.getElementById('theme-toggle');
function applyTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('g1_theme', t);
}
themeBtn.addEventListener('click', ()=>{
  const cur = document.documentElement.getAttribute('data-theme');
  applyTheme(cur === 'dark' ? 'light' : 'dark');
});
applyTheme(localStorage.getItem('g1_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark':'light'));

/* ---------- Initial route ---------- */
showView(location.hash.replace('#','') || 'overview');

})();
