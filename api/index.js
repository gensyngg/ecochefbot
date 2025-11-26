const TelegramBot = require('node-telegram-bot-api');

// 1. Токен берется из настроек Vercel (Environment Variables)
const token = process.env.TELEGRAM_TOKEN;

// 2. Инициализируем бота
// ВАЖНО: { polling: false } обязательно для Vercel, иначе бот зависнет
const bot = token ? new TelegramBot(token, { polling: false }) : null;

// --- ДАННЫЕ И ТЕКСТЫ ---

const JOKES = [
    "Как у апельсина — новогоднее настроение!",
    "Как у сыра в масле — катаюсь!",
    "Все в шоколаде!",
    "Дела идут, контора пишет, а касса деньги выдает (на еду)."
];

const HELP_TEXT = `Я умею:
🥗 Подбирать рацион питания
📚 Давать полезные советы
📞 Подсказывать контакты
Напишите /start для начала работы.`;

const TIPS_LIST = `Список советов по улучшению питания:

✅ Откажитесь от переработанного мяса (колбасы, сосиски).
✅ Замените газировку на воду с лимоном.
✅ Выбирайте цельнозерновые крупы (гречка, киноа).
✅ Ешьте рыбу 2–3 раза в неделю (источник омега‑3).
✅ Пейте воду за 20 мин до еды.`;

const QUESTIONS = [
    { text: "Как вы оцениваете своё самочувствие в последние 7 дней?", options: ["Отличное", "Хорошее", "Удовлетворительное", "Плохое"] },
    { text: "Есть ли у вас хронические заболевания или особые диетические ограничения?", options: null },
    { text: "Сколько времени в день вы проводите в сидячем положении?", options: ["Менее 4 ч", "4–6 ч", "Более 6 ч"] },
    { text: "Занимаетесь ли вы спортом? Если да, то каким и как часто?", options: ["Нет", "Да, 1–2 раза", "Да, 3–5 раз", "Профессионально"] },
    { text: "Хватает ли вам энергии на весь день?", options: ["Да, хватает", "Иногда не хватает", "Часто чувствую усталость"] },
    { text: "Как вы обычно оцениваете своё настроение?", options: ["Стабильное и позитивное", "Периодически снижается", "Часто подавленное"] },
    { text: "Наедаетесь ли вы средней порцией (250–300 г основного блюда)?", options: ["Да", "Нет, хочется больше", "Нет, достаточно меньше"] },
    { text: "Есть ли продукты, которые вы категорически не едите?", options: null }
];

const PROFILES = {
    "Для поддержки энергии и настроения": "Акцент: сложные углеводы, омега‑3, витамины группы B, магний.\nРекомендации:\n- Добавьте в рацион гречку, бананы, миндаль.\n- Пейте зелёный чай вместо кофе.\n- Ужинайте за 3 часа до сна.\n\nПример меню:\nЗавтрак: овсянка с черникой.\nУжин: лосось на гриле."
};

// Хранилище сессий (в памяти). При перезагрузке сервера Vercel оно очищается.
const sessions = {}; 

// --- ГЛАВНАЯ ФУНКЦИЯ (ENTRY POINT) ---
module.exports = async (request, response) => {
    try {
        // Проверка токена
        if (!token) {
            return response.status(200).send("ERROR: Token not set in Vercel Environment Variables");
        }

        // Если это просто открытие ссылки в браузере (GET запрос)
        if (request.method === 'GET') {
            return response.status(200).send("Bot is running! (Webhook mode)");
        }

        // Обработка входящего обновления от Telegram (POST запрос)
        const body = request.body;
        
        // Лог для отладки в панели Vercel
        console.log("Update received:", JSON.stringify(body));

        if (body) {
            await processUpdate(body);
        }

        response.status(200).send('OK');
    } catch (error) {
        console.error('Error handling update:', error);
        response.status(200).send('Error');
    }
};

