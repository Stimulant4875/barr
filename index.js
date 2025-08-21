import puppeteer from 'puppeteer';
import { JSDOM } from 'jsdom';
import axios from 'axios';
// ما دیگر نیازی به ماژول fs برای این مرحله نداریم

async function checkPowerOutage() {
  console.log("شروع فرآیند وب‌گردی...");
  const url = "https://splus.ir/Tozie_Barq_Nikshahar_ir";
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process', '--no-zygote']
    });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    const htmlContent = await page.content();
    
    const dom = new JSDOM(htmlContent);
    const messagesNodeList = dom.window.document.querySelectorAll('div.channel-message-text');

    if (messagesNodeList.length === 0) {
      // این بخش احتمالاً دیگر اجرا نخواهد شد، اما آن را نگه می‌داریم
      return "هیچ پستی در کانال یافت نشد.";
    }

    const messages = Array.from(messagesNodeList).reverse();

    // --- بخش جدید دیباگ: چاپ محتوای پیام‌های یافت شده ---
    console.log(`\n✅ ${messages.length} پیام در کانال یافت شد. در حال چاپ محتوای 5 پیام آخر:\n`);
    console.log("----------------------------------------");
    for (let i = 0; i < Math.min(messages.length, 5); i++) {
        const msgText = messages[i].textContent.trim().replace(/\n+/g, ' '); // مرتب‌سازی متن برای نمایش بهتر
        console.log(`پیام ${i + 1}: ${msgText}\n`);
    }
    console.log("----------------------------------------\n");
    // --- پایان بخش دیباگ ---

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

    if (!foundStartOfAnnouncement) {
      // این محتمل‌ترین جایی است که کد ما به آن می‌رسد
      return "پیام‌ها با موفقیت یافت شدند، اما هیچ پست اطلاعیه خاموشی جدیدی در بین آن‌ها پیدا نشد.";
    }

    // ... بقیه کد شما بدون تغییر ادامه پیدا می‌کند ...
    // ...
    // ...
    const lines = latestAnnouncementContent.split('\n').map(line => line.trim()).filter(line => line);
    const targetAreas = [
        { searchKeyword: "خیرآباد", customName: "کهورکان", times: [] },
        { searchKeyword: "زیرک آباد", customName: "زیرک آباد", times: [] },
    ];
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
    if (foundAnyResults) {
      finalMessage += messageBody;
    } else {
      const areaNames = targetAreas.map(a => `"${a.customName}"`).join(' و ');
      finalMessage += `\nبرای مناطق مشخص شده شما (${areaNames})، برنامه‌ای یافت نشد.`;
    }
    return finalMessage.trim();

  } catch (error) {
    console.error("خطا در فرآیند وب‌گردی:", error);
    return "متاسفانه در دریافت اطلاعات مشکلی پیش آمد. جزئیات خطا در لاگ GitHub Actions ثبت شد.";
  } finally {
    if (browser) await browser.close();
    console.log("فرآیند وب‌گردی تمام شد.");
  }
}

// ... تابع main بدون تغییر ...
async function main() {
  const message = await checkPowerOutage();
  console.log("\n✅ --- پیام نهایی آماده شد --- ✅\n");
  console.log(message);
  
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.error("خطا: توکن ربات یا آیدی چت تعریف نشده است!");
    process.exit(1);
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    console.log("\n🚀 در حال ارسال پیام به تلگرام...");
    await axios.post(url, { chat_id: chatId, text: message }, { timeout: 10000 });
    console.log("✅ پیام با موفقیت به تلگرام ارسال شد.");
  } catch (error) {
    console.error("❌ خطا در ارسال پیام به تلگرام:", error.response?.data || error.message);
    process.exit(1);
  }
}

main();
