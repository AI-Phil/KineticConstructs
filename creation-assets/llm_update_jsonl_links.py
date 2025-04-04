import os
import json
import glob
import re
import sys
import time
from openai import OpenAI, APIError
from pydantic import BaseModel
from dotenv import load_dotenv
import logging

# --- Configuration ---
load_dotenv()
API_KEY = os.getenv("OPENAI_API_KEY")
MODEL = "gpt-4o-mini"
REQUEST_DELAY_SECONDS = 0.15 # Adjust as needed for rate limits
DOCS_JSONL_PATH_PATTERN = "products/*/documents.jsonl"
PRODUCTS_JSONL_PATH_PATTERN = "products/*/products.jsonl"

# Setup basic logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Define the Pydantic model for the structured response
class ModifiedTextResponse(BaseModel):
    modified_text: str

# Define the regex to find potential candidates - slightly broader
CANDIDATE_REGEX = re.compile(r'\b([A-Z]{2,}-[A-Z0-9]{3,}-[0-9]{3}(?:_[A-Z]+(?:_[vV][0-9.]+)?)?)\b', re.IGNORECASE)

# --- Helper Functions ---

def load_jsonl(file_path):
    """Loads a JSONL file line by line, yielding parsed dictionaries."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    yield line_num, json.loads(line)
                except json.JSONDecodeError as e:
                    logging.warning(f"Skipping invalid JSON in {file_path} line {line_num}: {e}")
    except FileNotFoundError:
        logging.error(f"File not found: {file_path}")
    except Exception as e:
        logging.error(f"Error reading file {file_path}: {e}")

def build_maps(script_dir):
    """Builds maps for document IDs/titles and product IDs/names."""
    doc_id_to_title = {}
    product_id_to_name = {}
    doc_files = glob.glob(os.path.join(script_dir, DOCS_JSONL_PATH_PATTERN), recursive=True)
    prod_files = glob.glob(os.path.join(script_dir, PRODUCTS_JSONL_PATH_PATTERN), recursive=True)

    logging.info("Building document ID -> title map...")
    for file_path in doc_files:
        for _, doc_data in load_jsonl(file_path):
            doc_id = doc_data.get('_id')
            doc_title = doc_data.get('title')
            if doc_id and doc_title:
                if doc_id in doc_id_to_title and doc_id_to_title[doc_id] != doc_title:
                     logging.warning(f"Duplicate doc _id '{doc_id}' found with different titles. Keeping first.")
                elif doc_id:
                    doc_id_to_title[doc_id] = doc_title
            elif doc_id and not doc_title:
                 logging.warning(f"Document '{doc_id}' in {os.path.basename(file_path)} is missing a title.")
    logging.info(f"Found titles for {len(doc_id_to_title)} unique document IDs.")

    logging.info("Building product ID -> name map...")
    for file_path in prod_files:
        for _, prod_data in load_jsonl(file_path):
            # Try to get _id first, then fall back to sku
            prod_id = prod_data.get('_id')
            if not prod_id:
                prod_id = prod_data.get('sku')

            prod_name = prod_data.get('name')
            if prod_id and prod_name:
                if prod_id in product_id_to_name and product_id_to_name[prod_id] != prod_name:
                    logging.warning(f"Duplicate product id '{prod_id}' found with different names. Keeping first.")
                elif prod_id:
                    product_id_to_name[prod_id] = prod_name
            elif prod_id and not prod_name:
                 logging.warning(f"Product '{prod_id}' in {os.path.basename(file_path)} is missing a name.")
    logging.info(f"Found names for {len(product_id_to_name)} unique product IDs.")

    # Convert maps to formatted strings for the prompt
    doc_list_str = "\n".join([f"Doc: {id} - {title}" for id, title in doc_id_to_title.items()])
    product_list_str = "\n".join([f"Prod: {id} - {name}" for id, name in product_id_to_name.items()])

    return doc_id_to_title, product_id_to_name, doc_list_str, product_list_str

def process_files(client, doc_files, doc_id_to_title, product_id_to_name, doc_list_str, product_list_str, script_dir):
    """Processes each document file, updates links using LLM, and overwrites files."""
    total_files = len(doc_files)
    total_updates_overall = 0

    # Construct Prompt Messages (once)
    system_message = "You are an expert technical writer assistant. Your task is to analyze text and replace references to specific document and product IDs with Markdown links, using the provided lists for accuracy. Respond with the fully modified text."
    user_message_template = f"""Analyze the following text and replace references to document or product IDs with Markdown links.

