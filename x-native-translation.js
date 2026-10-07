// Read the bilingual text rendered on the X page, including page translators.
// No React state or private translation endpoints are accessed.
globalThis.xNativeText = (article, expectedOriginal = '') => {
  const own = node => !node.closest('[data-testid="quoteTweet"], [role="link"]') && node.closest('article') === article;
  const clean = node => (node.innerText || node.textContent || '').trim();
  const lang = node => (node.getAttribute('lang') || '').toLowerCase();
  const body = Array.from(article.querySelectorAll('[data-testid="tweetText"]')).filter(own);
  const controls = Array.from(article.querySelectorAll('button, [role="button"]')).filter(own);
  const originalControl = controls.find(node => /^(show original|view original|显示原文|查看原文)$/i.test(clean(node)));
  const translationControl = controls.find(node => /^(translate post|translate tweet|show translation|翻译帖子|翻译推文|显示翻译|查看翻译)$/i.test(clean(node)));
  // Some X layouts give the second body a language attribute without the
  // tweetText test id. Exclude headers, controls, quotes and enclosing blocks.
  const extra = Array.from(article.querySelectorAll('div[lang], p[lang]')).filter(node => own(node) && /^zh(?:-|$)/.test(lang(node)) && !node.closest('[data-testid="User-Name"]') && !node.querySelector('button, [role="button"], time, [data-testid="tweetText"]'));
  // A page translator nests both hidden staging text and visible Chinese FONT
  // blocks inside the English tweetText. Reading innerText mixes both languages.
  const injected = '.immersive-translate-target-wrapper, .immersive-translate-target-translation-block-wrapper, .immersive-translate-target-inner';
  const primary = body[0];
  const injectedNodes = primary ? Array.from(primary.querySelectorAll(injected)) : [];
  const visible = node => {
    for (let current=node; current && current!==primary; current=current.parentElement) {
      if (current.hidden || current.style?.display==='none' || current.style?.visibility==='hidden') return false;
    }
    return typeof node.checkVisibility!=='function' || node.checkVisibility({visibilityProperty:true});
  };
  const translatedBlocks = injectedNodes.filter(node => visible(node) &&
    !injectedNodes.some(parent => parent!==node && parent.contains(node) && visible(parent)));
  const pageTranslation = translatedBlocks.map(clean).filter(text => /\p{Script=Han}/u.test(text)).join('\n\n');
  const originalText = node => {
    if (node!==primary || !injectedNodes.length) return clean(node);
    const copy=node.cloneNode(true);
    copy.querySelectorAll(injected).forEach(translation => translation.remove());
    copy.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    return (copy.textContent || '').trim();
  };
  const candidates = [...new Set([...body, ...extra])].map(node => ({node, text:originalText(node), lang:lang(node)})).filter(item => item.text);
  const chinese = candidates.find(item => /^zh(?:-|$)/.test(item.lang) && /\p{Script=Han}/u.test(item.text) && !/^(译自|翻译自|由.+翻译)/.test(item.text));
  const original = candidates.find(item => item.text === expectedOriginal) || candidates.find(item => !/^zh(?:-|$)/.test(item.lang) && item.node.matches('[data-testid="tweetText"]'));
  // If X replaces rather than appends the body, a Show original control
  // confirms the Chinese body is a translation of the known post.
  let text = original?.text || (chinese && originalControl && expectedOriginal ? expectedOriginal : body[0] ? clean(body[0]) : '');
  if (expectedOriginal && text.replace(/\s+/g,' ').trim()===expectedOriginal.replace(/\s+/g,' ').trim()) text=expectedOriginal;
  const translation = pageTranslation && original ? pageTranslation : chinese && chinese.text !== text && (original || originalControl && expectedOriginal) ? chinese.text : '';
  return {text, translation, translationSource:translation ? 'x' : '', language:original?.lang || body[0]?.getAttribute('lang') || '', originalControl, translationControl};
};
