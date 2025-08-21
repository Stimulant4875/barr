import express from 'express';
import puppeteer from 'puppeteer';
import { JSDOM } from 'jsdom';
import TelegramBot from 'node-telegram-bot-api';

// --- تنظیمات اصلی ---
// توکن ربات شما که به صورت مستقیم در کد قرار داده شده
const botToken = "8346440120:AAGQMSu5W8hU8pFkQceXMc3mql3g5DCNqPU";
const app = express();
const PORT = process.env.PORT || 8080;

// این آدرس عمومی برنامه شما پس از استقرار در Fly.io خواهد بود
// بعداً آن را با آدرس واقعی جایگزین خواهیم کرد
const WEBHOOK_URL = process.env.FLY_APP_URL || `https://your-app-name.fly.dev`;

// ربات را در حالت webhook اجرا می‌کنیم
const bot = new TelegramBot(botToken);
bot.setWebHook(`${WEBHOOK_URL}/bot${botToken}`);

app.use(express.json());

// این مسیر برای دریافت پیام‌ها از تلگرام است
app.post(`/bot${botToken}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// --- تابع اصلی وب‌گردی (همان کد قدرتمند قبلی) ---
async function checkPowerOutage() {
  console.log("شروع فرآیند وب‌گردی...");
  const url = "https://splus.ir/Tozie_Barq_Nikshahar_ir";
  const targetAreas = [
    { searchKeyword: "خیرآباد", customName: "کهورکان", times: [] },
    { searchKeyword: "زیرک آباد", customName: "زیرک آباد", times: [] },
  ];

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });
    const htmlContent = await page.content();
    
    const dom = new JSDOM(htmlContent);
    const messagesNodeList = dom.window.document.querySelectorAll('div.channel-message-text');

    if (messagesNodeList.length === 0) return "هیچ پستی در کانال یافت نشد.";
    
    // ... بقیه منطق کد شما برای استخراج اطلاعات ...
    // این بخش بدون تغییر است
    const messages = Array.from(messagesNodeList).reverse();
    let latestAnnouncementContent = "";
    let finalDate = "";
    let foundStartOfAnnouncement = false;
    const startPostRegex = /برنامه خاموشی.*(\d{4}\/\d{2}\/\d{2})/;
    for (const msg of messages) {
        msg.innerHTML = msg.innerHTML.replace(/<br\s*\/?>/gi, '\n');
        const currentText = msg.textContent.trim();
        if (startPostRegex.test(currentText)) {
            finalDate = currentText.match(startPostRegex)[1];
            latestAnnouncementContent = currentText;
            let nextMsgIndex = messages.indexOf(msg) + 1;
            while (nextMsgIndex < messages.length && !startPostRegex.test(messages[nextMsgIndex].textContent.trim())) {
                messages[nextMsgIndex].innerHTML = messages[nextMsgIndex].innerHTML.replace(/<br\s*\/?>/gi, '\n');
                latestAnnouncementContent += "\n\n" + messages[nextMsgIndex].textContent.trim();
                nextMsgIndex++;
            }
            foundStartOfAnnouncement = true;
            break;
        }
    }
    if (!foundStartOfAnnouncement) return "هیچ اطلاعیه برنامه خاموشی جدیدی یافت نشد.";
    const lines = latestAnnouncementContent.split('\n').map(line => line.trim()).filter(line => line);
    lines.forEach((line, i) => {
        targetAreas.forEach(area => {
            if (line.includes(area.searchKeyword)) {
                for (let j = i + 1; j < i + 5 && j < lines.length; j++) {
                    const timeMatch = lines[j].match(/(\d{2}:\d{2}\s*تا\s*\d{2}:\d{2})/);
                    if (timeMatch && timeMatch[1]) {
                        const timeStr = timeMatch[1].trim();
                        if (!area.times.includes(timeStr)) area.times.push(timeStr);
                        break;
                    }
                }
            }
        });
    });
    const newHeader = `💡 گزارش برنامه خاموشی برای تاریخ: ${finalDate} 💡`;
    let messageBody = "";
    let foundAnyResults = false;
    const turnLabels = ["نوبت اول", "نوبت دوم", "نوبت سوم", "نوبت چهارم", "نوبت پنجم"];
    targetAreas.forEach(area => {
        if (area.times.length > 0) {
            foundAnyResults = true;
            messageBody += `\n📍 روستای ${area.customName}:\n`;
            const sortedTimes = area.times.sort();
            sortedTimes.forEach((time, index) => {
                const label = turnLabels[index] || `نوبت ${index + 1}`;
                messageBody += `${label}: از ساعت ${time.replace("تا", "تا ساعت")}\n`;
            });
        }
    });
    let finalMessage = newHeader + "\n";
    if (foundAnyResults) finalMessage += messageBody;
    else {
        const areaNames = targetAreas.map(a => `"${a.customName}"`).join(' و ');
        finalMessage += `\nبرای مناطق مشخص شده شما (${areaNames})، برنامه‌ای یافت نشد.`;
    }
    return finalMessage.trim();
  } catch (error) {
    console.error("خطا در فرآیند وب‌گردی:", error);
    return "متاسفانه در دریافت اطلاعات مشکلی پیش آمد. لطفاً لحظاتی دیگر دوباره تلاش کنید.";
  } finally {
    if (browser) await browser.close();
    console.log("فرآیند وب‌گردی تمام شد.");
  }
}

// --- منطق ربات تلگرام ---
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  console.log(`درخواست /start از چت ${chatId} دریافت شد.`);
  
  // ۱. ارسال پیام اولیه به کاربر
  await bot.sendMessage(chatId, "سلام! لطفاً چند لحظه صبر کنید، در حال بررسی آخرین وضعیت خاموشی برق هستم...");

  try {
    // ۲. اجرای تابع سنگین وب‌گردی
    const resultMessage = await checkPowerOutage();
    
    // ۳. ارسال نتیجه نهایی به کاربر
    await bot.sendMessage(chatId, resultMessage);
  } catch (error) {
    console.error("خطای کلی در ربات:", error);
    await bot.sendMessage(chatId, "یک خطای پیش‌بینی نشده رخ داد. مدیر سرور در حال بررسی است.");
  }
});

// --- راه‌اندازی سرور ---
app.listen(PORT, () => {
  console.log(`🚀 سرور شما روی پورت ${PORT} آماده دریافت پیام از تلگرام است.`);
});