Instructions:
1. Use the provided lists (`Known Documents`, `Known Products`) to find the correct title/name for each ID referenced in the `Original Text`.
2. Format document links as: `[Document Title](/document/DOCUMENT_ID)`
3. Format product links as: `[Product Name](/product/PRODUCT_ID)`
4. If a reference in the text is ambiguous (e.g., missing version like 'LL-MCU-002 FAQ' when the list has 'LL-MCU-002_FAQ_v1.0'), use the most likely match from the list if confidence is high.
5. **Crucially**: When you identify a reference like `Some Name (ID)` or `(ID) Some Name` or just `ID` that corresponds to an entry in the lists, replace the *entire reference phrase* (e.g., `Some Name (ID)`) with the *single* Markdown link. Do not leave parts of the original reference text around the link. For example, replace `KinetiCore ESP (LL-MCU-002)` entirely with `[IoT Explorer Kit (KinetiCore ESP)](/product/LL-MCU-002)`.
6. Preserve all surrounding text, whitespace, and existing Markdown formatting accurately.
7. **Important**: Do NOT create a link for the title or ID of the specific document being processed right now (Current Document ID: `{{current_doc_id}}`, Title: `{{current_doc_title}}`). Leave references to this specific document as plain text.

Known Documents:
---
{{doc_list_str}}
---

Known Products:
---
{{product_list_str}}
---

Original Text:
---
{{original_text}}
---

