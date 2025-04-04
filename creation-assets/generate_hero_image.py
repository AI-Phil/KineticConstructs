import os
import requests
from openai import OpenAI
from dotenv import load_dotenv
import logging
import time
import re

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Load environment variables from .env file
load_dotenv()

# --- Configuration ---
API_KEY = os.getenv("OPENAI_API_KEY")
OUTPUT_DIR = "public/images" # Relative to project root
OUTPUT_FILENAME = "hero-background.png" # Changed extension to .png
MODEL = "dall-e-3"
IMAGE_SIZE = "1792x1024" # Landscape aspect ratio close to 16:9 for DALL-E 3
IMAGE_QUALITY = "standard" # Options: "standard" or "hd"
REQUEST_DELAY_SECONDS = 2 # Small delay
MAX_RETRIES = 2 # Number of retries for API call or download failures
RETRY_DELAY_SECONDS = 10 # Delay before retrying a failed request

# The prompt for the hero image
HERO_IMAGE_PROMPT = """
A vibrant and dynamic panoramic scene showcasing the essence of Kinetic Constructs toys.
Feature a sleek, slightly futuristic workshop or play area bathed in bright, optimistic lighting.
In the foreground, show parts of different product types: a robotic arm from ConstructoBots assembling something small,
glowing logic blocks from LogicLeaps connected, a miniature stylized futuristic city section from ImagiWorlds,
and intricate gears from KinetiKits meshing together. The overall style should be modern, clean, slightly stylized
(not photorealistic), tech-focused but undeniably playful, emphasizing creativity and STEAM learning.
Avoid showing specific human figures, focus on the creations. Aspect ratio suitable for a website hero banner (like 16:9).
"""

# --- Helper Functions ---

def sanitize_filename(name: str) -> str:
    """Removes invalid characters for filenames/directories."""
    # Remove characters that are not alphanumeric, underscore, hyphen, or dot
    sanitized = re.sub(r'[^a-zA-Z0-9_\-\.]', '', name)
    # Replace spaces with underscores
    sanitized = sanitized.replace(' ', '_')
    return sanitized.lower()

def download_image(image_url: str, save_path: str, retries: int = MAX_RETRIES) -> bool:
    """Downloads an image from a URL and saves it with retries."""
    attempt = 0
    while attempt <= retries:
        try:
            response = requests.get(image_url, stream=True, timeout=60)
            response.raise_for_status()

            # Determine extension (optional - default to .png is safer here)
            # content_type = response.headers.get('content-type')
            # if content_type == 'image/png':
            #     save_path = os.path.splitext(save_path)[0] + '.png'
            # elif content_type == 'image/jpeg':
            #     save_path = os.path.splitext(save_path)[0] + '.jpg'
            # else:
            #     # Default or try to guess from URL if needed
            #     pass # Keep original extension

            with open(save_path, 'wb') as f:
                for chunk in response.iter_content(8192):
                    f.write(chunk)
            logging.info(f"Successfully downloaded image to {save_path}")
            return True
        except requests.exceptions.RequestException as e:
            logging.warning(f"Attempt {attempt + 1}/{retries + 1}: Failed to download image from {image_url}: {e}")
            if attempt < retries:
                logging.info(f"Retrying download in {RETRY_DELAY_SECONDS} seconds...")
                time.sleep(RETRY_DELAY_SECONDS)
            attempt += 1
        except IOError as e:
            logging.error(f"Failed to save image to {save_path}: {e}")
            return False
    logging.error(f"Failed to download image from {image_url} after {retries + 1} attempts.")
    return False

def call_dalle_api(client: OpenAI, prompt: str, retries: int = MAX_RETRIES):
    """Calls the DALL-E API with retries and returns the image URL."""
    attempt = 0
    while attempt <= retries:
        try:
            logging.info(f"Requesting image generation from DALL-E with size {IMAGE_SIZE}...")
            response = client.images.generate(
                model=MODEL,
                prompt=prompt,
                size=IMAGE_SIZE,
                quality=IMAGE_QUALITY,
                n=1,
                response_format="url"
            )
            image_url = response.data[0].url
            revised_prompt = response.data[0].revised_prompt # DALL-E 3 often revises prompts
            logging.info(f"API generated image URL: {image_url}")
            if revised_prompt:
                 logging.info(f"Revised prompt from DALL-E: {revised_prompt}")
            return image_url
        except Exception as e:
            # Log the specific error from OpenAI if available
            error_message = str(e)
            if hasattr(e, 'response') and e.response is not None:
                 try:
                    error_data = e.response.json()
                    error_message = error_data.get('error', {}).get('message', error_message)
                 except ValueError: # If response is not JSON
                    pass # Keep original error message
            logging.warning(f"Attempt {attempt + 1}/{retries + 1}: DALL-E API call failed: {error_message}")

            # Specific check for content policy violation
            if "content policy" in error_message.lower():
                logging.error("The prompt was rejected due to content policy. Please revise the prompt.")
                return None # Don't retry content policy errors

            # Specific check for billing issues
            if "billing" in error_message.lower() or "quota" in error_message.lower():
                 logging.error(f"DALL-E API call failed due to billing/quota issue: {error_message}")
                 return None # Don't retry billing errors

            if attempt < retries:
                logging.info(f"Retrying API call in {RETRY_DELAY_SECONDS} seconds...")
                time.sleep(RETRY_DELAY_SECONDS)
            attempt += 1
    logging.error(f"Failed to generate image from DALL-E after {retries + 1} attempts.")
    return None

# --- Main Execution ---

def main():
    if not API_KEY:
        logging.error("Error: OPENAI_API_KEY not found in .env file.")
        logging.error("Please ensure your API key is set in a .env file in the project root.")
        return

    try:
        client = OpenAI(api_key=API_KEY)
    except Exception as e:
        logging.error(f"Failed to initialize OpenAI client: {e}")
        return

    # Construct the full save path
    # Sanitize filename just in case, though it's hardcoded here
    safe_filename = sanitize_filename(OUTPUT_FILENAME)
    save_path = os.path.join(OUTPUT_DIR, safe_filename)

    # Create the output directory if it doesn't exist
    try:
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        logging.info(f"Ensured output directory exists: {OUTPUT_DIR}")
    except OSError as e:
        logging.error(f"Failed to create directory {OUTPUT_DIR}: {e}. Cannot save image.")
        return

    # Check if image already exists
    if os.path.exists(save_path):
        logging.info(f"Hero image already exists at {save_path}, skipping generation.")
        return

    logging.info(f"--- Generating Hero Image ---")
    logging.info(f"Prompt: {HERO_IMAGE_PROMPT[:150]}...") # Log beginning of prompt

    image_url = call_dalle_api(client, HERO_IMAGE_PROMPT)

    if image_url:
        logging.info(f"Attempting to download image to {save_path}")
        if download_image(image_url, save_path):
            logging.info("--- Hero Image Generation Complete ---")
        else:
            logging.error("Failed to download the generated hero image.")
    else:
        logging.error("Failed to get image URL from DALL-E API after retries.")

if __name__ == "__main__":
    main()
