// Shared by the panel and service worker. Recolor the approved bitmap, preserving its X and alpha.
globalThis.xAppearance = (() => {
  const defaults = Object.freeze({logoColor: '#3d528b', backgroundColor: '#f9f9f9'});
  const logoColors = ['#3d528b', '#24282f', '#187b78', '#77568d', '#bc5864', '#af753a'];
  const backgroundColors = ['#f9f9f9', '#eef3fb', '#f7f2e9', '#edf4ef', '#f4eff8', '#18212b'];
  const color = (value, fallback) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
  const normalize = value => ({
    logoColor: color(value?.logoColor, defaults.logoColor),
    backgroundColor: color(value?.backgroundColor, defaults.backgroundColor)
  });
  const rgb = hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  const mix = (a, b, weight) => '#' + rgb(a).map((channel, index) => Math.round(channel * (1 - weight) + rgb(b)[index] * weight).toString(16).padStart(2, '0')).join('');
  function luminance(hex) {
    const linear = rgb(hex).map(channel => { const v = channel / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
    return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  }
  function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x,y) + .05) / (Math.min(x,y) + .05); }
  function theme(value) {
    const {backgroundColor: background} = normalize(value);
    const dark = luminance(background) < .12;
    const ink = dark ? '#f0f4f8' : '#0f1419';
    const surface = background === defaults.backgroundColor ? '#ffffff' : mix(background, '#ffffff', dark ? .045 : .55);
    let muted = mix(surface, ink, dark ? .68 : .66);
    for (let weight = .70; contrast(surface, muted) < 4.5 && weight <= 1; weight += .025) muted = mix(surface, ink, weight);
    return {
      '--xt-page': background, '--xt-surface': surface, '--xt-ink': ink,
      '--xt-muted': muted,
      '--xt-border': mix(surface, ink, dark ? .17 : .10),
      '--xt-hover': mix(surface, ink, dark ? .08 : .035),
      '--xt-soft': mix(surface, ink, dark ? .055 : .025),
      '--xt-primary': dark ? '#e9eef5' : '#0f1419',
      '--xt-on-primary': dark ? '#17212b' : '#ffffff',
      '--xt-accent': dark ? '#78c4ff' : '#1d9bf0',
      '--xt-accent-soft': dark ? '#263e51' : '#e8f5fd',
      '--xt-tag': dark ? '#46352f' : '#fff5ef',
      '--xt-tag-ink': dark ? '#efbaa2' : '#a65132',
      '--xt-scheme': dark ? 'dark' : 'light'
    };
  }
  let bitmap;
  function loadBitmap() {
    if (!bitmap) bitmap = fetch(chrome.runtime.getURL('icons/logo-512.png'))
      .then(response => { if (!response.ok) throw Error('Logo unavailable'); return response.blob(); })
      .then(blob => createImageBitmap(blob)).catch(error => { bitmap = null; throw error; });
    return bitmap;
  }
  async function renderIcon(value, size = 32) {
    const settings = normalize(value);
    const source = await loadBitmap();
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    ctx.drawImage(source, 0, 0, size, size);
    const image = ctx.getImageData(0, 0, size, size);
    if (settings.logoColor === defaults.logoColor) return image;
    const target = rgb(settings.logoColor);
    const foreground = contrast(settings.logoColor, '#ffffff') >= 3 ? [255,255,255] : [31,42,62];
    for (let i = 0; i < image.data.length; i += 4) {
      if (!image.data[i + 3]) continue;
      const red = image.data[i], blue = image.data[i + 2];
      // The approved white X has equal RGB channels; the blue tile has R ≈ B / 2.
      const white = Math.max(0, Math.min(1, (red - blue * .5) / 127.5));
      const shade = Math.max(.78, Math.min(1.18, blue / 145));
      for (let channel = 0; channel < 3; channel++) image.data[i + channel] = Math.round(Math.min(255, target[channel] * shade) * (1 - white) + foreground[channel] * white);
    }
    return image;
  }
  return {defaults, logoColors, backgroundColors, normalize, theme, renderIcon};
})();
