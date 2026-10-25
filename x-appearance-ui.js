(() => {
  const api = window.xAppearance;
  const button = document.getElementById('xt-appearance-toggle');
  const dialog = document.getElementById('appearanceDialog');
  const words = {
    en: {title:'Appearance', logo:'Logo color', background:'Panel background', custom:'Custom', reset:'Reset', done:'Done', close:'Close', error:'Couldn’t save. Please try again.', logos:['Indigo','Graphite','Teal','Plum','Rose','Amber'], backgrounds:['White','Mist blue','Ivory','Sage','Lavender','Midnight']},
    zh: {title:'外观', logo:'Logo 颜色', background:'界面背景', custom:'自选颜色', reset:'恢复默认', done:'完成', close:'关闭', error:'保存失败，请重试。', logos:['靛蓝','石墨','青绿','梅紫','玫瑰','琥珀'], backgrounds:['纯白','雾蓝','暖米','鼠尾草','浅紫','夜色']}
  };
  let settings = {...api.defaults}, lang = 'en', generation = 0, editVersion = 0, saving = 0;
  const error = document.getElementById('appearanceError');
  const fields = [
    {key:'logoColor', name:'logo', colors:api.logoColors, names:'logos'},
    {key:'backgroundColor', name:'background', colors:api.backgroundColors, names:'backgrounds'}
  ];
  function translate() {
    const t = words[lang];
    button.title = t.title; button.setAttribute('aria-label', t.title);
    dialog.querySelectorAll('[data-appearance-word]').forEach(node => { node.textContent = t[node.dataset.appearanceWord]; });
    document.getElementById('appearanceClose').setAttribute('aria-label', t.close);
    for (const field of fields) {
      const group = document.getElementById(`appearance-${field.name}-swatches`);
      group.setAttribute('aria-label', t[field.name]);
      [...group.children].forEach((swatch, index) => { swatch.title = t[field.names][index]; swatch.setAttribute('aria-label', t[field.names][index]); });
      document.getElementById(`appearance-${field.name}-custom`).setAttribute('aria-label', `${t[field.name]} · ${t.custom}`);
    }
    if (!error.hidden) error.textContent = t.error;
  }
  function paint() {
    for (const [property, value] of Object.entries(api.theme(settings))) document.documentElement.style.setProperty(property, value);
    for (const field of fields) {
      document.getElementById(`appearance-${field.name}-custom`).value = settings[field.key];
      document.getElementById(`appearance-${field.name}-value`).textContent = settings[field.key].toUpperCase();
      for (const swatch of document.getElementById(`appearance-${field.name}-swatches`).children) swatch.setAttribute('aria-pressed', String(swatch.dataset.color === settings[field.key]));
    }
    const token = ++generation;
    if (settings.logoColor === api.defaults.logoColor) { showLogo('icons/logo-128.png'); return; }
    api.renderIcon(settings, 128).then(image => {
      if (token !== generation) return;
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
      canvas.getContext('2d').putImageData(image, 0, 0);
      showLogo(canvas.toDataURL('image/png'));
    }).catch(() => { if (token === generation) { error.textContent = words[lang].error; error.hidden = false; } });
  }
  function showLogo(url) {
    for (const image of document.querySelectorAll('[data-appearance-logo]')) image.src = url;
    document.querySelector('link[rel="icon"]').href = url;
  }
  async function choose(next) {
    const version = ++editVersion;
    settings = api.normalize(next); error.hidden = true; paint(); saving++;
    try { await chrome.storage.local.set({appearance: settings}); }
    catch (_) { if (version === editVersion) { error.textContent = words[lang].error; error.hidden = false; } }
    finally { saving--; }
  }
  for (const field of fields) {
    const group = document.getElementById(`appearance-${field.name}-swatches`);
    for (const color of field.colors) {
      const swatch = document.createElement('button'); swatch.type = 'button'; swatch.className = 'appearance-swatch';
      swatch.dataset.color = color; swatch.style.setProperty('--swatch', color);
      swatch.addEventListener('click', () => choose({...settings, [field.key]: color})); group.append(swatch);
    }
    document.getElementById(`appearance-${field.name}-custom`).addEventListener('input', event => choose({...settings, [field.key]: event.target.value}));
  }
  button.addEventListener('click', () => { translate(); dialog.showModal(); });
  for (const id of ['appearanceClose','appearanceDone']) document.getElementById(id).addEventListener('click', () => dialog.close());
  document.getElementById('appearanceReset').addEventListener('click', () => choose(api.defaults));
  dialog.addEventListener('close', () => button.focus());
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.lang) { lang = changes.lang.newValue === 'zh' ? 'zh' : 'en'; translate(); }
    if (changes.appearance && !saving) { settings = api.normalize(changes.appearance.newValue); paint(); }
  });
  const initialVersion = editVersion;
  chrome.storage.local.get(['appearance','lang']).then(result => {
    lang = result.lang === 'zh' ? 'zh' : 'en';
    if (editVersion === initialVersion) { settings = api.normalize(result.appearance); paint(); }
    translate();
  }).catch(() => { translate(); paint(); });
})();
