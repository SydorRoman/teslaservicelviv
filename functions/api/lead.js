/**
 * POST /api/lead — приймання заявок із форми запису.
 *
 * Cloudflare Pages Function. Файлова маршрутизація: шлях цього файлу
 * і є URL ендпоінта. Жодного сервера піднімати не треба.
 *
 * ── Змінні оточення ──────────────────────────────────────────────
 * Cloudflare Dashboard → Pages → проєкт → Settings → Environment variables.
 * Обовʼязково як SECRET (не як plaintext) — це токен доступу до бота:
 *
 *   TELEGRAM_BOT_TOKEN   Токен від @BotFather
 *   TELEGRAM_CHAT_ID     ID чату/групи, куди падають заявки
 *                        (дізнатись: напишіть боту й відкрийте
 *                         https://api.telegram.org/bot<TOKEN>/getUpdates)
 *
 * Не задано — заявка не губиться: функція залогує її та поверне 200,
 * тільки якщо ALLOW_NO_TRANSPORT=1. Інакше чесно віддасть 500, щоб
 * фронт показав людині запасний канал звʼязку.
 * ─────────────────────────────────────────────────────────────────
 */

/** Ліміти довжини — і захист від абузу, і просто здоровий глузд. */
const LIMITS = {
  name: 80,
  phone: 20,
  model: 40,
  service: 80,
  message: 1500,
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });

/** Зрізає керуючі символи й довжину. Усе, що йде в Telegram, проходить тут. */
function clean(value, max) {
  if (typeof value !== 'string') return '';
  return value
    // C0/C1-контрольні символи, крім \n: переносами рядків користувач
    // цілком легітимно розділяє опис проблеми
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g, ' ')
    .trim()
    .slice(0, max);
}

/** Telegram HTML-parse-mode: екрануємо, інакше «<» у тексті зламає повідомлення. */
const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function onRequestPost({ request, env }) {
  // ── Розбір тіла ──
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Некоректний формат запиту' }, 400);
  }

  // ── Honeypot ──
  // Поле сховане від людей у CSS. Заповнене — це бот. Відповідаємо 200:
  // хай спамер думає, що спрацювало, і не шукає обхід.
  if (clean(body.company, 100)) {
    return json({ ok: true });
  }

  // ── Валідація ──
  // Клієнтська валідація — це UX. Справжня перевірка тільки тут:
  // запит до /api/lead можна надіслати й повз форму.
  const lead = {
    name: clean(body.name, LIMITS.name),
    phone: clean(body.phone, LIMITS.phone),
    model: clean(body.model, LIMITS.model),
    service: clean(body.service, LIMITS.service),
    message: clean(body.message, LIMITS.message),
  };

  if (lead.name.length < 2) {
    return json({ error: 'Вкажіть імʼя' }, 400);
  }
  if (!/^[\d+()\s-]{9,20}$/.test(lead.phone)) {
    return json({ error: 'Вкажіть коректний номер телефону' }, 400);
  }

  // ── Контекст запиту: допомагає відсіювати спам вручну ──
  const meta = {
    ip: request.headers.get('CF-Connecting-IP') || '—',
    country: request.cf?.country || '—',
    city: request.cf?.city || '—',
    at: new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' }),
  };

  const text = [
    '🔴 <b>Нова заявка з сайту</b>',
    '',
    `<b>Імʼя:</b> ${esc(lead.name)}`,
    `<b>Телефон:</b> ${esc(lead.phone)}`,
    lead.model ? `<b>Модель:</b> ${esc(lead.model)}` : '',
    lead.service ? `<b>Послуга:</b> ${esc(lead.service)}` : '',
    lead.message ? `\n<b>Опис:</b>\n${esc(lead.message)}` : '',
    '',
    `<i>${meta.at} · ${esc(meta.city)}, ${esc(meta.country)} · ${esc(meta.ip)}</i>`,
  ]
    .filter(Boolean)
    .join('\n');

  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;

  // ── Транспорт не налаштований ──
  if (!token || !chatId) {
    console.log('[lead] Telegram не налаштовано. Заявка:', JSON.stringify(lead));

    if (env.ALLOW_NO_TRANSPORT === '1') {
      // Явно дозволений режим для локальної розробки
      return json({ ok: true, note: 'dev: transport disabled' });
    }
    // На проді мовчазний «успіх» = втрачені клієнти. Хай фронт покаже
    // людині телефон і Telegram замість вигляду, що все добре.
    return json({ error: 'Канал звʼязку не налаштовано' }, 500);
  }

  // ── Відправка ──
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('[lead] Telegram API:', res.status, detail);
      return json({ error: 'Не вдалося передати заявку' }, 502);
    }

    return json({ ok: true });
  } catch (err) {
    console.error('[lead] fetch:', err);
    return json({ error: 'Не вдалося передати заявку' }, 502);
  }
}
