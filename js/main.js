(function () {
  function $(id) { return document.getElementById(id); }
  function setStatus(message) { $('status').textContent = message; }
  function setUpdateStatus(message) { $('updateStatus').textContent = message; }
  function setText(id, value) { var el = $(id); if (el) { el.textContent = value; } }
  var fs = null;
  var path = null;
  var os = null;
  var https = null;
  var childProcess = null;
  try {
    fs = require('fs');
    path = require('path');
    os = require('os');
    https = require('https');
    childProcess = require('child_process');
  } catch (nodeError) {}

  var GITHUB_REPO = 'blueresonara-Sky/SMTV-Auto-Courtesy';
  var fieldIds = ['mogrtPath', 'textParamName', 'targetTrack', 'scanUpTo', 'minDuration', 'suffix', 'maxCourtesy', 'transitionSeconds'];
  var checkboxIds = ['ignoreV1'];
  var extensionRoot = '';
  var state = {
    currentVersion: 'Loading...',
    latestVersion: 'Not checked',
    latestRelease: null,
    latestAsset: null,
    updaterContext: null,
    checking: false,
    downloading: false,
    running: false
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
      var message = 'CEP host bridge not available. Open this inside Premiere Pro.';
      setStatus(message);
      if (callback) { callback(message); }
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

  function applyRequestHeaders(xhr, headers) {
    if (!headers) { return; }
    for (var key in headers) {
      if (headers.hasOwnProperty(key) && headers[key] !== undefined && headers[key] !== null) {
        xhr.setRequestHeader(key, headers[key]);
      }
    }
  }

  function httpGetJson(url) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      applyRequestHeaders(xhr, {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      });
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

  function httpGetArrayBuffer(url, headers) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'arraybuffer';
      applyRequestHeaders(xhr, headers);
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

  function getAssetDownloadRequest(asset) {
    if (asset && asset.url) {
      return {
        url: asset.url,
        headers: {
          'Accept': 'application/octet-stream',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      };
    }
    return {
      url: asset.browser_download_url,
      headers: null
    };
  }

  function getReleaseNotes(release) {
    var body = release && release.body ? String(release.body) : '';
    var name = release && (release.name || release.tag_name) ? String(release.name || release.tag_name) : '';
    var notes = body.replace(/\r/g, '').trim();
    if (!notes) {
      notes = name ? ('Release: ' + name) : 'No release notes were provided for this update.';
    }
    if (notes.length > 1800) {
      notes = notes.substring(0, 1800).replace(/\s+\S*$/, '') + '\n\n...';
    }
    return notes;
  }

  function setModalOpen(isOpen) {
    var modal = $('updateModal');
    if (modal) {
      if (isOpen) {
        modal.className = 'modal-backdrop is-open';
      } else {
        modal.className = 'modal-backdrop';
      }
    }
  }

  function showUpdateModal(title, message, options) {
    return new Promise(function (resolve) {
      var modal = $('updateModal');
      var titleEl = $('updateModalTitle');
      var bodyEl = $('updateModalBody');
      var okBtn = $('updateModalOkBtn');
      var cancelBtn = $('updateModalCancelBtn');
      if (!modal || !titleEl || !bodyEl || !okBtn || !cancelBtn) {
        if (options && options.confirm) {
          resolve(window.confirm(title + '\n\n' + message));
        } else {
          window.alert(title + '\n\n' + message);
          resolve(true);
        }
        return;
      }

      titleEl.textContent = title;
      bodyEl.textContent = message;
      okBtn.textContent = options && options.okText ? options.okText : 'OK';
      cancelBtn.textContent = options && options.cancelText ? options.cancelText : 'Cancel';
      cancelBtn.style.display = options && options.confirm ? 'inline-block' : 'none';

      function cleanup(result) {
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        modal.removeEventListener('click', onBackdrop);
        setModalOpen(false);
        resolve(result);
      }
      function onOk() { cleanup(true); }
      function onCancel() { cleanup(false); }
      function onBackdrop(event) {
        if (event.target === modal && options && options.confirm) {
          cleanup(false);
        }
      }

      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      modal.addEventListener('click', onBackdrop);
      setModalOpen(true);
    });
  }

  function buildUpdateNotesMessage(prefix) {
    var message = '';
    if (prefix) {
      message += prefix + '\n\n';
    }
    message += 'What is new in ' + state.latestVersion + ':\n\n' + getReleaseNotes(state.latestRelease);
    return message;
  }

  function showUpdateNotes(title) {
    if (!state.latestRelease) { return Promise.resolve(true); }
    return showUpdateModal(title, buildUpdateNotesMessage(''), { okText: 'OK' });
  }

  function canUseNodeUpdater() {
    return !!(fs && path && os && https && childProcess);
  }

  function resolveExtensionRoot() {
    if (!canUseNodeUpdater()) { return ''; }

    try {
      if (window.__adobe_cep__ && typeof window.__adobe_cep__.getSystemPath === 'function') {
        var cepPath = window.__adobe_cep__.getSystemPath('extension');
        if (cepPath && fs.existsSync(cepPath)) {
          return cepPath;
        }
      }
    } catch (e) {}

    try {
      if (typeof window !== 'undefined' && window.location && window.location.pathname) {
        var pathname = decodeURIComponent(window.location.pathname).replace(/^\/([A-Za-z]:\/)/, '$1');
        var htmlPath = pathname.replace(/\//g, path.sep);
        var fromLocation = path.resolve(path.dirname(htmlPath));
        if (fromLocation && fs.existsSync(fromLocation)) {
          return fromLocation;
        }
      }
    } catch (e1) {}

    try {
      if (typeof __dirname !== 'undefined') {
        var fromDirname = path.resolve(__dirname, '..');
        if (fromDirname && fs.existsSync(fromDirname)) {
          return fromDirname;
        }
      }
    } catch (e2) {}

    return '';
  }

  function getTempPath(name) {
    return path.join(os.tmpdir(), 'auto-footage-courtesy-updater', String(name || ''));
  }

  function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  function removeDirRecursive(dirPath) {
    if (!fs.existsSync(dirPath)) { return; }
    if (fs.rmSync) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      return;
    }
    fs.readdirSync(dirPath).forEach(function (entry) {
      var fullPath = path.join(dirPath, entry);
      var stat = fs.lstatSync(fullPath);
      if (stat.isDirectory()) {
        removeDirRecursive(fullPath);
      } else {
        fs.unlinkSync(fullPath);
      }
    });
    fs.rmdirSync(dirPath);
  }

  function removeFileOrDir(targetPath) {
    if (!fs.existsSync(targetPath)) { return; }
    var stat = fs.lstatSync(targetPath);
    if (stat.isDirectory()) {
      removeDirRecursive(targetPath);
    } else {
      fs.unlinkSync(targetPath);
    }
  }

  function copyDirRecursive(srcDir, destDir) {
    ensureDir(destDir);
    fs.readdirSync(srcDir).forEach(function (entry) {
      var srcPath = path.join(srcDir, entry);
      var destPath = path.join(destDir, entry);
      var stat = fs.lstatSync(srcPath);
      if (stat.isDirectory()) {
        copyDirRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    });
  }

  function clearDirectoryContents(dirPath) {
    if (!fs.existsSync(dirPath)) { return; }
    fs.readdirSync(dirPath).forEach(function (entry) {
      removeFileOrDir(path.join(dirPath, entry));
    });
  }

  function downloadFile(url, destPath, callback, redirectCount) {
    var redirects = redirectCount || 0;
    ensureDir(path.dirname(destPath));
    https.get(url, {
      headers: {
        'User-Agent': 'Auto-Footage-Courtesy-Updater',
        'Accept': 'application/octet-stream'
      }
    }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
        res.resume();
        downloadFile(res.headers.location, destPath, callback, redirects + 1);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        callback(new Error('Download failed with status ' + res.statusCode + '.'));
        return;
      }
      var file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', function () {
        file.close(function () { callback(null); });
      });
      file.on('error', function (err) {
        try { file.close(function () {}); } catch (closeError) {}
        callback(err);
      });
    }).on('error', function (err) {
      callback(err);
    });
  }

  function extractZip(zipPath, destDir) {
    removeDirRecursive(destDir);
    ensureDir(destDir);
    if (/^win/i.test(navigator.platform || '')) {
      childProcess.execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Expand-Archive -LiteralPath "' + zipPath.replace(/"/g, '""') + '" -DestinationPath "' + destDir.replace(/"/g, '""') + '" -Force']);
      return;
    }
    childProcess.execFileSync('unzip', ['-oq', zipPath, '-d', destDir]);
  }

  function findExtensionRoot(dirPath, depth) {
    var maxDepth = typeof depth === 'number' ? depth : 4;
    if (!fs.existsSync(dirPath) || maxDepth < 0) { return ''; }
    if (fs.existsSync(path.join(dirPath, 'CSXS', 'manifest.xml'))) {
      return dirPath;
    }
    var entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (var i = 0; i < entries.length; i++) {
      if (!entries[i].isDirectory()) { continue; }
      var nested = findExtensionRoot(path.join(dirPath, entries[i].name), maxDepth - 1);
      if (nested) { return nested; }
    }
    return '';
  }

  function readManifestBundleId(manifestFile) {
    if (!fs.existsSync(manifestFile)) { return ''; }
    var manifestText = fs.readFileSync(manifestFile, 'utf8');
    var match = manifestText.match(/ExtensionBundleId=\"([^\"]+)\"/i);
    return match && match[1] ? String(match[1]) : '';
  }

  function validateExtractedExtension(extractedRoot, extensionRoot) {
    var manifestFile = path.join(extractedRoot, 'CSXS', 'manifest.xml');
    if (!fs.existsSync(manifestFile)) {
      throw new Error('Downloaded update does not contain CSXS/manifest.xml.');
    }
    var expectedBundleId = readManifestBundleId(path.join(extensionRoot, 'CSXS', 'manifest.xml'));
    var actualBundleId = readManifestBundleId(manifestFile);
    if (expectedBundleId && actualBundleId && expectedBundleId !== actualBundleId) {
      throw new Error('Downloaded update is for a different extension bundle.');
    }
  }

  function installExtractedExtension(extractedRoot, extensionRoot) {
    validateExtractedExtension(extractedRoot, extensionRoot);
    clearDirectoryContents(extensionRoot);
    copyDirRecursive(extractedRoot, extensionRoot);
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

  function setRunButtonRunning(isRunning) {
    state.running = !!isRunning;
    var runBtn = $('runBtn');
    if (!runBtn) { return; }
    runBtn.disabled = state.running;
    runBtn.textContent = state.running ? 'Running...' : 'Generate Courtesy Text';
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

  async function downloadAssetWithHost(downloadUrl, targetPath) {
    var result = await evalHostPromise("filenameCourtesyPanel_downloadUpdateAsset('" + esc(downloadUrl) + "','" + esc(targetPath) + "')");
    if (!result || result.indexOf('OK') !== 0) {
      throw new Error(result || 'Download failed.');
    }
  }

  async function downloadUpdate() {
    if (!canUseNodeUpdater()) {
      setUpdateStatus('Local updater runtime is unavailable in this CEP build.');
      refreshUpdateUi();
      return;
    }
    if (state.downloading) { return; }
    if (!state.latestRelease) {
      await checkForUpdates(false);
    }
    if (!state.latestAsset) {
      setUpdateStatus('No downloadable zip asset is available for the latest release.');
      refreshUpdateUi();
      return;
    }
    if (!extensionRoot) {
      extensionRoot = resolveExtensionRoot();
    }
    if (!extensionRoot) {
      setUpdateStatus('The panel could not determine the installed extension folder.');
      refreshUpdateUi();
      return;
    }

    var confirmed = await showUpdateModal(
      'Install Update ' + state.latestVersion,
      buildUpdateNotesMessage('Premiere Pro should be restarted after the update.'),
      { confirm: true, okText: 'Install Update', cancelText: 'Cancel' }
    );
    if (!confirmed) {
      return;
    }

    state.downloading = true;
    refreshUpdateUi();
    setUpdateStatus('Downloading ' + state.latestAsset.name + ' from GitHub...');

    var tempRoot = getTempPath(String(Date.now()));
    var zipPath = path.join(tempRoot, 'update.zip');
    var extractPath = path.join(tempRoot, 'extracted');

    try {
      ensureDir(tempRoot);
    } catch (dirError) {
      state.downloading = false;
      setUpdateStatus('Could not prepare temp update folder: ' + dirError.message);
      refreshUpdateUi();
      return;
    }

    downloadFile(state.latestAsset.browser_download_url, zipPath, function (downloadErr) {
      if (downloadErr) {
        state.downloading = false;
        setUpdateStatus('Update download failed: ' + downloadErr.message);
        refreshUpdateUi();
        return;
      }

      try {
        setUpdateStatus('Extracting update...');
        refreshUpdateUi();
        extractZip(zipPath, extractPath);
        var extractedRoot = findExtensionRoot(extractPath);
        if (!extractedRoot) {
          throw new Error('Could not find the extension root in the downloaded zip.');
        }

        setUpdateStatus('Installing update...');
        refreshUpdateUi();
        installExtractedExtension(extractedRoot, extensionRoot);
        state.currentVersion = state.latestVersion || state.currentVersion;
        state.downloading = false;
        setUpdateStatus('Update installed. Please restart Premiere Pro.');
        showUpdateNotes('Update installed. Please restart Premiere Pro.');
      } catch (installErr) {
        state.downloading = false;
        setUpdateStatus('Update install failed: ' + installErr.message);
      }
      refreshUpdateUi();
    });
  }

  function runPanel() {
    if (state.running) { return; }
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
    setRunButtonRunning(true);
    var script = "filenameCourtesyPanel_run('" + esc(mogrtPath) + "','" + esc(textParamName) + "'," + targetTrack + ',' + scanUpTo + ',' + minDuration + ",'" + esc(suffix) + "'," + maxCourtesy + ',' + transitionSeconds + ',' + (ignoreV1 ? 'true' : 'false') + ')';
    evalHost(script, function (result) {
      setStatus(result || 'Done.');
      setRunButtonRunning(false);
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

