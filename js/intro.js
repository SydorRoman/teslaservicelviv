/* ═══════════════════════════════════════════════════════════════
   INTRO — логотип видно одразу, заголовок зʼявляється зі скролом,
   короткий пін тримає CTA стабільним і клікабельним

   Логотип і атмосферна імла статичні (видно в першому кадрі — стилі в
   css/intro.css, тут їх не чіпаємо). Заголовок («Tesla Service» /
   «Львів»), підзаголовок і CTA ховаються за замовчуванням і проявляються
   тут через ScrollTrigger.

   Пін — навмисно короткий (PIN_VH_FRACTION екрана), а не 5-екранна
   кінематографічна версія з попередніх ітерацій. Без піна взагалі
   (як було до цього) секція просто йшла в потоці документа поруч із
   «Про нас» — на мобільному один свайп зі своєю інерцією проскакував і
   reveal, і саму секцію одним рухом, тож CTA ніколи не зупинявся в
   стабільному положенні, і по ньому неможливо було влучити пальцем.
   Пін гарантує: поки не проскролено PIN_VH_FRACTION екрана повністю,
   сторінка не йде далі — CTA встигає з'явитись і постояти нерухомо.
   ═══════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const App = window.App || {};

  /** Скільки висот екрана «зʼїдає» пін цілком (reveal + стабільний хвіст). */
  const PIN_VH_FRACTION = 1;

  const introSection = document.getElementById('intro');
  const stage = document.getElementById('intro-stage');
  if (!introSection || !stage) return;

  const header = document.getElementById('header');

  /* ────────────────────────────────────────────────────────────
     Фінальний стан без анімації.
     Викликається при reduce-motion, відсутньому GSAP або збої ассета.
     ──────────────────────────────────────────────────────────── */
  function showFinalState() {
    header?.classList.add('is-visible');
  }

  /* ────────────────────────────────────────────────────────────
     Ініціалізація
     ──────────────────────────────────────────────────────────── */
  function init() {
    // Немає бібліотек або людина просить без руху — CSS-медіа-правило вже
    // показало заголовок/CTA статично, тут лишається підняти хедер.
    if (!window.gsap || !window.ScrollTrigger || App.prefersReducedMotion) {
      showFinalState();
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    const lines = introSection.querySelectorAll('.intro__line');
    const cta = document.getElementById('intro-cta');

    const tl = gsap.timeline();

    /* «Tesla Service» → «Львів» → підзаголовок — один stagger на масив
       .intro__line у DOM-порядку, тож перший рядок помітно випереджає
       другий, а не зʼявляється одночасно з ним. */
    if (lines.length) {
      tl.to(lines, {
        y: '0%',
        opacity: 1,
        duration: 0.6,
        ease: 'power3.out',
        stagger: 0.18,
      }, 0);
    }

    if (cta) {
      gsap.set(cta, { y: 14 });
      tl.to(cta, {
        opacity: 1,
        y: 0,
        duration: 0.4,
        ease: 'power3.out',
      }, 0.55);
    }

    /* Хвіст: порожня пауза ПІСЛЯ того, як усе вже проявилось.
       Без неї reveal закінчувався б рівно тоді, коли пін і так уже
       відпускає сторінку — жодного стабільного вікна для тапу по CTA
       не лишалось б. Із хвостом reveal встигає завершитись десь на 60%
       довжини піна, а решта 40% — CTA просто стоїть на місці. */
    tl.to({}, { duration: 0.7 });

    const st = ScrollTrigger.create({
      trigger: introSection,
      start: 'top top',
      end: () => `+=${window.innerHeight * PIN_VH_FRACTION}`,
      pin: stage,
      pinSpacing: true,
      anticipatePin: 1,
      scrub: 0.3,
      animation: tl,
      invalidateOnRefresh: true,

      /* Під час піна сцена стає position:fixed, а .section нижче —
         position:relative. Серед позиціонованих елементів із z-index:auto
         виграє останній у DOM, тож без z-index:2 на .intro (css/intro.css)
         секція «Про нас» замальовувала б собою запінену сцену. */
      onUpdate: (self) => {
        header?.classList.toggle('is-visible', self.progress > 0.7);
      },
    });

    // На мобільних адресна панель ховається/показується й міняє
    // innerHeight — це НЕ справжній ресайз. Перераховуємо тільки при
    // зміні ширини, інакше пін смикатиметься під пальцем.
    let lastWidth = window.innerWidth;
    window.addEventListener('resize', () => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      ScrollTrigger.refresh();
    }, { passive: true });

    // Якщо сторінку відкрили одразу в середині (напр., по якорю з іншої
    // сторінки) — хедер не має чекати нового скролу, щоб зʼявитись.
    if (window.scrollY > st.end) header?.classList.add('is-visible');
  }

  init();
})();
