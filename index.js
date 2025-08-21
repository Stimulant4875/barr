import puppeteer from 'puppeteer';
import { JSDOM } from 'jsdom';
import axios from 'axios';
import fs from 'fs';

async function checkPowerOutage() {
  console.log("شروع فرآیند وب‌گردی...");
  const url = "https://splus.ir/Tozie_Barq_Nikshahar_ir";
  
  let browser;
  let page;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process', '--no-zygote']
    });
    page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    console.log("در حال رفتن به صفحه...");
    await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });
    console.log("صفحه بارگذاری شد. در حال استخراج محتوای HTML...");
    const htmlContent = await page.content();
    
    const dom = new JSDOM(htmlContent);
    const messagesNodeList = dom.window.document.querySelectorAll('div.channel-message-text');

    if (messagesNodeList.length === 0) {
      console.log("هیچ پستی با سلکتور 'div.channel-message-text' یافت نشد. در حال ایجاد فایل‌های دیباگ...");
      // این بخش باید اکنون اجرا شود
      if (!fs.existsSync('./debug')) fs.mkdirSync('./debug');
      await page.screenshot({ path: './debug/screenshot.png', fullPage: true });
      fs.writeFileSync('./debug/page.html', htmlContent);
      console.log("فایل‌های screenshot.png و page.html با موفقیت در پوشه debug ذخیره شدند.");
      return "هیچ پستی در کانال یافت نشد. (فایل‌های دیباگ ایجاد شد)";
    }

    // ... (بقیه کد بدون تغییر) ...
    // ...
    // ...
    return "این بخش نباید اجرا شود اگر سلکتور کار نمی‌کند";

  } catch (error) {
    console.error("خطا در فرآیند وب‌گردی:", error);
    // اگر حتی در حین اجرای Puppeteer هم خطا رخ داد، باز هم اسکرین‌شات بگیر
    if (page) {
        console.log("تلاش برای گرفتن اسکرین‌شات پس از خطا...");
        if (!fs.existsSync('./debug')) fs.mkdirSync('./debug');
        await page.screenshot({ path: './debug/error_screenshot.png', fullPage: true });
        console.log("اسکرین‌شات خطا ذخیره شد.");
    }
    return "متاسفانه در دریافت اطلاعات مشکلی پیش آمد. جزئیات خطا در لاگ ثبت شد.";
  } finally {
    if (browser) await browser.close();
    console.log("فرآیند وب‌گردی تمام شد.");
  }
}

// ... تابع main بدون تغییر ...
async function main() {
    const message = await checkPowerOutage();
    // ...
    await axios.post(url, { chat_id: chatId, text: message });
    // ...
}
main();
