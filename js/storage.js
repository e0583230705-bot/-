// שכבת נתונים: שמירה מקומית בדפדפן (localStorage) עם ייצוא/ייבוא JSON לגיבוי.
const Store = (() => {
  const KEY = 'wexler-crm-v1';

  const empty = () => ({ clients: [], tasks: [], version: 1 });

  let data = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return empty();
      const parsed = JSON.parse(raw);
      return { ...empty(), ...parsed };
    } catch (e) {
      console.error('Failed to load data', e);
      return empty();
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      alert('שמירת הנתונים נכשלה: ' + e.message);
    }
  }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const now = () => new Date().toISOString();

  return {
    uid,
    now,
    get clients() { return data.clients; },
    get tasks() { return data.tasks; },

    getClient(id) { return data.clients.find(c => c.id === id); },

    upsertClient(client) {
      const existing = client.id && this.getClient(client.id);
      if (existing) {
        Object.assign(existing, client, { updatedAt: now() });
      } else {
        client.id = uid();
        client.createdAt = now();
        client.updatedAt = client.createdAt;
        client.activity = client.activity || [];
        client.documents = client.documents || {};
        data.clients.push(client);
      }
      save();
      return existing || client;
    },

    deleteClient(id) {
      data.clients = data.clients.filter(c => c.id !== id);
      data.tasks = data.tasks.filter(t => t.clientId !== id);
      save();
    },

    addActivity(clientId, text) {
      const c = this.getClient(clientId);
      if (!c) return;
      c.activity = c.activity || [];
      c.activity.unshift({ id: uid(), at: now(), text });
      c.updatedAt = now();
      save();
    },

    upsertTask(task) {
      const existing = task.id && data.tasks.find(t => t.id === task.id);
      if (existing) Object.assign(existing, task);
      else data.tasks.push({ ...task, id: uid(), createdAt: now(), done: false });
      save();
    },

    toggleTask(id) {
      const t = data.tasks.find(t => t.id === id);
      if (t) { t.done = !t.done; save(); }
    },

    deleteTask(id) {
      data.tasks = data.tasks.filter(t => t.id !== id);
      save();
    },

    save,

    exportJSON() { return JSON.stringify(data, null, 2); },

    importJSON(text) {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.clients) || !Array.isArray(parsed.tasks)) {
        throw new Error('קובץ גיבוי לא תקין');
      }
      data = { ...empty(), ...parsed };
      save();
    },

    reset() { data = empty(); save(); },
  };
})();
