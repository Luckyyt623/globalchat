import logging
import re
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes
import requests
from bs4 import BeautifulSoup
import os
from dotenv import load_dotenv

# Load environment variables from .env file (for local testing)
load_dotenv()

# Set up logging
logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)
logger = logging.getLogger(__name__)

# Function to validate and identify a URL
def is_url(text: str) -> bool:
    url_pattern = re.compile(r'https?://[^\s<>"]+|www\.[^\s<>"]+')
    return bool(url_pattern.search(text))

# Function to extract song info from a YouTube link
def get_youtube_song_info(url: str) -> str:
    try:
        headers = {'User-Agent': 'Mozilla/5.0'}
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        title_tag = soup.find('title')
        if not title_tag:
            return "Could not extract song info: Title not found."
        
        title = title_tag.text.replace(' - YouTube', '').strip()
        # Simple heuristic: assume format is "Song Name - Artist" or "Artist - Song Name"
        parts = title.split(' - ')
        if len(parts) >= 2:
            # Try to guess which part is the song and which is the artist
            song_name = parts[0] if "by" in title.lower() else parts[1]
            artist = parts[1] if "by" in title.lower() else parts[0]
            return f"Song: {song_name} by {artist}"
        return f"Song: {title}"
    except Exception as e:
        logger.error(f"Error extracting song info from YouTube: {str(e)}")
        return f"Error extracting song info: {str(e)}"

# Handler for the /start command
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "Hi! I'm SongLinkBot. Send me a link (e.g., a YouTube link), and I'll try to identify the song for you!"
    )

# Handler for messages containing links
async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message_text = update.message.text
    if not is_url(message_text):
        await update.message.reply_text("Please send a valid URL.")
        return

    # Check if the link is from YouTube
    if "youtube.com" in message_text or "youtu.be" in message_text:
        song_info = get_youtube_song_info(message_text)
        await update.message.reply_text(song_info)
    else:
        await update.message.reply_text("I currently support YouTube links only. Please send a YouTube link.")

# Error handler
async def error(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    logger.error(f"Update {update} caused error {context.error}")
    if update and update.message:
        await update.message.reply_text("An error occurred. Please try again.")

def main() -> None:
    # Get the bot token from environment variables
    token = os.getenv("TELEGRAM_TOKEN")
    if not token:
        raise ValueError("TELEGRAM_TOKEN not set. Please set it in environment variables on Render.")

    # Create the Application
    application = Application.builder().token(token).build()

    # Add handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    application.add_error_handler(error)

    # Start the bot
    logger.info("Starting bot...")
    application.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == "__main__":
    main()