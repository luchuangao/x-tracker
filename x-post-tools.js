// Chrome's built-in Translator API and local PNG export.
window.xPostTools = (() => {
  let translatorPromise;
  const frameStyles = [
    {id: 'mist', name: '浅雾灰', background: '#f3f6f9', paper: '#ffffff', stroke: '#d9e2eb', shadow: 'rgba(33,53,71,.08)', radius: 20},
    {id: 'ivory', name: '奶油纸', background: '#eee8dc', paper: '#fffdf8', stroke: '#d7c9b3', shadow: 'rgba(75,55,24,.08)', radius: 12, double: true},
    {id: 'glacier', name: '冰川蓝', background: '#e5f0fc', backgroundEnd: '#edf7fc', paper: '#ffffff', stroke: '#a6c8eb', shadow: 'rgba(48,102,158,.10)', radius: 24},
    {id: 'bamboo', name: '青竹绿', background: '#e9f1eb', paper: '#ffffff', stroke: '#a9c3b1', shadow: 'rgba(40,75,51,.10)', radius: 20},
    {id: 'midnight', name: '午夜蓝', background: '#18283d', backgroundEnd: '#2a415d', paper: '#ffffff', stroke: '#45617e', shadow: 'rgba(0,0,0,.18)', radius: 20},
    {id: 'plain', name: '纯白原文'}
  ];
  function translator(progress) {
    if (!globalThis.Translator) throw new Error('当前 Chrome 未提供内置翻译接口，请更新桌面版 Chrome 后重试。');
    if (!translatorPromise) {
      // Called directly from the click handler to preserve user activation.
      translatorPromise = Translator.create({ sourceLanguage: 'en', targetLanguage: 'zh', monitor(monitor) {
        monitor.addEventListener('downloadprogress', event => progress(`正在下载翻译语言包 ${Math.round(event.loaded * 100)}%…`));
      } }).catch(error => { translatorPromise = null; throw error; });
    }
    return translatorPromise;
  }
  async function translate(tweet, progress = () => {}) {
    const text = typeof tweet === 'string' ? tweet : tweet?.text;
    if (!text?.trim()) throw new Error('这条推文没有可翻译的正文。');
    const engine = await translator(progress);
    progress('正在翻译…');
    const result = await engine.translate(text);
    if (!result?.trim()) throw new Error('Chrome 未返回译文，请重试。');
    return result;
  }
  function lines(ctx, text, width) {
    const output = [];
    // Preserve paragraphs, handle Chinese and long URLs without clipping.
    for (const paragraph of String(text || '').split('\n')) {
      let line = '';
      const tokens = paragraph.match(/[A-Za-z0-9_’'-]+|\s+|[^\s]/gu) || [];
      for (const token of tokens) {
        if (line && ctx.measureText(line + token).width > width) { output.push(line.trimEnd()); line = ''; }
        if (!line && !token.trim()) continue;
        if (ctx.measureText(token).width <= width) line += token;
        else {
          for (const char of Array.from(token)) {
            if (line && ctx.measureText(line + char).width > width) { output.push(line); line = ''; }
            line += char;
          }
        }
      }
      output.push(line);
    }
    return output;
  }
  async function image(url) {
    if (!url) return null;
    const parsed = new URL(url);
    if (!window.xPostStore?.isLocalUrl(url) && !window.xAvatarCache?.validData(url) && (parsed.protocol !== 'https:' || !['pbs.twimg.com', 'abs.twimg.com'].includes(parsed.hostname))) return null;
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('图片读取失败，请重试。');
    return createImageBitmap(await response.blob());
  }
  async function card(tweet, chinese, fallbackName, options = {}) {
    if (document.fonts?.ready) await document.fonts.ready;
    const localAvatar = await window.xAvatarCache?.resolve(tweet.handle || fallbackName, tweet.avatarSource || tweet.avatar).catch(() => null);
    const avatar = await image(localAvatar || tweet.avatar).catch(() => null);
    const media = [];
    try {
      for (const url of (tweet.media || []).slice(0, 4)) {
        const bitmap = await image(url);
        if (bitmap) media.push(bitmap);
      }
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const style = frameStyles.find(item => item.id === options.style) || frameStyles[0];
      const framed = options.frame !== false && style.id !== 'plain';
      const width = 760, edge = framed ? 24 : 0, pad = 20;
      const avatarSize = 44, left = edge + pad, textX = left + avatarSize + 12;
      const content = width - edge - pad - textX;
      const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif';
      const ink = '#0f1419', muted = '#536471';
      ctx.font = `18px ${font}`;
      const english = tweet.text ? lines(ctx, tweet.text, content) : [];
      const chineseRows = chinese ? lines(ctx, chinese, content) : [];
      ctx.font = `16px ${font}`;
      const quoteRows = tweet.quote?.text ? lines(ctx, tweet.quote.text, content - 28) : [];
      const headerY = edge + pad;
      let y = headerY + 28;
      const englishY = y;
      y += english.length * 26;
      const chineseY = y + (chineseRows.length ? 12 : 0);
      y = chineseY + chineseRows.length * 26;
      const quoteY = y + (tweet.quote ? 14 : 0);
      const quoteHeight = tweet.quote ? 46 + quoteRows.length * 23 : 0;
      y = quoteY + quoteHeight;
      const mediaY = y + (media.length ? 16 : 0);
      const mediaHeight = !media.length ? 0 : media.length === 1 ? Math.min(620, content * media[0].height / media[0].width) : content * .68;
      y = mediaY + mediaHeight;
      const footerY = y + 24;
      const height = Math.ceil(Math.max(footerY + 20, headerY + avatarSize) + pad + edge);
      if (height > 15000) throw new Error('内容过长，无法生成单张卡片。');
      canvas.width = width * 2; canvas.height = height * 2;
      ctx.scale(2, 2); ctx.textBaseline = 'top';
      function roundRect(x, yy, w, h, radius) {
        ctx.beginPath(); ctx.roundRect(x, yy, w, h, radius);
      }
      if (framed) {
        if (style.backgroundEnd) {
          const gradient = ctx.createLinearGradient(0, 0, width, height);
          gradient.addColorStop(0, style.background); gradient.addColorStop(1, style.backgroundEnd);
          ctx.fillStyle = gradient;
        } else ctx.fillStyle = style.background;
        ctx.fillRect(0, 0, width, height);
        ctx.save(); ctx.shadowColor = style.shadow; ctx.shadowBlur = 16; ctx.shadowOffsetY = 4;
        roundRect(edge, edge, width - edge * 2, height - edge * 2, style.radius);
        ctx.fillStyle = style.paper; ctx.fill(); ctx.restore();
        roundRect(edge + .5, edge + .5, width - edge * 2 - 1, height - edge * 2 - 1, style.radius);
        ctx.strokeStyle = style.stroke; ctx.lineWidth = 1; ctx.stroke();
        if (style.double) {
          roundRect(edge + 5, edge + 5, width - edge * 2 - 10, height - edge * 2 - 10, Math.max(4, style.radius - 4));
          ctx.strokeStyle = '#e9dfcf'; ctx.lineWidth = .6; ctx.stroke();
        }
      } else { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); }
      ctx.save(); ctx.beginPath(); ctx.arc(left + avatarSize / 2, headerY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2); ctx.clip();
      if (avatar) ctx.drawImage(avatar, left, headerY, avatarSize, avatarSize);
      else {
        ctx.fillStyle = '#eff3f4'; ctx.fillRect(left, headerY, avatarSize, avatarSize);
        ctx.font = `bold 21px ${font}`; ctx.fillStyle = muted;
        ctx.textAlign = 'center'; ctx.fillText((tweet.name || fallbackName || '').charAt(0).toUpperCase(), left + avatarSize / 2, headerY + 10);
        ctx.textAlign = 'left';
      }
      ctx.restore();
      const name = tweet.name || fallbackName || tweet.handle || '';
      const handle = `@${(tweet.handle || fallbackName || '').replace(/^@/, '')}`;
      const date = new Date(tweet.time);
      const dateText = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
      ctx.font = `17px ${font}`;
      const metadata = `${handle} · ${dateText}`;
      const metadataWidth = ctx.measureText(metadata).width;
      ctx.font = `bold 18px ${font}`;
      const badgeWidth = tweet.verified ? 22 : 0;
      let shortName = name;
      const nameLimit = Math.max(100, content - metadataWidth - badgeWidth - 12);
      while (shortName && ctx.measureText(shortName).width > nameLimit) shortName = shortName.slice(0, -1);
      if (shortName !== name) shortName = shortName.slice(0, -1) + '…';
      ctx.fillStyle = ink; ctx.fillText(shortName, textX, headerY);
      let headerX = textX + ctx.measureText(shortName).width + 6;
      if (tweet.verified) {
        ctx.save(); ctx.translate(headerX, headerY + 1); ctx.scale(.78, .78);
        ctx.fillStyle = '#1d9bf0';
        ctx.fill(new Path2D('M12 1.5l3 1.4 3.3.2 1.8 2.8 2.4 2.2-.3 3.3.3 3.3-2.4 2.2-1.8 2.8-3.3.2-3 1.4-3-1.4-3.3-.2-1.8-2.8-2.4-2.2.3-3.3-.3-3.3 2.4-2.2 1.8-2.8 3.3-.2Z'));
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
        ctx.stroke(new Path2D('M7 12l3 3 7-7')); ctx.restore(); headerX += 22;
      }
      ctx.font = `17px ${font}`; ctx.fillStyle = muted;
      let shortMeta = metadata;
      while (shortMeta && ctx.measureText(shortMeta).width > width - edge - pad - headerX) shortMeta = shortMeta.slice(0, -1);
      ctx.fillText(shortMeta === metadata ? metadata : shortMeta.slice(0, -1) + '…', headerX, headerY + 1);
      ctx.font = `18px ${font}`; ctx.fillStyle = ink;
      english.forEach((row, index) => ctx.fillText(row, textX, englishY + index * 26));
      chineseRows.forEach((row, index) => ctx.fillText(row, textX, chineseY + index * 26));
      if (tweet.quote) {
        roundRect(textX, quoteY, content, quoteHeight, 14); ctx.strokeStyle = '#cfd9de'; ctx.lineWidth = 1; ctx.stroke();
        ctx.font = `bold 15px ${font}`; ctx.fillStyle = ink;
        const quoteName = String(tweet.quote.name || '').split('\n')[0];
        let title = quoteName;
        while (title && ctx.measureText(title).width > content - 28) title = title.slice(0, -1);
        ctx.fillText(title, textX + 14, quoteY + 12);
        ctx.font = `16px ${font}`;
        quoteRows.forEach((row, index) => ctx.fillText(row, textX + 14, quoteY + 36 + index * 23));
      }
      if (media.length) {
        ctx.save(); roundRect(textX, mediaY, content, mediaHeight, 16); ctx.clip();
        ctx.fillStyle = '#f7f9f9'; ctx.fillRect(textX, mediaY, content, mediaHeight);
        function photo(bitmap, x, yy, w, h, fit = false) {
          const scale = fit ? Math.min(w / bitmap.width, h / bitmap.height) : Math.max(w / bitmap.width, h / bitmap.height);
          const dw = bitmap.width * scale, dh = bitmap.height * scale;
          ctx.save(); ctx.beginPath(); ctx.rect(x, yy, w, h); ctx.clip(); ctx.drawImage(bitmap, x + (w - dw) / 2, yy + (h - dh) / 2, dw, dh); ctx.restore();
        }
        if (media.length === 1) photo(media[0], textX, mediaY, content, mediaHeight, true);
        else {
          const half = (content - 2) / 2, row = (mediaHeight - 2) / 2;
          photo(media[0], textX, mediaY, half, media.length === 3 ? mediaHeight : media.length === 2 ? mediaHeight : row);
          photo(media[1], textX + half + 2, mediaY, half, media.length === 2 ? mediaHeight : row);
          if (media[2]) photo(media[2], media.length === 3 ? textX + half + 2 : textX, mediaY + row + 2, half, row);
          if (media[3]) photo(media[3], textX + half + 2, mediaY + row + 2, half, row);
        }
        ctx.restore(); roundRect(textX + .5, mediaY + .5, content - 1, mediaHeight - 1, 16); ctx.strokeStyle = '#cfd9de'; ctx.lineWidth = 1; ctx.stroke();
      }
      const icons = {
        reply: 'M21 11.5a8.5 8.5 0 0 1-8.5 8.5H5l-3 2v-9.5A8.5 8.5 0 0 1 10.5 4h2a8.5 8.5 0 0 1 8.5 7.5Z',
        retweet: 'm3 8 4-4 4 4M7 4v12a3 3 0 0 0 3 3h3m8-3-4 4-4-4m4 4V8a3 3 0 0 0-3-3h-3',
        like: 'M12 21 3.5 12.5a5.3 5.3 0 0 1 7.5-7.5L12 6l1-1a5.3 5.3 0 0 1 7.5 7.5Z',
        views: 'M4 21V11m5 10V3m5 18V8m5 13V5',
        bookmark: 'M6 3h12v18l-6-4-6 4Z',
        share: 'M12 16V2m-5 5 5-5 5 5M4 15v6h16v-6'
      };
      const items = ['reply', 'retweet', 'like'];
      if (tweet.metrics?.views) items.push('views');
      items.push('bookmark', 'share');
      const spacing = (content - 22) / (items.length - 1);
      items.forEach((key, index) => {
        const x = textX + spacing * index;
        ctx.save(); ctx.translate(x, footerY); ctx.scale(.82, .82);
        ctx.strokeStyle = muted; ctx.lineWidth = 1.7; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(new Path2D(icons[key])); ctx.restore();
        if (tweet.metrics?.[key]) { ctx.font = `16px ${font}`; ctx.fillStyle = muted; ctx.fillText(tweet.metrics[key], x + 26, footerY + 1); }
      });
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('卡片图片生成失败。');
      return blob;
    } finally { avatar?.close(); media.forEach(bitmap => bitmap.close()); }
  }
  async function downloadBlob(blob, tweet, fallbackName, style) {
    const url = URL.createObjectURL(blob);
    const filename = `X-Tracker-${(tweet.handle || fallbackName || 'post').replace(/[^A-Za-z0-9_-]/g, '')}-${String(tweet.id).replace(/\D/g, '')}-${style}.png`;
    try { await chrome.downloads.download({ url, filename, saveAs: true }); }
    finally { setTimeout(() => URL.revokeObjectURL(url), 60000); }
  }
  async function save(tweet, chinese, fallbackName, options = {}) {
    const style = options.frame === false ? 'plain' : (frameStyles.find(item => item.id === options.style)?.id || 'mist');
    await downloadBlob(await card(tweet, chinese, fallbackName, options), tweet, fallbackName, style);
  }
  async function preview(tweet, chinese, fallbackName, options = {}) {
    const dialog = document.createElement('dialog');
    dialog.className = 'x-card-preview';
    dialog.setAttribute('aria-label', '卡片预览');
    const header = document.createElement('div'); header.className = 'x-preview-header';
    const title = document.createElement('strong'); title.textContent = '卡片预览';
    const close = document.createElement('button'); close.textContent = '×'; close.className = 'x-icon-button';
    close.setAttribute('aria-label', '关闭预览'); close.title = '关闭';
    const controls = document.createElement('div'); controls.className = 'x-preview-controls';
    const zoom = document.createElement('button'); zoom.className = 'x-icon-button';
    zoom.setAttribute('aria-label', '放大预览'); zoom.setAttribute('aria-pressed', 'false');
    zoom.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6m-3-3v6"/></svg>';
    controls.append(zoom, close); header.append(title, controls);
    const stage = document.createElement('div'); stage.className = 'x-preview-stage';
    const image = document.createElement('img'); image.alt = '即将保存的推文卡片'; stage.append(image);
    const footer = document.createElement('div'); footer.className = 'x-preview-footer';
    const select = document.createElement('select'); select.setAttribute('aria-label', '卡片边框');
    for (const style of frameStyles) {
      const option = document.createElement('option'); option.value = style.id; option.textContent = style.name; select.append(option);
    }
    select.value = frameStyles.some(style => style.id === options.style) ? options.style : 'mist';
    const download = document.createElement('button'); download.className = 'x-preview-download'; download.textContent = '保存 PNG';
    footer.append(select, download);
    const error = document.createElement('div'); error.className = 'x-preview-error'; error.setAttribute('role', 'status');
    dialog.append(header, stage, error, footer); document.body.append(dialog);
    const finished = new Promise(resolve => dialog.addEventListener('close', resolve, {once: true}));
    zoom.addEventListener('click', () => {
      const expanded = stage.classList.toggle('x-preview-zoomed');
      zoom.setAttribute('aria-pressed', String(expanded));
      zoom.setAttribute('aria-label', expanded ? '缩小预览' : '放大预览');
    });
    let generation = 0, currentBlob = null, imageUrl = null, disposed = false;
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) {
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    } });
    async function render() {
      const token = ++generation, style = select.value;
      download.disabled = true; error.textContent = ''; stage.setAttribute('aria-busy', 'true');
      try {
        const blob = await card(tweet, chinese, fallbackName, {style});
        if (disposed || token !== generation) return;
        if (imageUrl) URL.revokeObjectURL(imageUrl);
        currentBlob = blob; imageUrl = URL.createObjectURL(blob); image.src = imageUrl;
        download.disabled = false;
      } catch (failure) { if (!disposed && token === generation) error.textContent = failure.message; }
      finally { if (!disposed && token === generation) stage.setAttribute('aria-busy', 'false'); }
    }
    select.addEventListener('change', () => { options.onStyleChange?.(select.value); render(); });
    download.addEventListener('click', async () => {
      if (!currentBlob || download.disabled) return;
      download.disabled = true; select.disabled = true; error.textContent = '';
      try { await downloadBlob(currentBlob, tweet, fallbackName, select.value); }
      catch (failure) { if (!disposed) error.textContent = failure.message; }
      finally { if (!disposed) { download.disabled = false; select.disabled = false; } }
    });
    try {
      dialog.showModal();
      render();
      await finished;
    } finally {
      disposed = true; generation++;
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      dialog.remove();
    }
  }
  return { translate, card, save, preview, frameStyles };
})();
