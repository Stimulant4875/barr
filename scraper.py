import requests
from bs4 import BeautifulSoup
import sys

URL = "https://splus.ir/Tozie_Barq_Nikshahar_ir"
TARGET_LOCATIONS = ["خیرآباد", "زیرک آباد"]

def fetch_outages():
    print(">>> شروع فرآیند استخراج اطلاعات خاموشی...")
    try:
        response = requests.get(URL, timeout=15)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, "html.parser")
        messages = soup.find_all('div', class_='channel-message-text')

        if not messages:
            print("هیچ پستی در کانال پیدا نشد.")
            return

        print(f">>> تعداد {len(messages)} پست پیدا شد. در حال بررسی محتوا...")
        found_outages = False
        for message in reversed(messages):
            message_text = message.get_text(separator="\n", strip=True)
            for location in TARGET_LOCATIONS:
                if location in message_text:
                    print("\n" + "="*50)
                    print(f"*** اطلاعات خاموشی برای منطقه حاوی '{location}' پیدا شد: ***")
                    print(message_text)
                    print("="*50 + "\n")
                    found_outages = True
                    break
        if not found_outages:
            print("\n>>> در آخرین پست‌ها، اطلاعاتی برای مناطق مورد نظر شما یافت نشد.")

    except requests.exceptions.RequestException as e:
        print(f"خطا در اتصال به سایت: {e}", file=sys.stderr)
    except Exception as e:
        print(f"یک خطای پیش‌بینی نشده رخ داد: {e}", file=sys.stderr)

if __name__ == "__main__":
    fetch_outages()
