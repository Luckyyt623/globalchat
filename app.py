import logging
import re
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes
import requests
from bs4 import BeautifulSoup
import os
from dotenv import load_dotenv
from flask import Flask
import threading

# Load environment variables from .env file (for local testing)
load_dotenv()

# Set up logging
logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)
logger = logging.getLogger(__name__)

# Flask app setup
app = Flask(__name__)

# Global variable to store the last identified song
last_song_info = "No song identified yet."

# Function to validate and identify a URL
def is_url(text: str) -> bool:
    url_pattern = re.compile(r'https?://[^\s<>"]+|www\.[^\s<>"]+')
    return bool(url_pattern.search(text))

# Function to extract song info from a YouTube link using web scraping
def get_youtube_song_info(url: str) -> str:
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')

        # Method 1: Try the <title> tag
        title_tag = soup.find('title')
        title = None
        if title_tag:
            title = title_tag.text.replace(' - YouTube', '').strip()
            logger.info(f"Extracted title from <title> tag: {title}")

        # Method 2: Try the og:title meta tag (more reliable for YouTube)
        if not title:
            og_title_tag = soup.find('meta', property='og:title')
            if og_title_tag and og_title_tag.get('content'):
                title = og_title_tag['content'].strip()
                logger.info(f"Extracted title from og:title: {title}")

        # If no title found, try the description
        if not title:
            desc_tag = soup.find('meta', property='og:description')
            if desc_tag and desc_tag.get('content'):
                title = desc_tag['content'].strip()
                logger.info(f"Extracted title from og:description: {title}")
            else:
                return "Could not extract song info: No title or description found."

        # Clean up the title and try to parse song and artist
        # Remove common YouTube suffixes like "[Official Video]" or "(Lyrics)"
        title = re.sub(r'\[.*?\]|\(.*?\)|\s*-\s*Official\s*(Video|Music\s*Video|Audio|Lyrics)?', '', title, flags=re.IGNORECASE).strip()

        # Split the title to guess song name and artist
        parts = title.split(' - ')
        if len(parts) >= 2:
            # Heuristic: Check for keywords to determine song vs artist
            if "by" in title.lower():
                song_name = parts[0].strip()
                artist = parts[1].strip()
            else:
                # Assume the second part is the song name if "by" isn't present
                artist = parts[0].strip()
                song_name = parts[1].strip()
            return f"Song: {song_name} by {artist}"
        else:
            # If we can't split, return the cleaned title as the song name
            return f"Song: {title}"
    except Exception as e:
        logger.error(f"Error extracting song info from YouTube: {str(e)}")
        return f"Error: Could not extract song info ({str(e)})"

# Handler for the /start command
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "Hi! I'm SongLinkBot. Send me a link (e.g., a YouTube link), and I'll try to identify the song for you!"
    )

# Handler for messages containing links
async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    global last_song_info
    message_text = update.message.text
    if not is_url(message_text):
        await update.message.reply_text("Please send a valid URL.")
        return

    # Check if the link is from YouTube
    if "youtube.com" in message_text or "youtu.be" in message_text:
        song_info = get_youtube_song_info(message_text)
        last_song_info = song_info  # Store the song info for Flask to display
        await update.message.reply_text(song_info)
    else:
        await update.message.reply_text("I currently support YouTube links only. Please send a YouTube link.")

# Error handler
async def error(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    logger.error(f"Update {update} caused error {context.error}")
    if update and update.message:
        await update.message.reply_text("An error occurred. Please try again.")

# Flask route to display the last identified song
@app.route('/')
def index():
    global last_song_info
    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>SongLinkBot</title>
        <style>
            body {{
                font-family: Arial, sans-serif;
                background-color: #f0f0f0;
                margin: 0;
                padding: 20px;
                text-align: center;
            }}
            h1 {{
                color: #333;
            }}
            p {{
                font-size: 18px;
                color: #555;
            }}
        </style>
    </head>
    <body>
        <h1>SongLinkBot</h1>
        <p>Last Song Identified: {last_song_info}</p>
    </body>
    </html>
    """
    return html_content

# Function to run Flask app in a separate thread
def run_flask():
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port)

def main() -> None:
    # Start Flask in a separate thread
    flask_thread = threading.Thread(target=run_flask)
    flask_thread.start()

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