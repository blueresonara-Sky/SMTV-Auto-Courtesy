(function () {
  function $(id) { return document.getElementById(id); }
  function setStatus(message) { $('status').textContent = message; }

  var fieldIds = ['mogrtPath', 'textParamName', 'targetTrack', 'scanUpTo', 'minDuration', 'suffix', 'maxCourtesy'];
  var checkboxIds = ['ignoreV1'];

  function saveSettings() {
    try {
      for (var i = 0; i < fieldIds.length; i++) {
        var id = fieldIds[i];
        var el = $(id);
        if (el) {
          localStorage.setItem('filenameCourtesy_' + id, el.value);
        }
      }
      for (var j = 0; j < checkboxIds.length; j++) {
        var checkboxId = checkboxIds[j];
        var checkboxEl = $(checkboxId);
        if (checkboxEl) {
          localStorage.setItem('filenameCourtesy_' + checkboxId, checkboxEl.checked ? '1' : '0');
        }
      }
    } catch (e) {}
  }

  function loadSettings() {
    try {
      for (var i = 0; i < fieldIds.length; i++) {
        var id = fieldIds[i];
        var el = $(id);
        if (el) {
          var saved = localStorage.getItem('filenameCourtesy_' + id);
          if (saved !== null && saved !== undefined) {
            el.value = saved;
          }
        }
      }
      for (var j = 0; j < checkboxIds.length; j++) {
        var checkboxId = checkboxIds[j];
        var checkboxEl = $(checkboxId);
        if (checkboxEl) {
          var savedCheckbox = localStorage.getItem('filenameCourtesy_' + checkboxId);
          checkboxEl.checked = savedCheckbox === '1';
        }
      }
    } catch (e) {}
  }

  function evalHost(script, callback) {
    if (window.__adobe_cep__ && window.__adobe_cep__.evalScript) {
      window.__adobe_cep__.evalScript(script, callback || function () {});
    } else {
      setStatus('CEP host bridge not available. Open this inside Premiere Pro.');
    }
  }

  function esc(str) {
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, ' ').replace(/\n/g, ' ');
  }

  function browseForMogrt() {
    function setPath(p) {
      var el = $('mogrtPath') || $('mogrt');
      if (el && p) {
        el.value = p;
        if (typeof saveSettings === 'function') { saveSettings(); }
        if (typeof setStatus === 'function') { setStatus('Selected MOGRT: ' + p); }
      }
    }

    try {
      if (window.cep && window.cep.fs && window.cep.fs.showOpenDialogEx) {
        var result = window.cep.fs.showOpenDialogEx(false, false, 'Select MOGRT file', '', ['mogrt'], 'Motion Graphics Template (*.mogrt)');
        if (result && (result.err === 0 || result.err === '0') && result.data && result.data.length > 0) {
          setPath(result.data[0]);
          return;
        }
      }
    } catch (e) {}

    try {
      if (window.__adobe_cep__ && window.__adobe_cep__.invokeSync) {
        var raw = window.__adobe_cep__.invokeSync('showOpenDialogEx', false, false, 'Select MOGRT file', '', 'mogrt', 'Motion Graphics Template (*.mogrt)');
        if (raw) {
          try {
            var parsed = JSON.parse(raw);
            if (parsed && parsed.data && parsed.data.length > 0) {
              setPath(parsed.data[0]);
              return;
            }
          } catch (e2) {}
        }
      }
    } catch (e3) {}

    if (typeof setStatus === 'function') {
      setStatus('Browse is not available in this CEP environment. Please paste the MOGRT path.');
    }
  }

  function runPanel() {
    var mogrtPath = $('mogrtPath').value.trim();
    var textParamName = $('textParamName').value.trim() || 'title';
    var targetTrack = parseInt($('targetTrack').value, 10);
    var scanUpTo = parseInt(($('scanUpTo') || {value:'8'}).value, 10);
    var minDuration = parseFloat($('minDuration').value);
    var suffix = $('suffix').value.trim() || 'Thank you.';
    var maxCourtesy = parseFloat($('maxCourtesy').value);
    var ignoreV1 = $('ignoreV1') && $('ignoreV1').checked;

    saveSettings();

    if (!mogrtPath) { setStatus('Please enter a MOGRT path.'); return; }
    if (isNaN(targetTrack) || targetTrack < 1) { setStatus('Target track must be V1 or higher.'); return; }
    if (isNaN(scanUpTo) || scanUpTo < 1) { scanUpTo = 8; }
    if (isNaN(minDuration) || minDuration < 0) { minDuration = 2; }
    if (isNaN(maxCourtesy) || maxCourtesy <= 0) { maxCourtesy = 3; }

    setStatus('Running...');
    var script = "filenameCourtesyPanel_run('" + esc(mogrtPath) + "','" + esc(textParamName) + "'," + targetTrack + ',' + scanUpTo + ',' + minDuration + ",'" + esc(suffix) + "'," + maxCourtesy + ',' + (ignoreV1 ? 'true' : 'false') + ')';
    evalHost(script, function (result) {
      setStatus(result || 'Done.');
    });
  }

  loadSettings();

  var browseBtn = $('browseMogrtBtn') || document.getElementById('browseMogrtBtn');
  if (browseBtn) { browseBtn.addEventListener('click', browseForMogrt); }

  $('runBtn').addEventListener('click', runPanel);

  for (var i = 0; i < fieldIds.length; i++) {
    var el = $(fieldIds[i]);
    if (el) {
      el.addEventListener('change', saveSettings);
      el.addEventListener('input', saveSettings);
    }
  }

  for (var j = 0; j < checkboxIds.length; j++) {
    var checkboxEl = $(checkboxIds[j]);
    if (checkboxEl) {
      checkboxEl.addEventListener('change', saveSettings);
    }
  }
})();
