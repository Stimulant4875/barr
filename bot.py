import logging
import os
from telegram.ext import Updater, CommandHandler, MessageHandler, Filters

# توکن ربات شما
TOKEN = "8346440120:AAGQMSu5W8hU8pFkQceXMc3mql3g5DCNqPU"

# فعال کردن لاگ برای دیباگ کردن
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO
)
logger = logging.getLogger(__name__)

# --- توابع ربات (بدون تغییر) ---
def get_outage_info(area_name):
    all_outages = {
        "کهورکان": [
            "نوبت اول: از ساعت 14:00 تا 16:00",
            "نوبت دوم: از ساعت 18:15 تا 20:15"
        ],
        "زیرک آباد": [
            "نوبت اول: از ساعت 08:00 تا 10:00",
            "نوبت دوم: از ساعت 16:00 تا 18:00"
        ]
    }
    for key, value in all_outages.items():
        if key in area_name:
            return f"زمان خاموشی برای '{key}':\n" + "\n".join(value)
    return "اطلاعاتی برای این منطقه یافت نشد. لطفاً نام منطقه را به فارسی و دقیق وارد کنید (مثلاً: کهورکان)."

def start(update, context):
    welcome_message = (
        "سلام! به ربات اعلام خاموشی برق نیکشهر خوش آمدید.\n\n"
        "برای دریافت زمان خاموشی، نام روستا یا منطقه مورد نظر خود را ارسال کنید.\n\n"
        "برای مثال: `زیرک آباد` یا `کهورکان`"
    )
    update.message.reply_text(welcome_message)

def get_info(update, context):
    user_input = update.message.text
    outage_info = get_outage_info(user_input)
    update.message.reply_text(outage_info)

def error(update, context):
    logger.warning('Update "%s" caused error "%s"', update, context.error)

# --- تابع اصلی جدید برای اجرا به عنوان وب‌سرویس ---
def main():
    """شروع به کار ربات با وب‌هوک."""
    # ایجاد Updater
    updater = Updater(TOKEN, use_context=True)

    # دریافت dispatcher برای ثبت handler ها
    dp = updater.dispatcher

    # ثبت دستورات و پیام‌ها
    dp.add_handler(CommandHandler("start", start))
    dp.add_handler(MessageHandler(Filters.text & ~Filters.command, get_info))
    dp.add_error_handler(error)

    # گرفتن پورت و نام برنامه از متغیرهای محیطی Render
    PORT = int(os.environ.get("PORT", "8443"))
    APP_NAME = os.environ.get("RENDER_EXTERNAL_HOSTNAME")

    if not APP_NAME:
        logger.error("متغیر RENDER_EXTERNAL_HOSTNAME تنظیم نشده است!")
        return

    # شروع وب‌هوک
    logger.info(f"شروع وب‌هوک در آدرس {APP_NAME} و پورت {PORT}")
    updater.start_webhook(listen="0.0.0.0",
                          port=PORT,
                          url_path=TOKEN,
                          webhook_url=f"https://{APP_NAME}/{TOKEN}")

    # نگه داشتن برنامه در حال اجرا
    updater.idle()

if __name__ == '__main__':
    main()
