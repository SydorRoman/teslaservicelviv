/* ═══════════════════════════════════════════════════════════════
   ANIMATIONS — розкриття секцій по скролу

   Три декларативні хуки в розмітці, жодного кастомного JS на секцію:
     data-reveal          → елемент проявляється цілком
     data-reveal-stagger  → діти проявляються каскадом
     data-reveal-words    → заголовок проявляється послівно
     data-count           → число відраховується до значення

   Стартові стани (opacity:0) стоять у CSS, а не тут: цей скрипт
   виконується після першого кадру, тож інакше контент блимнув би.
   ═══════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const App = window.App || {};

  if (!window.gsap || !window.ScrollTrigger) return;

  /* При reduce-motion нічого не ховаємо й не рухаємо:
     клас no-js повертає всі елементи у видимий стан через CSS. */
  if (App.prefersReducedMotion) {
    document.documentElement.classList.add('no-js');
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  /** Спільні налаштування тригера — секція оживає, коли зайшла в кадр на чверть. */
  const trigger = (el, extra = {}) => ({
    trigger: el,
    start: 'top 82%',
    once: true,
    ...extra,
  });

  /* ══════════════ 1. Прості появи ══════════════ */
  function initReveal() {
    gsap.utils.toArray('[data-reveal]').forEach((el) => {
      gsap.to(el, {
        opacity: 1,
        y: 0,
        duration: 1,
        ease: 'power3.out',
        scrollTrigger: trigger(el),
      });
    });
  }

  /* ══════════════ 2. Каскад ══════════════ */
  function initStagger() {
    gsap.utils.toArray('[data-reveal-stagger]').forEach((group) => {
      const items = group.children;
      if (!items.length) return;

      gsap.to(items, {
        opacity: 1,
        y: 0,
        duration: 0.9,
        ease: 'power3.out',
        // Каскад згасає: перші картки помітно розділені, далі — швидше.
        // Інакше 18 карток послуг розкривались би цілу вічність.
        stagger: { each: 0.07, from: 'start' },
        scrollTrigger: trigger(group),
      });
    });
  }

  /* ══════════════ 3. Послівна поява заголовків ══════════════ */

  /**
   * Розбиває текст на слова, не ламаючи вкладену розмітку (<em> тощо).
   * Власна реалізація замість SplitText — той платний, а нам треба
   * рівно одна дія.
   */
  function splitWords(root) {
    const words = [];

    const walk = (node) => {
      // Копія списку: ми міняємо DOM під час обходу
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const parts = child.textContent.split(/(\s+)/);
          if (!parts.some((p) => p.trim())) return;

          const frag = document.createDocumentFragment();
          parts.forEach((part) => {
            if (!part.trim()) {
              frag.appendChild(document.createTextNode(part));
              return;
            }
            // Зовнішній span маскує, внутрішній — рухається
            const outer = document.createElement('span');
            outer.className = 'word';
            const inner = document.createElement('span');
            inner.className = 'word__in';
            inner.textContent = part;
            outer.appendChild(inner);
            frag.appendChild(outer);
            words.push(inner);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          walk(child);
        }
      });
    };

    walk(root);
    return words;
  }

  function initWords() {
    gsap.utils.toArray('[data-reveal-words]').forEach((el) => {
      const words = splitWords(el);
      if (!words.length) return;

      // Заголовок цілком видимий; ховаються окремі слова
      gsap.set(el, { opacity: 1 });
      gsap.set(words, { yPercent: 110, opacity: 0 });

      gsap.to(words, {
        yPercent: 0,
        opacity: 1,
        duration: 1,
        ease: 'power3.out',
        stagger: 0.03,
        scrollTrigger: trigger(el, { start: 'top 85%' }),
      });
    });
  }

  /* ══════════════ 4. Лічильники ══════════════ */
  function initCounters() {
    gsap.utils.toArray('[data-count]').forEach((el) => {
      const end = parseFloat(el.dataset.count);
      if (Number.isNaN(end)) return;

      const suffix = el.dataset.suffix || '';
      const obj = { v: 0 };

      gsap.to(obj, {
        v: end,
        duration: 2,
        ease: 'power2.out',
        scrollTrigger: trigger(el),
        onUpdate: () => {
          el.textContent = Math.round(obj.v).toLocaleString('uk-UA') + suffix;
        },
      });
    });
  }

  /* ══════════════ 5. Паралакс ══════════════
     Дуже стримано: 6% зсуву. Паралакс, який видно, — це вже атракціон.
     На тачі вимикаємо — там він коштує кадрів більше, ніж дає.
     ────────────────────────────────────────────────────────────── */
  function initParallax() {
    if (window.matchMedia('(hover: none)').matches) return;

    gsap.utils.toArray('.gallery__item img').forEach((img) => {
      gsap.fromTo(img,
        { yPercent: -6 },
        {
          yPercent: 6,
          ease: 'none',
          scrollTrigger: {
            trigger: img.parentElement,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        }
      );
    });

    // Сяйво у фінальному CTA повільно спливає — робить блок «глибшим»
    const ctaGlow = document.querySelector('.cta__glow');
    if (ctaGlow) {
      gsap.fromTo(ctaGlow,
        { yPercent: 12, opacity: 0.5 },
        {
          yPercent: -8,
          opacity: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: '.cta',
            start: 'top bottom',
            end: 'bottom bottom',
            scrub: true,
          },
        }
      );
    }
  }

  /* ══════════════ 6. FAQ ══════════════
     <details> не анімується нативно: браузер миттєво показує вміст.
     Керуємо висотою вручну, лишаючи семантику details/summary.
     ────────────────────────────────────────────────────────────── */
  function initFaq() {
    document.querySelectorAll('.faq__item').forEach((item) => {
      const summary = item.querySelector('summary');
      const panel = item.querySelector('.faq__a');
      if (!summary || !panel) return;

      summary.addEventListener('click', (e) => {
        e.preventDefault();

        if (item.open) {
          gsap.to(panel, {
            height: 0, opacity: 0, duration: 0.35, ease: 'power2.inOut',
            onComplete: () => {
              item.open = false;
              gsap.set(panel, { clearProps: 'all' });
            },
          });
        } else {
          item.open = true;
          gsap.fromTo(panel,
            { height: 0, opacity: 0 },
            {
              height: 'auto', opacity: 1, duration: 0.45, ease: 'power2.out',
              // ScrollTrigger нижче по сторінці мусить дізнатись про нову висоту
              onComplete: () => {
                gsap.set(panel, { clearProps: 'height' });
                ScrollTrigger.refresh();
              },
            }
          );
        }
      });
    });
  }

  /* ══════════════ Старт ══════════════ */
  initReveal();
  initStagger();
  initWords();
  initCounters();
  initParallax();
  initFaq();

  // Картинки, що довантажились ліниво, зсувають сторінку — перерахунок
  window.addEventListener('load', () => ScrollTrigger.refresh());
})();
