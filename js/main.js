/* ═══════════════════════════════════════════════════════════════
   MAIN — плавний скрол, навігація, карта, форма заявки

   Виконується першим із трьох скриптів (усі defer → порядок гарантований).
   Публікує window.App — спільний namespace для intro.js та animations.js.
   ═══════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  /** Користувач просить прибрати рух — читаємо ОДИН раз і поважаємо всюди. */
  const prefersReducedMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Спільний стан для решти модулів. */
  const App = {
    lenis: null,
    prefersReducedMotion,
    /** Викликається з intro.js, коли інтро завершене (або пропущене). */
    onIntroDone: null,
  };
  window.App = App;

  /* ────────────────────────────────────────────────────────────
     Аварійний вихід: якщо GSAP/Lenis не завантажились із CDN,
     сайт мусить лишитись читабельним. Клас no-js повертає всі
     приховані під анімацію елементи у видимий стан.
     ──────────────────────────────────────────────────────────── */
  const libsReady = Boolean(window.gsap && window.ScrollTrigger);
  if (!libsReady) {
    document.documentElement.classList.add('no-js');
    console.warn('[App] GSAP не завантажився — працюємо без анімацій.');
  }

  /* ══════════════ Плавний скрол (Lenis) ══════════════ */
  function initSmoothScroll() {
    // Без Lenis при reduce-motion: інерція — це саме той рух, від якого
    // людині може бути зле. Нативний скрол лишається.
    if (prefersReducedMotion || !window.Lenis) return;

    const lenis = new Lenis({
      duration: 1.15,
      // Експоненційне сповільнення — «важкий», дорогий скрол як на apple.com
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      smoothWheel: true,
      // На тачі лишаємо нативний скрол: емуляція завжди відчувається «гумовою»
      // і ламає overscroll на iOS.
      syncTouch: false,
      touchMultiplier: 1.6,
    });

    App.lenis = lenis;

    if (window.gsap && window.ScrollTrigger) {
      // Lenis рухає скрол поза межами звичайного scroll-івенту,
      // тому ScrollTrigger треба оновлювати вручну.
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }

  /** Єдина точка скролу до якоря — щоб Lenis і нативний шлях не розʼїхались. */
  function scrollToTarget(target, offset = -72) {
    if (App.lenis) {
      App.lenis.scrollTo(target, { offset, duration: 1.4 });
    } else {
      const el = typeof target === 'string' ? document.querySelector(target) : target;
      if (el) {
        const top = el.getBoundingClientRect().top + window.scrollY + offset;
        window.scrollTo({ top, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
      }
    }
  }
  App.scrollToTarget = scrollToTarget;

  /* ══════════════ Якірні посилання ══════════════ */
  function initAnchors() {
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href^="#"]');
      if (!link) return;

      const id = link.getAttribute('href');
      if (!id || id === '#') return;

      const target = document.querySelector(id);
      if (!target) return;

      e.preventDefault();
      closeMenu();
      scrollToTarget(target);
      // Оновлюємо URL без стрибка — щоб посилання лишалось копійованим
      history.replaceState(null, '', id);
    });
  }

  /* ══════════════ Хедер ══════════════ */
  function initHeader() {
    const header = document.getElementById('header');
    if (!header) return;

    // Тло хедера вмикаємо через IntersectionObserver, а не scroll-listener:
    // нуль роботи в головному потоці на кожен кадр скролу.
    const sentinel = document.createElement('div');
    sentinel.style.cssText = 'position:absolute;top:0;height:80px;width:1px;pointer-events:none;';
    document.body.prepend(sentinel);

    new IntersectionObserver(
      ([entry]) => header.classList.toggle('is-scrolled', !entry.isIntersecting),
      { threshold: 0 }
    ).observe(sentinel);
  }

  /* ══════════════ Мобільне меню ══════════════ */
  const burger = document.getElementById('burger');
  const nav = document.getElementById('nav');
  const header = document.getElementById('header');

  function closeMenu() {
    if (!burger || !nav) return;
    burger.setAttribute('aria-expanded', 'false');
    nav.classList.remove('is-open');
    header?.classList.remove('header--menu-open');
    App.lenis?.start();
  }

  function initMenu() {
    if (!burger || !nav) return;

    burger.addEventListener('click', () => {
      const open = burger.getAttribute('aria-expanded') === 'true';
      burger.setAttribute('aria-expanded', String(!open));
      nav.classList.toggle('is-open', !open);
      // .header.is-scrolled має backdrop-filter, а це за специфікацією CSS
      // робить елемент containing block для нащадків із position:fixed —
      // .nav (position:fixed; inset:0) рахував би це відносно 70px-заввишки
      // хедера, а не вьюпорта, і повноекранне меню стискалось би в смужку.
      // Знімаємо backdrop-filter із хедера, поки меню відкрите: сам хедер
      // усе одно схований під непрозорим фоном .nav, тому візуально це
      // непомітно.
      header?.classList.toggle('header--menu-open', !open);
      // Тло не має скролитись під відкритим меню
      open ? App.lenis?.start() : App.lenis?.stop();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });
  }

  /* ══════════════ Карта ══════════════
     Google Maps iframe важить сотні кілобайт і сам по собі забирає
     10-15 балів Lighthouse. Вантажимо його лише коли користувач
     свідомо натиснув «Показати на карті».
     ────────────────────────────────────────────────────────────── */
  function initMap() {
    const btn = document.getElementById('map-load');
    const placeholder = document.getElementById('map-placeholder');
    if (!btn || !placeholder) return;

    btn.addEventListener('click', () => {
      const src = placeholder.dataset.mapSrc;
      if (!src || src.includes('PLACEHOLDER')) {
        // Плейсхолдер ще не замінили — не робимо вигляд, що карта є
        console.warn('[Map] data-map-src ще не налаштовано.');
        return;
      }
      const iframe = document.createElement('iframe');
      iframe.src = src;
      iframe.loading = 'lazy';
      iframe.title = 'Tesla Service Львів на мапі';
      iframe.referrerPolicy = 'no-referrer-when-downgrade';
      iframe.allowFullscreen = true;
      placeholder.replaceWith(iframe);
    });
  }

  /* ══════════════ Форма заявки ══════════════ */
  function initForm() {
    const form = document.getElementById('booking-form');
    if (!form) return;

    const status = document.getElementById('form-status');
    const submit = document.getElementById('form-submit');

    /** Валідація на клієнті — це UX, а не безпека. Сервер перевіряє все заново. */
    const rules = {
      name: (v) => (v.trim().length >= 2 ? '' : 'Вкажіть імʼя'),
      phone: (v) =>
        /^[\d+()\s-]{9,20}$/.test(v.trim()) ? '' : 'Вкажіть коректний номер телефону',
    };

    function validateField(field) {
      const rule = rules[field.name];
      if (!rule) return true;

      const msg = rule(field.value);
      const err = form.querySelector(`[data-err-for="${field.name}"]`);
      if (err) err.textContent = msg;
      field.classList.toggle('is-invalid', Boolean(msg));
      return !msg;
    }

    // Показуємо помилку лише коли людина пішла з поля — не сварити під час набору
    form.querySelectorAll('input[name], textarea[name]').forEach((field) => {
      field.addEventListener('blur', () => validateField(field));
      field.addEventListener('input', () => {
        if (field.classList.contains('is-invalid')) validateField(field);
      });
    });

    function setStatus(text, kind) {
      if (!status) return;
      status.textContent = text;
      status.className = 'form__status' + (kind ? ` is-${kind}` : '');
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      setStatus('', '');

      const fields = [...form.querySelectorAll('input[name], textarea[name]')];
      const valid = fields.map(validateField).every(Boolean);
      if (!valid) {
        setStatus('Перевірте виділені поля.', 'err');
        fields.find((f) => f.classList.contains('is-invalid'))?.focus();
        return;
      }

      const data = Object.fromEntries(new FormData(form).entries());
      submit?.classList.add('is-loading');

      try {
        const res = await fetch('/api/lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        const payload = await res.json().catch(() => ({}));

        if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);

        form.reset();
        setStatus('Дякуємо! Заявку прийнято — передзвонимо протягом робочого дня.', 'ok');
      } catch (err) {
        console.error('[Form]', err);
        // Не залишаємо людину в глухому куті: даємо запасний канал звʼязку
        setStatus(
          'Не вдалося відправити заявку. Зателефонуйте нам або напишіть у Telegram.',
          'err'
        );
      } finally {
        submit?.classList.remove('is-loading');
      }
    });
  }

  /* ══════════════ Стрічка «Наші фото» ══════════════
     Нативний horizontal-scroll + scroll-snap (CSS) — тут лише додаємо
     те, чого CSS сам не вміє: колесо миші (вертикальне за замовчуванням)
     і кнопки-стрілки. */
  function initPhotostrip() {
    const track = document.getElementById('photostrip-track');
    if (!track) return;

    function scrollStep(dir) {
      const item = track.querySelector('.photostrip__item');
      const gap = parseFloat(getComputedStyle(track).columnGap) || 16;
      const step = (item ? item.getBoundingClientRect().width : track.clientWidth * 0.8) + gap;
      track.scrollBy({ left: step * dir, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    }

    document.querySelectorAll('.photostrip__nav').forEach((btn) => {
      btn.addEventListener('click', () => scrollStep(Number(btn.dataset.dir) || 1));
    });

    // Вертикальне колесо миші -> горизонтальний скрол стрічки. На краях
    // (початок/кінець) навмисно НЕ ловимо жест — сторінка мусить
    // скролитись далі, інакше користувач «застрягає» на секції.
    track.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // трекпад і так скролить горизонтально

      const atStart = track.scrollLeft <= 0;
      const atEnd = track.scrollLeft >= track.scrollWidth - track.clientWidth - 1;
      if ((e.deltaY < 0 && atStart) || (e.deltaY > 0 && atEnd)) return;

      e.preventDefault();
      // scrollBy(), а не пряме присвоєння scrollLeft: коректніше узгоджується
      // зі scroll-snap-type під час активного жесту (не «стрибає» назад до
      // найближчої картки на кожен проміжний виклик).
      track.scrollBy({ left: e.deltaY, behavior: 'auto' });
    }, { passive: false });
  }

  /* ══════════════ Дрібниці ══════════════ */
  function initMisc() {
    const year = document.getElementById('year');
    if (year) year.textContent = String(new Date().getFullYear());
  }

  /* ══════════════ Старт ══════════════ */
  initSmoothScroll();
  initAnchors();
  initHeader();
  initMenu();
  initMap();
  initForm();
  initPhotostrip();
  initMisc();
})();