// --- ЛОГИКА БОТА ---
async function processUpdate(update) {
    try {
        // 1. ОБРАБОТКА КНОПОК
        if (update.callback_query) {
            const msg = update.callback_query.message;
            const chatId = msg.chat.id;
            const data = update.callback_query.data;
            const queryId = update.callback_query.id;

            // Убираем часики загрузки (важно делать это быстро)
            try {
                await bot.answerCallbackQuery(queryId);
            } catch (e) {
                console.log("Callback expired or error:", e.message);
            }

            await handleSurveyResponse(chatId, data);
            return;
        }

        // 2. ОБРАБОТКА ТЕКСТА
        if (update.message && update.message.text) {
            const chatId = update.message.chat.id;
            const text = update.message.text.trim();

            // Создаем сессию, если нет
            if (!sessions[chatId]) {
                sessions[chatId] = { questionIndex: 0, isInSurvey: false };
            }
            const session = sessions[chatId];

            // Если пользователь в режиме опроса
            if (session.isInSurvey) {
                await handleSurveyFreeText(chatId, text);
                return;
            }

            // Обычное меню
            const lowerText = text.toLowerCase();

            if (lowerText === '/start') {
                await sendMainMenu(chatId, "Приветствую! Я ЭкоШеф-бот. Выберите действие в меню.");
            } 
            else if (['привет', 'хай', 'здравствуйте'].some(w => lowerText.includes(w))) {
                await bot.sendMessage(chatId, "Привет! Готов подобрать рацион?");
            }
            else if (lowerText === 'начать подбор рациона') {
                await startSurvey(chatId);
            }
            else if (lowerText === 'полезные советы') {
                await bot.sendMessage(chatId, TIPS_LIST);
            }
            else if (lowerText === 'о приложении') {
                await bot.sendMessage(chatId, "ЭкоШеф v1.0 (Vercel Edition).");
            }
            else if (lowerText === 'контакты') {
                await bot.sendMessage(chatId, "Связь: @YourDevAccount");
            }
            else if (lowerText.includes('как дела')) {
                const joke = JOKES[Math.floor(Math.random() * JOKES.length)];
                await bot.sendMessage(chatId, joke);
            }
            else {
                // Если команда не распознана
                await bot.sendMessage(chatId, "Я не понимаю. Используйте кнопки меню.");
            }
        }
    } catch (e) {
        console.error("Logic Error:", e);
    }
}

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

async function sendMainMenu(chatId, text) {
    await bot.sendMessage(chatId, text, {
        reply_markup: {
            keyboard: [
                [{ text: "Начать подбор рациона" }, { text: "Полезные советы" }],
                [{ text: "О приложении" }, { text: "Контакты" }]
            ],
            resize_keyboard: true,
            one_time_keyboard: false
        }
    });
}

async function startSurvey(chatId) {
    sessions[chatId].isInSurvey = true;
    sessions[chatId].questionIndex = 0;
    await sendQuestion(chatId, 0);
}

async function sendQuestion(chatId, index) {
    if (index >= QUESTIONS.length) {
        await finishSurvey(chatId);
        return;
    }

    const q = QUESTIONS[index];
    
    // Если есть варианты ответов — шлем кнопки
    if (q.options && q.options.length > 0) {
        // Формируем вертикальные кнопки
        const keyboard = q.options.map(opt => [{ text: opt, callback_data: opt }]);
        await bot.sendMessage(chatId, q.text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } else {
        // Если нет вариантов — ждем текст
        await bot.sendMessage(chatId, `${q.text}\n_(Напишите ответ сообщением)_`);
    }
}

async function handleSurveyResponse(chatId, answer) {
    if (!sessions[chatId] || !sessions[chatId].isInSurvey) return;
    
    // Переходим к следующему вопросу
    sessions[chatId].questionIndex++;
    await sendQuestion(chatId, sessions[chatId].questionIndex);
}

async function handleSurveyFreeText(chatId, text) {
    if (!sessions[chatId]) return;

    const index = sessions[chatId].questionIndex;
    if (index >= QUESTIONS.length) return;

    const currentQ = QUESTIONS[index];

    // Если вопрос требовал кнопку, а юзер написал текст -> ругаемся
    if (currentQ.options && currentQ.options.length > 0) {
        await bot.sendMessage(chatId, "Пожалуйста, нажмите на одну из кнопок выше 👆");
        return;
    }

    // Иначе засчитываем ответ
    sessions[chatId].questionIndex++;
    await sendQuestion(chatId, sessions[chatId].questionIndex);
}

async function finishSurvey(chatId) {
    const title = "Для поддержки энергии и настроения";
    const body = PROFILES[title];
    const msg = `Готово! Ваш профиль: «${title}».\n\n${body}`;

    await bot.sendMessage(chatId, msg);

    // Сброс
    sessions[chatId].isInSurvey = false;
    sessions[chatId].questionIndex = 0;
    await sendMainMenu(chatId, "Что делаем дальше?");
}