import puppeteer from 'puppeteer';
import { JSDOM } from 'jsdom';
import axios from 'axios';
import fs from 'fs'; // ماژول کار با فایل را اضافه می‌کنیم

// ... (تمام تابع checkPowerOutage مثل قبل است تا این بخش)
async function checkPowerOutage() {
  console.log("شروع فرآیند وب‌گردی...");
  const url = "https://splus.ir/Tozie_Barq_Nikshahar_ir";
  
  let browser;
  try {
    browser = await puppeteer.launch({ /* ... args ... */ });
    const page = await browser.newPage();
    // ... (بقیه کد تا بخش دریافت htmlContent)
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    const htmlContent = await page.content();
    
    // --- بخش دیباگ ---
    // اگر در پیدا کردن پیام‌ها مشکل داشتیم، اسکرین‌شات و HTML را ذخیره می‌کنیم
    const dom = new JSDOM(htmlContent);
    const messagesNodeList = dom.window.document.querySelectorAll('div.channel-message-text');

    if (messagesNodeList.length === 0) {
      console.log("هیچ پستی با سلکتور 'div.channel-message-text' یافت نشد. در حال ذخیره فایل‌های دیباگ...");
      // ایجاد پوشه برای فایل‌های دیباگ
      if (!fs.existsSync('./debug')) {
        fs.mkdirSync('./debug');
      }
      // گرفتن اسکرین‌شات
      await page.screenshot({ path: './debug/screenshot.png', fullPage: true });
      // ذخیره محتوای HTML
      fs.writeFileSync('./debug/page.html', htmlContent);
      console.log("فایل‌های screenshot.png و page.html در پوشه debug ذخیره شدند.");
      return "هیچ پستی در کانال یافت نشد. (فایل‌های دیباگ ایجاد شد)";
    }
    
    // ... (بقیه کد شما بدون هیچ تغییری ادامه پیدا می‌کند)
    const messages = Array.from(messagesNodeList).reverse();
    // ... الی آخر ...
    // ...
    return finalMessage.trim();

  } catch (error) {
    console.error("خطا در فرآیند وب‌گردی:", error);
    return "متاسفانه در دریافت اطلاعات مشکلی پیش آمد. جزئیات خطا در لاگ GitHub Actions ثبت شد.";
  } finally {
    if (browser) await browser.close();
    console.log("فرآیند وب‌گردی تمام شد.");
  }
}

// ... (تابع main بدون تغییر)
async function main() {
    // ...
}
main();