Output the full modified text containing the replacements.
"""

    for file_index, file_path in enumerate(doc_files):
        rel_path = os.path.relpath(file_path, script_dir)
        logging.info(f"Processing file {file_index + 1}/{total_files}: {rel_path}")
        updated_lines = []
        updates_in_file = 0
        lines_to_process = []

        # Read all lines first
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                lines_to_process = f.readlines()
        except Exception as e:
            logging.error(f"Could not read file {rel_path}: {e}. Skipping.")
            continue

        total_lines_in_file = len(lines_to_process)
        for line_num, original_line_content in enumerate(lines_to_process, 1):
            stripped_line = original_line_content.strip()
            if not stripped_line:
                updated_lines.append(original_line_content) # Keep empty lines
                continue

            try:
                doc_data = json.loads(stripped_line)
                original_text = doc_data.get('text')
                current_doc_id = doc_data.get('_id') # For logging and prompt context
                current_doc_title = doc_id_to_title.get(current_doc_id, "") # Get current title for prompt context

                if not original_text or not isinstance(original_text, str):
                    updated_lines.append(original_line_content) # Keep line if no text
                    continue

                # Check for candidates first
                candidates = CANDIDATE_REGEX.findall(original_text)
                if not candidates:
                    updated_lines.append(original_line_content) # Keep line if no candidates
                    continue

                # Log progress within the file
                logging.info(f"  File {rel_path} - Line {line_num}/{total_lines_in_file} (ID: {current_doc_id}): Found candidates {candidates}. Calling LLM...")

                # Format the user message for this specific text
                user_message = user_message_template.format(
                    doc_list_str=doc_list_str,
                    product_list_str=product_list_str,
                    original_text=original_text,
                    current_doc_id=current_doc_id,      # Pass current doc info
                    current_doc_title=current_doc_title # Pass current doc info
                )

                modified_text = None
                try:
                    completion = client.beta.chat.completions.parse(
                        model=MODEL,
                        messages=[
                            {"role": "system", "content": system_message},
                            {"role": "user", "content": user_message}
                        ],
                        response_format=ModifiedTextResponse,
                    )
                    parsed_response = completion.choices[0].message.parsed
                    modified_text = parsed_response.modified_text
                    logging.debug(f"    LLM call successful for line {line_num} in {rel_path}")

                except APIError as e:
                    logging.error(f"    OpenAI API Error for line {line_num} in {rel_path}: {e}. Keeping original.")
                except Exception as e:
                     logging.error(f"    Error during API call/parsing for line {line_num} in {rel_path}: {e}. Keeping original.")

                # Add a delay regardless of success/failure
                time.sleep(REQUEST_DELAY_SECONDS)

                # Update the line if modification occurred and was successful
                if modified_text and modified_text != original_text:
                    doc_data['text'] = modified_text
                    updated_json_line = json.dumps(doc_data, ensure_ascii=False) + '\n'
                    updated_lines.append(updated_json_line)
                    updates_in_file += 1
                    total_updates_overall += 1
                    logging.info(f"    Line {line_num} updated.")
                else:
                    updated_lines.append(original_line_content) # Keep original if no change or error
                    if modified_text == original_text:
                         logging.debug(f"    Line {line_num} returned identical text.")

            except json.JSONDecodeError as e:
                logging.warning(f"  Invalid JSON on line {line_num} of {rel_path}: {e}. Keeping original line.")
                updated_lines.append(original_line_content)
            except Exception as e:
                logging.error(f"  Unexpected error processing line {line_num} of {rel_path}: {e}. Keeping original line.")
                updated_lines.append(original_line_content)

        # Overwrite the original file with the updated lines
        if updates_in_file > 0:
            logging.info(f"Writing {updates_in_file} updates to {rel_path}...")
            try:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.writelines(updated_lines)
                logging.info(f"Successfully wrote updates to {rel_path}.")
            except Exception as e:
                logging.error(f"Failed to write updates to {rel_path}: {e}")
        else:
            logging.info(f"No updates made to {rel_path}.")

    logging.info(f"\nProcessing complete. Total updates made across all files: {total_updates_overall}")


def main():
    if not API_KEY:
        logging.error("OPENAI_API_KEY not found in .env file or environment variables.")
        sys.exit(1)

    try:
        client = OpenAI(api_key=API_KEY)
        client.models.list() # Test connection
        logging.info("OpenAI client initialized and connection tested.")
    except APIError as e:
         logging.error(f"Failed to initialize or connect OpenAI client: {e}")
         sys.exit(1)
    except Exception as e:
        logging.error(f"An unexpected error occurred during OpenAI client setup: {e}")
        sys.exit(1)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    doc_id_to_title, product_id_to_name, doc_list_str, product_list_str = build_maps(script_dir)

    if not doc_id_to_title and not product_id_to_name:
         logging.error("Failed to build document and product maps. Cannot proceed.")
         sys.exit(1)
    elif not doc_id_to_title:
        logging.warning("Failed to build document map. Product links might be correct, but document links likely won't be.")
    elif not product_id_to_name:
        logging.warning("Failed to build product map. Document links might be correct, but product links likely won't be.")

    doc_files = sorted(glob.glob(os.path.join(script_dir, DOCS_JSONL_PATH_PATTERN), recursive=True))
    if not doc_files:
        logging.error(f"No document JSONL files found matching pattern: {DOCS_JSONL_PATH_PATTERN}")
        sys.exit(1)

    logging.info(f"Found {len(doc_files)} document files to process.")

    # --- Process all files ---
    process_files(client, doc_files, doc_id_to_title, product_id_to_name, doc_list_str, product_list_str, script_dir)


if __name__ == "__main__":
    main() 