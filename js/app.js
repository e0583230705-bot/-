// CRM - שלמה וקסלר ייעוץ משכנתאות
(() => {
  const STAGES = [
    'ליד חדש',
    'פגישת היכרות',
    'איסוף מסמכים',
    'הגשה לבנקים',
    'אישור עקרוני',
    'משא ומתן',
    'אישור סופי',
    'נחתם',
  ];
  const LOST = 'לא רלוונטי';
  const ALL_STAGES = [...STAGES, LOST];

  const PURPOSES = Object.keys(Mortgage.maxLtvByPurpose);
  const SOURCES = ['המלצה', 'פייסבוק', 'גוגל', 'אתר', 'מתווך', 'קבלן', 'לקוח חוזר', 'אחר'];
  const BANKS = ['', 'לאומי', 'הפועלים', 'מזרחי טפחות', 'דיסקונט', 'הבינלאומי', 'ירושלים', 'מרכנתיל'];
  const DOCUMENTS = [
    'צילום תעודות זהות + ספח',
    '3 תלושי שכר אחרונים',
    'דפי עו"ש ל-3 חודשים',
    'דוח רציפות תעסוקה / שומת מס',
    'חוזה רכישה / זיכרון דברים',
    'נסח טאבו / אישור זכויות',
    'שמאות',
    'אישור הון עצמי',
    'דוח נתוני אשראי (BDI)',
    'פוליסות ביטוח חיים ומבנה',
  ];

  const app = document.getElementById('app');
  const modal = document.getElementById('modal');
  let currentView = 'dashboard';
  let clientFilter = { q: '', stage: '' };

  // ---------- כלים ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
  const money = n => (Number(n) || 0).toLocaleString('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 });
  const pct = n => (Number(n) || 0).toFixed(1) + '%';
  const date = iso => iso ? new Date(iso).toLocaleDateString('he-IL') : '';
  const dateTime = iso => iso ? new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '';
  const today = () => new Date().toISOString().slice(0, 10);
  const options = (list, selected) => list.map(o => `<option ${o === selected ? 'selected' : ''}>${esc(o)}</option>`).join('');
  const stageBadge = stage => {
    const cls = stage === 'נחתם' ? 'good' : stage === LOST ? 'bad' : '';
    return `<span class="badge ${cls}">${esc(stage)}</span>`;
  };
  const docsProgress = c => {
    const done = DOCUMENTS.filter(d => c.documents?.[d]).length;
    return Math.round(done / DOCUMENTS.length * 100);
  };

  function openModal(title, bodyHtml, onSave) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    const form = document.getElementById('modal-form');
    form.onsubmit = e => {
      if (e.submitter?.value !== 'save') return;
      const values = Object.fromEntries(new FormData(form).entries());
      if (onSave(values) === false) e.preventDefault();
    };
    modal.showModal();
  }

  // ---------- ניווט ----------
  document.getElementById('nav').addEventListener('click', e => {
    const btn = e.target.closest('button[data-view]');
    if (btn) go(btn.dataset.view);
  });

  function go(view, param) {
    currentView = view;
    document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    const views = { dashboard, clients, client, pipeline, tasks, calculator, settings };
    (views[view] || dashboard)(param);
    window.scrollTo(0, 0);
  }

  // ---------- לוח בקרה ----------
  function dashboard() {
    const cs = Store.clients;
    const active = cs.filter(c => c.stage !== 'נחתם' && c.stage !== LOST);
    const signed = cs.filter(c => c.stage === 'נחתם');
    const volume = active.reduce((s, c) => s + (Number(c.loanAmount) || 0), 0);
    const fees = signed.reduce((s, c) => s + (Number(c.fee) || 0), 0);
    const openTasks = Store.tasks.filter(t => !t.done);
    const overdue = openTasks.filter(t => t.due && t.due < today());
    const upcoming = openTasks
      .slice()
      .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))
      .slice(0, 8);
    const recent = cs.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6);
    const conversion = cs.length ? signed.length / cs.length * 100 : 0;

    app.innerHTML = `
      <div class="grid stats">
        ${stat('לקוחות פעילים', active.length)}
        ${stat('היקף משכנתאות בטיפול', money(volume))}
        ${stat('עסקאות שנחתמו', signed.length)}
        ${stat('הכנסות משכר טרחה', money(fees))}
        ${stat('יחס המרה', pct(conversion))}
        ${stat('משימות באיחור', overdue.length)}
      </div>
      <div class="grid two" style="margin-top:16px">
        <div class="card">
          <h2>משימות קרובות</h2>
          ${upcoming.length ? upcoming.map(taskRow).join('') : '<div class="empty">אין משימות פתוחות</div>'}
        </div>
        <div class="card">
          <h2>התפלגות לפי שלב</h2>
          ${ALL_STAGES.map(s => {
            const n = cs.filter(c => c.stage === s).length;
            const w = cs.length ? n / cs.length * 100 : 0;
            return `<div class="result-row"><span>${esc(s)}</span><span>${n}</span></div>
                    <div class="progress"><div style="width:${w}%;background:var(--primary)"></div></div>`;
          }).join('')}
        </div>
      </div>
      <div class="card">
        <div class="toolbar"><h2 style="margin:0">לקוחות שעודכנו לאחרונה</h2><span class="spacer"></span>
          <button class="primary" id="add-client">+ לקוח חדש</button></div>
        ${clientsTable(recent)}
      </div>`;
    document.getElementById('add-client').onclick = () => editClient();
    bindTaskRows();
    bindClientLinks();
  }

  const stat = (label, value) => `<div class="card stat"><div class="value">${esc(value)}</div><div class="label">${esc(label)}</div></div>`;

  // ---------- לקוחות ----------
  function clientsTable(list) {
    if (!list.length) return '<div class="empty">אין לקוחות להצגה</div>';
    return `<div class="table-wrap"><table>
      <thead><tr><th>שם</th><th>טלפון</th><th>מטרה</th><th>סכום הלוואה</th><th>שלב</th><th>מסמכים</th><th>עודכן</th></tr></thead>
      <tbody>${list.map(c => `
        <tr>
          <td><button class="link" data-client="${c.id}">${esc(c.name)}</button></td>
          <td><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></td>
          <td>${esc(c.purpose)}</td>
          <td>${money(c.loanAmount)}</td>
          <td>${stageBadge(c.stage)}</td>
          <td style="min-width:90px"><div class="progress"><div style="width:${docsProgress(c)}%"></div></div></td>
          <td class="muted">${date(c.updatedAt)}</td>
        </tr>`).join('')}
      </tbody></table></div>`;
  }

  function bindClientLinks() {
    app.querySelectorAll('[data-client]').forEach(b => b.onclick = () => go('client', b.dataset.client));
  }

  function clients() {
    const q = clientFilter.q.trim().toLowerCase();
    const list = Store.clients
      .filter(c => !clientFilter.stage || c.stage === clientFilter.stage)
      .filter(c => !q || [c.name, c.phone, c.email, c.idNumber, c.city].some(v => String(v || '').toLowerCase().includes(q)))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    app.innerHTML = `
      <div class="card">
        <div class="toolbar">
          <input id="q" placeholder="חיפוש לפי שם, טלפון, ת.ז, עיר..." value="${esc(clientFilter.q)}">
          <select id="stage-filter"><option value="">כל השלבים</option>${options(ALL_STAGES, clientFilter.stage)}</select>
          <span class="spacer"></span>
          <button id="export-csv">ייצוא ל-Excel (CSV)</button>
          <button class="primary" id="add-client">+ לקוח חדש</button>
        </div>
        <div class="muted" style="margin-bottom:8px">${list.length} לקוחות</div>
        ${clientsTable(list)}
      </div>`;
    const qInput = document.getElementById('q');
    qInput.oninput = () => {
      clientFilter.q = qInput.value;
      const pos = qInput.selectionStart;
      clients();
      const el = document.getElementById('q');
      el.focus();
      el.setSelectionRange(pos, pos);
    };
    document.getElementById('stage-filter').onchange = e => { clientFilter.stage = e.target.value; clients(); };
    document.getElementById('add-client').onclick = () => editClient();
    document.getElementById('export-csv').onclick = () => exportCSV(list);
    bindClientLinks();
  }

  function editClient(existing) {
    const c = existing || { stage: STAGES[0], purpose: PURPOSES[0], source: SOURCES[0] };
    const field = (name, label, type = 'text', extra = '') =>
      `<label>${label}<input name="${name}" type="${type}" value="${esc(c[name])}" ${extra}></label>`;
    openModal(existing ? 'עריכת לקוח' : 'לקוח חדש', `
      <div class="form-grid">
        ${field('name', 'שם מלא *', 'text', 'required')}
        ${field('phone', 'טלפון *', 'tel', 'required')}
        ${field('email', 'דוא"ל', 'email')}
        ${field('idNumber', 'תעודת זהות')}
        ${field('city', 'עיר')}
        <label>מקור הגעה<select name="source">${options(SOURCES, c.source)}</select></label>
        <label>מטרת המשכנתא<select name="purpose">${options(PURPOSES, c.purpose)}</select></label>
        <label>שלב בתהליך<select name="stage">${options(ALL_STAGES, c.stage)}</select></label>
        ${field('propertyValue', 'שווי הנכס (₪)', 'number', 'min="0"')}
        ${field('loanAmount', 'סכום הלוואה מבוקש (₪)', 'number', 'min="0"')}
        ${field('monthlyIncome', 'הכנסה חודשית נטו (₪)', 'number', 'min="0"')}
        ${field('years', 'תקופה (שנים)', 'number', 'min="1" max="30"')}
        <label>בנק נבחר<select name="bank">${options(BANKS, c.bank)}</select></label>
        ${field('fee', 'שכר טרחה (₪)', 'number', 'min="0"')}
        ${field('nextMeeting', 'פגישה הבאה', 'datetime-local')}
        <label class="full">הערות<textarea name="notes">${esc(c.notes)}</textarea></label>
      </div>`, values => {
      const prevStage = existing?.stage;
      const saved = Store.upsertClient({ ...(existing || {}), ...values });
      if (!existing) Store.addActivity(saved.id, 'הלקוח נוצר במערכת');
      else if (prevStage !== values.stage) Store.addActivity(saved.id, `שלב עודכן: ${prevStage} ← ${values.stage}`);
      go('client', saved.id);
    });
  }

  function client(id) {
    const c = Store.getClient(id);
    if (!c) return clients();
    const ltv = Mortgage.ltv(c.loanAmount, c.propertyValue);
    const maxLtv = Mortgage.maxLtvByPurpose[c.purpose];
    const payment = Mortgage.spitzerPayment(Number(c.loanAmount), 4.8, Number(c.years) || 25);
    const pti = Mortgage.pti(payment, c.monthlyIncome);
    const clientTasks = Store.tasks.filter(t => t.clientId === id);

    app.innerHTML = `
      <div class="card">
        <div class="detail-head">
          <div>
            <button class="link" id="back">→ חזרה לרשימת הלקוחות</button>
            <h2 style="margin:8px 0">${esc(c.name)} ${stageBadge(c.stage)}</h2>
            <div class="muted">נוצר ${date(c.createdAt)} · מקור: ${esc(c.source)}</div>
          </div>
          <div class="toolbar">
            <select id="stage-quick">${options(ALL_STAGES, c.stage)}</select>
            ${c.phone ? `<a href="https://wa.me/${esc(waNumber(c.phone))}" target="_blank" rel="noopener"><button>WhatsApp</button></a>` : ''}
            <button id="edit">עריכה</button>
            <button class="danger" id="delete">מחיקה</button>
          </div>
        </div>
      </div>
      <div class="grid two">
        <div class="card">
          <h3>פרטים</h3>
          <dl class="kv">
            <dt>טלפון</dt><dd><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></dd>
            <dt>דוא"ל</dt><dd>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}</dd>
            <dt>ת.ז</dt><dd>${esc(c.idNumber)}</dd>
            <dt>עיר</dt><dd>${esc(c.city)}</dd>
            <dt>מטרה</dt><dd>${esc(c.purpose)}</dd>
            <dt>שווי נכס</dt><dd>${money(c.propertyValue)}</dd>
            <dt>סכום הלוואה</dt><dd>${money(c.loanAmount)}</dd>
            <dt>הון עצמי</dt><dd>${money((Number(c.propertyValue) || 0) - (Number(c.loanAmount) || 0))}</dd>
            <dt>הכנסה חודשית</dt><dd>${money(c.monthlyIncome)}</dd>
            <dt>בנק</dt><dd>${esc(c.bank)}</dd>
            <dt>שכר טרחה</dt><dd>${money(c.fee)}</dd>
            <dt>פגישה הבאה</dt><dd>${dateTime(c.nextMeeting)}</dd>
          </dl>
          ${c.notes ? `<p style="white-space:pre-wrap">${esc(c.notes)}</p>` : ''}
        </div>
        <div class="card">
          <h3>ניתוח ראשוני</h3>
          <div class="result-row"><span>יחס מימון (LTV)</span>
            <strong>${pct(ltv)} ${maxLtv ? (ltv > maxLtv ? `<span class="badge bad">מעל תקרה ${maxLtv}%</span>` : `<span class="badge good">עד ${maxLtv}%</span>`) : ''}</strong></div>
          <div class="result-row"><span>החזר חודשי משוער (שפיצר, 4.8%)</span><strong>${money(payment)}</strong></div>
          <div class="result-row"><span>יחס החזר מהכנסה</span>
            <strong>${pct(pti)} ${pti > Mortgage.PTI_MAX ? '<span class="badge bad">חריגה</span>' : pti > Mortgage.PTI_RECOMMENDED ? '<span class="badge warn">גבוה</span>' : c.monthlyIncome ? '<span class="badge good">תקין</span>' : ''}</strong></div>
          <p class="muted">החישוב הוא הערכה בלבד. לחישוב מפורט עברו ל<button class="link" id="to-calc">מחשבון</button>.</p>
          <h3>מסמכים (${docsProgress(c)}%)</h3>
          <div class="progress" style="margin-bottom:8px"><div style="width:${docsProgress(c)}%"></div></div>
          <div class="checklist">
            ${DOCUMENTS.map((d, i) => `<label><input type="checkbox" data-doc="${i}" ${c.documents?.[d] ? 'checked' : ''}> ${esc(d)}</label>`).join('')}
          </div>
        </div>
      </div>
      <div class="grid two">
        <div class="card">
          <div class="toolbar"><h3 style="margin:0">משימות</h3><span class="spacer"></span><button class="small primary" id="add-task">+ משימה</button></div>
          ${clientTasks.length ? clientTasks.map(taskRow).join('') : '<div class="empty">אין משימות</div>'}
        </div>
        <div class="card">
          <h3>יומן פעילות</h3>
          <div class="toolbar">
            <input id="note" placeholder="תיעוד שיחה / פגישה / עדכון..." style="flex:1">
            <button class="primary" id="add-note">הוספה</button>
          </div>
          <ul class="timeline">
            ${(c.activity || []).map(a => `<li><time>${dateTime(a.at)}</time>${esc(a.text)}</li>`).join('') || '<li class="muted">אין רישומים</li>'}
          </ul>
        </div>
      </div>`;

    document.getElementById('back').onclick = () => go('clients');
    document.getElementById('edit').onclick = () => editClient(c);
    document.getElementById('to-calc').onclick = () => go('calculator', c);
    document.getElementById('delete').onclick = () => {
      if (confirm(`למחוק את ${c.name}? הפעולה אינה הפיכה.`)) { Store.deleteClient(id); go('clients'); }
    };
    document.getElementById('stage-quick').onchange = e => {
      const prev = c.stage;
      Store.upsertClient({ ...c, stage: e.target.value });
      Store.addActivity(id, `שלב עודכן: ${prev} ← ${e.target.value}`);
      client(id);
    };
    app.querySelectorAll('[data-doc]').forEach(cb => cb.onchange = () => {
      const doc = DOCUMENTS[cb.dataset.doc];
      c.documents = { ...(c.documents || {}), [doc]: cb.checked };
      Store.upsertClient(c);
      if (cb.checked) Store.addActivity(id, `התקבל מסמך: ${doc}`);
      client(id);
    });
    const addNote = () => {
      const input = document.getElementById('note');
      if (!input.value.trim()) return;
      Store.addActivity(id, input.value.trim());
      client(id);
    };
    document.getElementById('add-note').onclick = addNote;
    document.getElementById('note').onkeydown = e => { if (e.key === 'Enter') addNote(); };
    document.getElementById('add-task').onclick = () => editTask({ clientId: id }, () => client(id));
    bindTaskRows(() => client(id));
  }

  // מספר בפורמט בינלאומי עבור WhatsApp (05X... ← 9725X...)
  const waNumber = phone => {
    const digits = String(phone).replace(/\D/g, '');
    return digits.startsWith('0') ? '972' + digits.slice(1) : digits;
  };

  // ---------- לוח תהליכים (Kanban) ----------
  function pipeline() {
    app.innerHTML = `
      <div class="toolbar"><h2 style="margin:0">לוח תהליכים</h2><span class="spacer"></span>
        <span class="muted">גררו כרטיס לשינוי שלב</span>
        <button class="primary" id="add-client">+ לקוח חדש</button></div>
      <div class="pipeline">
        ${STAGES.map(stage => {
          const list = Store.clients.filter(c => c.stage === stage);
          const sum = list.reduce((s, c) => s + (Number(c.loanAmount) || 0), 0);
          return `<div class="column" data-stage="${esc(stage)}">
            <h3><span>${esc(stage)}</span><span class="badge">${list.length}</span></h3>
            <div class="muted" style="font-size:.8rem;margin-bottom:8px">${money(sum)}</div>
            ${list.map(c => `
              <div class="deal" draggable="true" data-id="${c.id}">
                <strong>${esc(c.name)}</strong>
                <div class="muted">${esc(c.purpose)} · ${money(c.loanAmount)}</div>
                ${c.bank ? `<div class="muted">${esc(c.bank)}</div>` : ''}
              </div>`).join('')}
          </div>`;
        }).join('')}
      </div>`;

    document.getElementById('add-client').onclick = () => editClient();
    app.querySelectorAll('.deal').forEach(d => {
      d.ondragstart = e => e.dataTransfer.setData('text/plain', d.dataset.id);
      d.onclick = () => go('client', d.dataset.id);
    });
    app.querySelectorAll('.column').forEach(col => {
      col.ondragover = e => { e.preventDefault(); col.classList.add('drag-over'); };
      col.ondragleave = () => col.classList.remove('drag-over');
      col.ondrop = e => {
        e.preventDefault();
        const c = Store.getClient(e.dataTransfer.getData('text/plain'));
        const stage = col.dataset.stage;
        if (c && c.stage !== stage) {
          const prev = c.stage;
          Store.upsertClient({ ...c, stage });
          Store.addActivity(c.id, `שלב עודכן: ${prev} ← ${stage}`);
        }
        pipeline();
      };
    });
  }

  // ---------- משימות ----------
  function taskRow(t) {
    const c = t.clientId && Store.getClient(t.clientId);
    const overdue = !t.done && t.due && t.due < today();
    return `<div class="task ${t.done ? 'done' : ''}">
      <input type="checkbox" data-toggle="${t.id}" ${t.done ? 'checked' : ''}>
      <span class="title">${esc(t.title)} ${c ? `<button class="link small" data-client="${c.id}">${esc(c.name)}</button>` : ''}</span>
      ${t.due ? `<span class="badge ${overdue ? 'bad' : ''}">${date(t.due)}</span>` : ''}
      <button class="small" data-del-task="${t.id}" title="מחיקה">✕</button>
    </div>`;
  }

  function bindTaskRows(refresh = () => go(currentView)) {
    app.querySelectorAll('[data-toggle]').forEach(cb => cb.onchange = () => { Store.toggleTask(cb.dataset.toggle); refresh(); });
    app.querySelectorAll('[data-del-task]').forEach(b => b.onclick = () => {
      if (confirm('למחוק את המשימה?')) { Store.deleteTask(b.dataset.delTask); refresh(); }
    });
    bindClientLinks();
  }

  function editTask(task = {}, after = () => tasks()) {
    const clientOpts = Store.clients
      .map(c => `<option value="${c.id}" ${c.id === task.clientId ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    openModal('משימה חדשה', `
      <div class="form-grid">
        <label class="full">תיאור *<input name="title" required value="${esc(task.title)}"></label>
        <label>תאריך יעד<input name="due" type="date" value="${esc(task.due || today())}"></label>
        <label>לקוח<select name="clientId"><option value="">ללא</option>${clientOpts}</select></label>
      </div>`, values => {
      Store.upsertTask({ ...task, ...values });
      after();
    });
  }

  function tasks() {
    const open = Store.tasks.filter(t => !t.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    const done = Store.tasks.filter(t => t.done);
    app.innerHTML = `
      <div class="card">
        <div class="toolbar"><h2 style="margin:0">משימות פתוחות (${open.length})</h2><span class="spacer"></span>
          <button class="primary" id="add-task">+ משימה חדשה</button></div>
        ${open.length ? open.map(taskRow).join('') : '<div class="empty">אין משימות פתוחות 🎉</div>'}
      </div>
      <div class="card">
        <h2>הושלמו (${done.length})</h2>
        ${done.length ? done.map(taskRow).join('') : '<div class="empty">—</div>'}
      </div>`;
    document.getElementById('add-task').onclick = () => editTask();
    bindTaskRows(tasks);
  }

  // ---------- מחשבון ----------
  function calculator(c) {
    const v = {
      propertyValue: c?.propertyValue || 2000000,
      loanAmount: c?.loanAmount || 1400000,
      monthlyIncome: c?.monthlyIncome || 25000,
      years: c?.years || 25,
      rate: 4.8,
      purpose: c?.purpose || PURPOSES[0],
    };
    app.innerHTML = `
      <div class="grid two">
        <div class="card">
          <h2>מחשבון משכנתא ${c ? `– ${esc(c.name)}` : ''}</h2>
          <div class="form-grid" id="calc-form">
            <label>שווי הנכס (₪)<input name="propertyValue" type="number" value="${v.propertyValue}"></label>
            <label>סכום הלוואה (₪)<input name="loanAmount" type="number" value="${v.loanAmount}"></label>
            <label>הכנסה חודשית נטו (₪)<input name="monthlyIncome" type="number" value="${v.monthlyIncome}"></label>
            <label>תקופה (שנים)<input name="years" type="number" min="1" max="30" value="${v.years}"></label>
            <label>ריבית שנתית ממוצעת (%)<input name="rate" type="number" step="0.05" value="${v.rate}"></label>
            <label>מטרה<select name="purpose">${options(PURPOSES, v.purpose)}</select></label>
          </div>
        </div>
        <div class="card"><h2>תוצאות</h2><div id="calc-result"></div></div>
      </div>`;
    const form = document.getElementById('calc-form');
    const compute = () => {
      const val = n => Number(form.querySelector(`[name=${n}]`).value) || 0;
      const purpose = form.querySelector('[name=purpose]').value;
      const loan = val('loanAmount'), years = val('years'), rate = val('rate');
      const pay = Mortgage.spitzerPayment(loan, rate, years);
      const first = Mortgage.equalPrincipalFirstPayment(loan, rate, years);
      const total = Mortgage.totalPaid(loan, rate, years);
      const ltv = Mortgage.ltv(loan, val('propertyValue'));
      const maxLtv = Mortgage.maxLtvByPurpose[purpose];
      const pti = Mortgage.pti(pay, val('monthlyIncome'));
      const maxLoanByLtv = val('propertyValue') * maxLtv / 100;
      const row = (k, v) => `<div class="result-row"><span>${k}</span><strong>${v}</strong></div>`;
      document.getElementById('calc-result').innerHTML =
        row('החזר חודשי (שפיצר)', money(pay)) +
        row('החזר ראשון (קרן שווה)', money(first)) +
        row('סך תשלומים (שפיצר)', money(total)) +
        row('סך ריבית', money(total - loan)) +
        row('הון עצמי', money(val('propertyValue') - loan)) +
        row('יחס מימון (LTV)', `${pct(ltv)} ${ltv > maxLtv ? '<span class="badge bad">חריגה</span>' : '<span class="badge good">תקין</span>'}`) +
        row(`תקרת מימון ל${esc(purpose)}`, `${maxLtv}% · ${money(maxLoanByLtv)}`) +
        row('יחס החזר מהכנסה', `${pct(pti)} ${pti > Mortgage.PTI_MAX ? '<span class="badge bad">מעל 50%</span>' : pti > Mortgage.PTI_RECOMMENDED ? '<span class="badge warn">מעל המומלץ</span>' : '<span class="badge good">תקין</span>'}`) +
        '<p class="muted">* הערכה בלבד. התקרות מבוססות על הנחיות בנק ישראל ועשויות להשתנות.</p>';
    };
    form.addEventListener('input', compute);
    compute();
  }

  // ---------- גיבוי והגדרות ----------
  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportCSV(list) {
    const cols = [['name', 'שם'], ['phone', 'טלפון'], ['email', 'דוא"ל'], ['idNumber', 'ת.ז'], ['city', 'עיר'],
      ['source', 'מקור'], ['purpose', 'מטרה'], ['stage', 'שלב'], ['propertyValue', 'שווי נכס'],
      ['loanAmount', 'סכום הלוואה'], ['monthlyIncome', 'הכנסה'], ['bank', 'בנק'], ['fee', 'שכר טרחה']];
    const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.map(c => cell(c[1])).join(','), ...list.map(r => cols.map(c => cell(r[c[0]])).join(','))].join('\r\n');
    download(`clients-${today()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
  }

  function settings() {
    app.innerHTML = `
      <div class="card">
        <h2>גיבוי ושחזור</h2>
        <p class="muted">הנתונים נשמרים בדפדפן במחשב זה בלבד. מומלץ לבצע גיבוי באופן קבוע.</p>
        <div class="toolbar">
          <button class="primary" id="backup">הורדת גיבוי (JSON)</button>
          <label class="field"><span>שחזור מקובץ גיבוי</span><input type="file" id="restore" accept=".json,application/json"></label>
        </div>
      </div>
      <div class="card">
        <h2>נתוני הדגמה</h2>
        <div class="toolbar">
          <button id="demo">טעינת לקוחות לדוגמה</button>
          <button class="danger" id="reset">מחיקת כל הנתונים</button>
        </div>
      </div>`;
    document.getElementById('backup').onclick = () => download(`wexler-crm-backup-${today()}.json`, Store.exportJSON(), 'application/json');
    document.getElementById('restore').onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      file.text().then(text => {
        try {
          if (!confirm('השחזור יחליף את כל הנתונים הקיימים. להמשיך?')) return;
          Store.importJSON(text);
          alert('הנתונים שוחזרו בהצלחה');
          go('dashboard');
        } catch (err) { alert('שגיאה: ' + err.message); }
      });
    };
    document.getElementById('demo').onclick = () => { loadDemo(); go('dashboard'); };
    document.getElementById('reset').onclick = () => {
      if (confirm('למחוק את כל הנתונים? מומלץ להוריד גיבוי קודם.')) { Store.reset(); go('dashboard'); }
    };
  }

  function loadDemo() {
    const demo = [
      { name: 'יוסף כהן', phone: '050-1234567', city: 'בני ברק', source: 'המלצה', purpose: 'דירה ראשונה', stage: 'איסוף מסמכים', propertyValue: 2200000, loanAmount: 1500000, monthlyIncome: 22000, years: 25 },
      { name: 'משה לוי', phone: '052-7654321', city: 'ירושלים', source: 'גוגל', purpose: 'דירה חלופית', stage: 'הגשה לבנקים', propertyValue: 3100000, loanAmount: 1900000, monthlyIncome: 30000, years: 28, bank: 'מזרחי טפחות' },
      { name: 'אברהם פרידמן', phone: '054-1112233', city: 'מודיעין עילית', source: 'מתווך', purpose: 'מחזור משכנתא', stage: 'אישור עקרוני', propertyValue: 1800000, loanAmount: 900000, monthlyIncome: 18000, years: 20, bank: 'לאומי' },
      { name: 'דוד שטרן', phone: '053-9998877', city: 'אלעד', source: 'פייסבוק', purpose: 'דירה להשקעה', stage: 'ליד חדש', propertyValue: 1500000, loanAmount: 750000, monthlyIncome: 25000, years: 25 },
      { name: 'יעקב רוזן', phone: '050-4445566', city: 'בית שמש', source: 'לקוח חוזר', purpose: 'דירה ראשונה', stage: 'נחתם', propertyValue: 1900000, loanAmount: 1300000, monthlyIncome: 21000, years: 30, bank: 'הפועלים', fee: 8500 },
    ];
    demo.forEach(d => {
      const c = Store.upsertClient(d);
      Store.addActivity(c.id, 'הלקוח נוצר במערכת (נתוני הדגמה)');
    });
    const [first, second] = Store.clients.slice(-5);
    Store.upsertTask({ title: 'לקבל תלושי שכר', due: today(), clientId: first.id });
    Store.upsertTask({ title: 'לבדוק הצעות בנקים', due: today(), clientId: second.id });
  }

  go('dashboard');
})();
