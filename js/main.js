(function () {
  function $(id) { return document.getElementById(id); }
  function setStatus(message) { $('status').textContent = message; }
  function setUpdateStatus(message) { $('updateStatus').textContent = message; }
  function setText(id, value) { var el = $(id); if (el) { el.textContent = value; } }

  var GITHUB_REPO = 'blueresonara-Sky/SMTV-Auto-Courtesy';
  var fieldIds = ['mogrtPath', 'textParamName', 'targetTrack', 'scanUpTo', 'minDuration', 'suffix', 'maxCourtesy', 'transitionSeconds'];
  var checkboxIds = ['ignoreV1'];
  var state = {
    currentVersion: 'Loading...',
    latestVersion: 'Not checked',
    latestRelease: null,
    latestAsset: null,
    updaterContext: null,
    checking: false,
    downloading: false
  };

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

  function evalHostPromise(script) {
    return new Promise(function (resolve) {
      evalHost(script, function (result) {
        resolve(result);
      });
    });
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

  function normalizeVersion(value) {
    var clean = String(value || '').replace(/^v/i, '').trim();
    return clean.length ? clean : '0.0.0';
  }

  function compareVersions(a, b) {
    var left = normalizeVersion(a).split('.');
    var right = normalizeVersion(b).split('.');
    var max = left.length > right.length ? left.length : right.length;
    for (var i = 0; i < max; i++) {
      var leftPart = parseInt(left[i] || '0', 10);
      var rightPart = parseInt(right[i] || '0', 10);
      if (leftPart > rightPart) { return 1; }
      if (leftPart < rightPart) { return -1; }
    }
    return 0;
  }

  function extractManifestVersion(manifestText) {
    var match = String(manifestText || '').match(/ExtensionBundleVersion="([^"]+)"/i);
    return match && match[1] ? String(match[1]) : '';
  }

  function readLocalManifestVersion() {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', './CSXS/manifest.xml', true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) { return; }
        if (xhr.status >= 200 && xhr.status < 300 || xhr.status === 0) {
          var version = extractManifestVersion(xhr.responseText);
          if (version) {
            resolve(version);
          } else {
            reject(new Error('Manifest version not found.'));
          }
        } else {
          reject(new Error('Could not read local manifest.'));
        }
      };
      xhr.onerror = function () {
        reject(new Error('Could not read local manifest.'));
      };
      xhr.send();
    });
  }

  function httpGetJson(url) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.setRequestHeader('Accept', 'application/vnd.github+json');
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) { return; }
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (parseError) {
            reject(new Error('Could not parse JSON response.'));
          }
        } else {
          reject({ status: xhr.status, message: xhr.responseText || '' });
        }
      };
      xhr.onerror = function () {
        reject(new Error('Network request failed.'));
      };
      xhr.send();
    });
  }

  function httpGetArrayBuffer(url) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'arraybuffer';
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) { return; }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.response);
        } else {
          reject({ status: xhr.status, message: xhr.responseText || '' });
        }
      };
      xhr.onerror = function () {
        reject(new Error('Network request failed.'));
      };
      xhr.send();
    });
  }

  function findZipAsset(release) {
    if (!release || !release.assets || !release.assets.length) { return null; }
    for (var i = 0; i < release.assets.length; i++) {
      var asset = release.assets[i];
      if (asset && asset.name && /\.zip$/i.test(asset.name) && asset.browser_download_url) {
        return asset;
      }
    }
    return null;
  }

  function refreshUpdateUi() {
    setText('currentVersion', state.currentVersion || 'Unknown');
    setText('latestVersion', state.latestVersion || 'Unknown');

    var downloadBtn = $('downloadUpdateBtn');
    if (downloadBtn) {
      var hasUpdate = state.latestAsset && compareVersions(state.latestVersion, state.currentVersion) > 0;
      downloadBtn.disabled = !hasUpdate || state.downloading;
      downloadBtn.style.display = hasUpdate || state.downloading ? 'block' : 'none';
      if (state.downloading) {
        downloadBtn.textContent = 'Downloading...';
      } else if (hasUpdate) {
        downloadBtn.textContent = 'Download Update ' + state.latestVersion;
      } else {
        downloadBtn.textContent = 'Download Update';
      }
    }
  }

  async function loadUpdaterContext() {
    var raw = await evalHostPromise('filenameCourtesyPanel_getUpdaterContext()');
    if (!raw || /^EvalScript error/i.test(raw) || /^FAIL:/i.test(raw)) {
      try {
        state.currentVersion = await readLocalManifestVersion();
      } catch (e) {
        state.currentVersion = 'Unknown';
      }
      refreshUpdateUi();
      if (state.currentVersion === 'Unknown') {
        setUpdateStatus('Version check failed');
      }
      return;
    }

    try {
      var parsed = JSON.parse(raw);
      state.updaterContext = parsed;
      state.currentVersion = parsed.currentVersion || 'Unknown';
      if (state.currentVersion === 'Unknown') {
        try {
          state.currentVersion = await readLocalManifestVersion();
        } catch (e2) {}
      }
      refreshUpdateUi();
    } catch (e) {
      try {
        state.currentVersion = await readLocalManifestVersion();
      } catch (e3) {
        state.currentVersion = 'Unknown';
      }
      refreshUpdateUi();
      if (state.currentVersion === 'Unknown') {
        setUpdateStatus('Version check failed');
      }
    }
  }

  async function checkForUpdates(isAutomatic) {
    if (state.checking) { return; }

    saveSettings();

    state.checking = true;
    state.latestRelease = null;
    state.latestAsset = null;
    state.latestVersion = 'Checking...';
    refreshUpdateUi();
    setUpdateStatus('Checking...');

    try {
      var release;
      try {
        release = await httpGetJson('https://api.github.com/repos/' + encodeURIComponent(GITHUB_REPO).replace('%2F', '/') + '/releases/latest');
      } catch (requestError) {
        if (requestError && requestError.status === 404) {
          throw new Error('GitHub repo or latest release was not found.');
        }
        if (requestError && requestError.status) {
          throw new Error('GitHub returned ' + requestError.status + '.');
        }
        throw requestError;
      }
      var latestVersion = normalizeVersion(release.tag_name || release.name || '0.0.0');
      var asset = findZipAsset(release);

      state.latestRelease = release;
      state.latestAsset = asset;
      state.latestVersion = latestVersion;
      refreshUpdateUi();

      var comparison = compareVersions(latestVersion, state.currentVersion);
      if (comparison <= 0) {
        setUpdateStatus('Up to date');
      } else if (!asset) {
        setUpdateStatus('Update found');
      } else {
        setUpdateStatus('Update available');
      }
    } catch (error) {
      state.latestRelease = null;
      state.latestAsset = null;
      state.latestVersion = 'Check failed';
      refreshUpdateUi();
      setUpdateStatus('Update check failed');
    } finally {
      state.checking = false;
      refreshUpdateUi();
    }
  }

  function arrayBufferToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var chunkSize = 0x8000;
    var binary = '';
    for (var i = 0; i < bytes.length; i += chunkSize) {
      var subArray = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, subArray);
    }
    return btoa(binary);
  }

  async function writeBase64FileWithHost(targetPath, base64Data) {
    var beginResult = await evalHostPromise("filenameCourtesyPanel_beginUpdateWrite('" + esc(targetPath) + "')");
    if (!beginResult || beginResult.indexOf('OK') !== 0) {
      throw new Error(beginResult || 'Could not start writing the update file.');
    }

    var chunkSize = 50000;
    for (var offset = 0; offset < base64Data.length; offset += chunkSize) {
      var chunk = base64Data.substring(offset, offset + chunkSize);
      var appendResult = await evalHostPromise("filenameCourtesyPanel_appendUpdateChunk('" + esc(targetPath) + "','" + esc(chunk) + "')");
      if (!appendResult || appendResult.indexOf('OK') !== 0) {
        throw new Error(appendResult || 'Could not write an update chunk.');
      }
    }
  }

  async function downloadUpdate() {
    if (state.downloading) { return; }
    if (!state.latestRelease) {
      await checkForUpdates(false);
    }
    if (!state.latestAsset) {
      setUpdateStatus('No downloadable zip asset is available for the latest release.');
      refreshUpdateUi();
      return;
    }
    if (!state.updaterContext || !state.updaterContext.updatesFolder) {
      setUpdateStatus('The panel could not determine a local updates folder.');
      refreshUpdateUi();
      return;
    }

    state.downloading = true;
    refreshUpdateUi();
    setUpdateStatus('Downloading ' + state.latestAsset.name + ' from GitHub...');

    try {
      var buffer;
      try {
        buffer = await httpGetArrayBuffer(state.latestAsset.browser_download_url);
      } catch (downloadError) {
        if (downloadError && downloadError.status) {
          throw new Error('Download failed with status ' + downloadError.status + '.');
        }
        throw downloadError;
      }
      var base64Data = arrayBufferToBase64(buffer);
      var safeName = String(state.latestAsset.name || 'panel-update.zip').replace(/[\\/:*?"<>|]/g, '_');
      var targetPath = state.updaterContext.updatesFolder + '\\' + safeName;

      await writeBase64FileWithHost(targetPath, base64Data);
      setUpdateStatus('Downloaded');
    } catch (error) {
      setUpdateStatus('Download failed');
    } finally {
      state.downloading = false;
      refreshUpdateUi();
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
    var transitionSeconds = parseFloat($('transitionSeconds').value);
    var ignoreV1 = $('ignoreV1') && $('ignoreV1').checked;

    saveSettings();

    if (!mogrtPath) { setStatus('Please enter a MOGRT path.'); return; }
    if (isNaN(targetTrack) || targetTrack < 1) { setStatus('Target track must be V1 or higher.'); return; }
    if (isNaN(scanUpTo) || scanUpTo < 1) { scanUpTo = 8; }
    if (isNaN(minDuration) || minDuration < 0) { minDuration = 2; }
    if (isNaN(maxCourtesy) || maxCourtesy <= 0) { maxCourtesy = 3; }
    if (isNaN(transitionSeconds) || transitionSeconds < 0) { transitionSeconds = 0.3; }

    setStatus('Running...');
    var script = "filenameCourtesyPanel_run('" + esc(mogrtPath) + "','" + esc(textParamName) + "'," + targetTrack + ',' + scanUpTo + ',' + minDuration + ",'" + esc(suffix) + "'," + maxCourtesy + ',' + transitionSeconds + ',' + (ignoreV1 ? 'true' : 'false') + ')';
    evalHost(script, function (result) {
      setStatus(result || 'Done.');
    });
  }

  loadSettings();
  refreshUpdateUi();

  var browseBtn = $('browseMogrtBtn');
  if (browseBtn) { browseBtn.addEventListener('click', browseForMogrt); }

  var runBtn = $('runBtn');
  if (runBtn) { runBtn.addEventListener('click', runPanel); }

  var downloadUpdateBtn = $('downloadUpdateBtn');
  if (downloadUpdateBtn) {
    downloadUpdateBtn.addEventListener('click', downloadUpdate);
  }

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

  loadUpdaterContext().then(function () {
    refreshUpdateUi();
    checkForUpdates(true);
  });
})();

