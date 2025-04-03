import os
import json
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
PROMPTS_FILE_PATH = "image-prompts.jsonl"
PRODUCTS_ROOT_DIR = "products"
MODEL = "dall-e-3"
IMAGE_SIZE = "1024x1024"
IMAGE_QUALITY = "standard" # Options: "standard" or "hd"
REQUEST_DELAY_SECONDS = 5 # Delay between API requests to avoid rate limits
MAX_RETRIES = 2 # Number of retries for API call or download failures
RETRY_DELAY_SECONDS = 10 # Delay before retrying a failed request

# --- Helper Functions ---

def sanitize_filename(name: str) -> str:
    """Removes invalid characters for filenames/directories."""
    # Remove characters that are not alphanumeric, underscore, or hyphen
    sanitized = re.sub(r'[^a-zA-Z0-9_\-]', '', name)
    # Replace spaces with underscores
    sanitized = sanitized.replace(' ', '_')
    return sanitized.lower()

def download_image(image_url: str, save_path: str, retries: int = MAX_RETRIES) -> bool:
    """Downloads an image from a URL and saves it with retries."""
    attempt = 0
    while attempt <= retries:
        try:
            response = requests.get(image_url, stream=True, timeout=60)
            response.raise_for_status()  # Raise an exception for bad status codes (4xx or 5xx)
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
            return False # Don't retry IO errors
    logging.error(f"Failed to download image from {image_url} after {retries + 1} attempts.")
    return False

def call_dalle_api(client: OpenAI, prompt: str, retries: int = MAX_RETRIES):
    """Calls the DALL-E API with retries and returns the image URL."""
    attempt = 0
    while attempt <= retries:
        try:
            response = client.images.generate(
                model=MODEL,
                prompt=prompt,
                size=IMAGE_SIZE,
                quality=IMAGE_QUALITY,
                n=1,
                response_format="url" # Request URL directly
            )
            image_url = response.data[0].url
            logging.info(f"API generated image URL: {image_url}")
            return image_url
        except Exception as e:
            logging.warning(f"Attempt {attempt + 1}/{retries + 1}: DALL-E API call failed: {e}")
            if attempt < retries:
                logging.info(f"Retrying API call in {RETRY_DELAY_SECONDS} seconds...")
                time.sleep(RETRY_DELAY_SECONDS)
            attempt += 1
    logging.error(f"Failed to generate image from DALL-E after {retries + 1} attempts for prompt: {prompt[:100]}...")
    return None

# --- Main Execution ---

def main():
    if not API_KEY:
        logging.error("Error: OPENAI_API_KEY not found in .env file.")
        return

    if not os.path.exists(PROMPTS_FILE_PATH):
        logging.error(f"Error: Prompts file not found at {PROMPTS_FILE_PATH}")
        return

    try:
        client = OpenAI(api_key=API_KEY)
    except Exception as e:
        logging.error(f"Failed to initialize OpenAI client: {e}")
        return

    processed_count = 0
    skipped_count = 0
    error_count = 0
    total_prompts = 0

    try:
        with open(PROMPTS_FILE_PATH, 'r') as f:
            prompts_to_process = list(f) # Read all lines into memory
            total_prompts = len(prompts_to_process)
            logging.info(f"Found {total_prompts} prompts in {PROMPTS_FILE_PATH}")

            for i, line in enumerate(prompts_to_process):
                current_prompt_num = i + 1
                logging.info(f"--- Processing prompt {current_prompt_num}/{total_prompts} ---")
                try:
                    prompt_data = json.loads(line.strip())
                    product_id = prompt_data.get("id")
                    prompt = prompt_data.get("prompt")
                    family = prompt_data.get("family")

                    if not all([product_id, prompt, family]):
                        logging.warning(f"Skipping invalid prompt entry (missing id, prompt, or family): {line.strip()}")
                        error_count += 1
                        continue

                    # Sanitize family name for directory path and construct path
                    sanitized_family = sanitize_filename(family)
                    output_subdir = os.path.join(PRODUCTS_ROOT_DIR, sanitized_family, "images")
                    save_filename = f"{sanitize_filename(product_id)}.png"
                    save_path = os.path.join(output_subdir, save_filename)

                    # Create the directory if it doesn't exist
                    try:
                        os.makedirs(output_subdir, exist_ok=True)
                    except OSError as e:
                        logging.error(f"Failed to create directory {output_subdir}: {e}. Skipping product {product_id}.")
                        error_count += 1
                        continue

                    # Check if image already exists
                    if os.path.exists(save_path):
                        logging.info(f"Image already exists at {save_path}, skipping generation.")
                        skipped_count += 1
                        continue

                    logging.info(f"Generating image for ID: {product_id}, Family: {family}")
                    # logging.debug(f"Prompt: {prompt}") # Optional: Log full prompt if needed

                    image_url = call_dalle_api(client, prompt)

                    if image_url:
                        if download_image(image_url, save_path):
                            processed_count += 1
                        else:
                            error_count += 1 # Download failed after retries
                    else:
                        error_count += 1 # API call failed after retries

                    # Add a delay before the next prompt, even if skipped or errored, to respect API limits
                    if current_prompt_num < total_prompts: # Don't sleep after the last one
                        logging.info(f"Waiting for {REQUEST_DELAY_SECONDS} seconds before next prompt...")
                        time.sleep(REQUEST_DELAY_SECONDS)

                except json.JSONDecodeError:
                    logging.error(f"Skipping invalid JSON line: {line.strip()}")
                    error_count += 1
                except Exception as e:
                    logging.error(f"Unexpected error processing prompt line: {line.strip()}. Error: {e}")
                    error_count += 1
                    # Optional: Add a small delay even on unexpected errors
                    time.sleep(1)

    except FileNotFoundError:
        logging.error(f"Error: Prompts file not found at {PROMPTS_FILE_PATH}")
        return
    except Exception as e:
        logging.error(f"An unexpected error occurred during the main processing loop: {e}")
        return

    logging.info("--- Image Generation Complete ---")
    logging.info(f"Successfully generated images: {processed_count}")
    logging.info(f"Skipped (already existing): {skipped_count}")
    logging.info(f"Errors encountered: {error_count}")
    logging.info(f"Total prompts processed: {processed_count + skipped_count + error_count}")

if __name__ == "__main__":
    main() 