/* SCORM 1.2 adapter. Standalone mode never pretends to be an LMS connection. */
(function (global) {
  'use strict';
  function findAPI(start) {
    let current = start;
    for (let depth = 0; current && depth < 100; depth++) {
      try {
        if (current.API) return current.API;
        if (current.parent === current) break;
        current = current.parent;
      } catch (_) { break; }
    }
    return null;
  }
  function sessionTime(milliseconds) {
    const hundredths = Math.floor(Math.max(0, milliseconds) / 10);
    return String(Math.floor(hundredths / 360000)).padStart(4, '0') + ':' +
      String(Math.floor(hundredths / 6000) % 60).padStart(2, '0') + ':' +
      String(Math.floor(hundredths / 100) % 60).padStart(2, '0') + '.' +
      String(hundredths % 100).padStart(2, '0');
  }
  const bridge = {
    api: null, connected: false, finished: false, startedAt: Date.now(), error: '',
    initialize() {
      this.api = findAPI(global);
      if (!this.api) {
        try { if (global.opener) this.api = findAPI(global.opener); } catch (_) { /* cross-origin */ }
      }
      if (!this.api) return false;
      try {
        this.connected = String(this.api.LMSInitialize('')) === 'true';
        if (!this.connected) this.error = 'O LMS não iniciou a sessão. O progresso não será registrado.';
        else {
          const status = this.get('cmi.core.lesson_status');
          if (!status || status === 'not attempted') this.set('cmi.core.lesson_status', 'incomplete');
          this.commit();
        }
      } catch (_) { this.error = 'Não foi possível conectar ao LMS.'; }
      return this.connected;
    },
    get(key) {
      if (!this.connected || this.finished) return '';
      try {
        const value = this.api.LMSGetValue(key);
        if (String(this.api.LMSGetLastError()) !== '0') return '';
        return String(value ?? '');
      } catch (_) { this.error = 'Falha ao recuperar os dados do LMS.'; return ''; }
    },
    set(key, value) {
      if (!this.connected || this.finished) return false;
      try {
        if (String(this.api.LMSSetValue(key, String(value))) === 'true') return true;
      } catch (_) { /* reported below */ }
      this.error = 'O LMS não confirmou o registro do progresso. Mantenha a atividade aberta e tente novamente.';
      return false;
    },
    commit() {
      if (!this.connected || this.finished) return false;
      try {
        if (String(this.api.LMSCommit('')) === 'true') return true;
      } catch (_) { /* reported below */ }
      this.error = 'O LMS não confirmou o salvamento. Mantenha a atividade aberta e tente novamente.';
      return false;
    },
    save(data, location, completed) {
      if (!this.connected || this.finished) return false;
      this.error = '';
      const results = [
        this.set('cmi.suspend_data', JSON.stringify(data)),
        this.set('cmi.core.lesson_location', location),
        this.set('cmi.core.exit', completed ? '' : 'suspend'),
        this.set('cmi.core.session_time', sessionTime(Date.now() - this.startedAt)),
        this.set('cmi.core.lesson_status', completed ? 'completed' : 'incomplete')
      ];
      results.push(this.commit());
      return results.every(Boolean);
    },
    finish() {
      if (!this.connected || this.finished) return;
      this.set('cmi.core.session_time', sessionTime(Date.now() - this.startedAt));
      this.commit();
      try {
        if (String(this.api.LMSFinish('')) !== 'true') this.error = 'O LMS não confirmou o encerramento da sessão.';
      } catch (_) { this.error = 'Falha ao encerrar a sessão no LMS.'; }
      this.finished = true;
    }
  };
  global.Scorm = bridge;
})(window);
