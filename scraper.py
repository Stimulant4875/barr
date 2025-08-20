# scraper.py (نسخه نهایی بر اساس فرمت دقیق)
import requests
from bs4 import BeautifulSoup
import re
import os

URL = "https://splus.ir/Tozie_Barq_Nikshahar_ir"

TARGET_LOCATIONS = {
    "منطقه خیرآباد": ["خیرآباد", "سد خیرآباد", "هیتک", "داروکان", "زهک", "سبز", "موکی", "تهرک", "کهورکان", "باکور", "کشیگ"],
    "منطقه زیرک آباد": ["زیرک آباد", "رئیس کلگ", "جلایی کلگ", "بازیگر", "آبشکی", "حسین آباد", "نیکو جهان", "پوتاپ", "دینار کلگ"]
}

def send_to_telegram(message):
    """این تابع پیام را به تلگرام ارسال می‌کند"""
    bot_token = os.getenv('TELEGRAM_BOT_TOKEN')
    chat_id = os.getenv('TELEGRAM_CHAT_ID')

    if not bot_token or not chat_id:
        print("خطا: توکن ربات یا شناسه چت در سکرت‌های گیت‌هاب تعریف نشده است.")
        return

    api_url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    
    try:
        max_len = 4096
        if len(message) > max_len:
            parts = [message[i:i+max_len] for i in range(0, len(message), max_len)]
            for part in parts:
                response = requests.post(api_url, json={'chat_id': chat_id, 'text': part, 'parse_mode': 'Markdown'})
                response.raise_for_status()
        else:
             response = requests.post(api_url, json={'chat_id': chat_id, 'text': message, 'parse_mode': 'Markdown'})
             response.raise_for_status()

        print("پیام با موفقیت به تلگرام ارسال شد.")
    except requests.RequestException as e:
        response_text = e.response.text if e.response else "No response"
        print(f"خطا در ارسال پیام به تلگرام: {e} - {response_text}")


def find_outages():
    """این تابع خاموشی‌ها را بر اساس ساختار دقیق مکان و ساعت پیدا می‌کند"""
    try:
        response = requests.get(URL, timeout=20)
        response.raise_for_status()
    except requests.RequestException as e:
        return f"خطا در اتصال به آدرس کانال: {e}"

    soup = BeautifulSoup(response.text, 'html.parser')
    messages = soup.find_all('div', class_='channel-message-text')

    if not messages:
        return "هیچ پیامی در کانال یافت نشد."

    # تمام پیام‌ها را به یک متن واحد تبدیل می‌کنیم تا ساختار حفظ شود
    full_text_content = ""
    for msg in messages:
        for br in msg.find_all("br"):
            br.replace_with("\n")
        full_text_content += msg.get_text(separator='\n').strip() + "\n\n"

    # متن را به خطوط مجزا تقسیم کرده و خطوط خالی را حذف می‌کنیم
    lines = [line.strip() for line in full_text_content.split('\n') if line.strip()]
    
    final_message_parts = ["*آخرین برنامه خاموشی‌های یافت شده برای مناطق شما:*"]
    found_results = {key: [] for key in TARGET_LOCATIONS}
    found_any = False

    # *** منطق جدید و دقیق ***
    # حلقه بر روی خطوط برای پیدا کردن جفت "مکان" و "ساعت"
    for i in range(len(lines) - 1): # تا یکی مانده به آخر می‌رویم تا خط بعدی وجود داشته باشد
        current_line = lines[i]
        next_line = lines[i+1]

        # بررسی می‌کنیم که آیا خط بعدی با فرمت ساعت شروع می‌شود یا نه
        if next_line.startswith('⏰'):
            # حالا که می‌دانیم یک جفت بالقوه داریم، خط فعلی را برای کلمات کلیدی چک می‌کنیم
            for name, keywords in TARGET_LOCATIONS.items():
                if any(keyword in current_line for keyword in keywords):
                    # یک جفت معتبر پیدا شد
                    location_info = current_line
                    time_info = next_line
                    
                    # از ثبت نتایج تکراری جلوگیری می‌کنیم
                    result_tuple = (location_info, time_info)
                    if result_tuple not in found_results[name]:
                        found_results[name].append(result_tuple)
                        found_any = True
                        # پس از پیدا کردن در یک گروه، دیگر گروه‌ها را برای همین خط چک نمی‌کنیم
                        break 
    
    if not found_any:
        return "در پیام‌های اخیر، هیچ برنامه خاموشی مطابق با فرمت برای مناطق شما یافت نشد."
    
    for name, results in found_results.items():
        if results:
            final_message_parts.append(f"\n📍 *نتایج برای: {name}*")
            for location, time in results:
                # فقط عدد ابتدایی را اگر وجود داشت، حذف می‌کنیم تا خواناتر شود
                clean_location = re.sub(r'^\d+\s*-\s*', '', location)
                final_message_parts.append(f"   - {clean_location}")
                final_message_parts.append(f"     `{time}`")

    final_message_parts.append("\n\n---\n*این پیام به صورت خودکار از کانال برق نیکشهر استخراج شده است.*")
    return "\n".join(final_message_parts)

if __name__ == "__main__":
    result_message = find_outages()
    print("--- متن نهایی برای ارسال ---")
    print(result_message)
    print("----------------------------")
    send_to_telegram(result_message)
