import os
import json
import logging
import glob

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Configuration ---
PRODUCTS_ROOT_DIR = "products"
OUTPUT_PROMPTS_FILE = "image-prompts.jsonl"

# --- Helper Function (from previous script, slightly adapted) ---

def generate_prompt(product_data: dict) -> str:
    """Generates a detailed prompt for DALL-E based on product data."""
    name = product_data.get("name", "Unnamed Product")
    description = product_data.get("description", "")
    tags = product_data.get("tags", [])
    attributes = product_data.get("attributes", {})
    product_type = product_data.get("product_type", "product")
    family = product_data.get("family", "General") # Use family in prompt if available

    # Key elements for the prompt
    prompt_elements = [
        f"High-quality product photograph of a '{name}' from the '{family}' family.",
        f"Type: {product_type}.",
        description,
    ]

    # Add relevant tags and attributes
    focus = ", ".join(attributes.get("focus_area", []))
    if focus:
        prompt_elements.append(f"Focuses on: {focus}.")
    complexity = attributes.get("complexity")
    if complexity:
        prompt_elements.append(f"Complexity: {complexity}.")
    age = attributes.get("age_range")
    if age:
         prompt_elements.append(f"Target age: {age}.")

    # Add some relevant tags for style/content
    style_tags = ["educational kit", "STEAM", "learning tool", "electronics components", "modular", "robotics"]
    relevant_tags = [tag for tag in tags if tag in style_tags or "kit" in tag or "sensor" in tag or "module" in tag]
    if relevant_tags:
        prompt_elements.append(f"Keywords: {', '.join(relevant_tags)}.")

    # Style and composition guidelines
    prompt_elements.extend([
        "The product should be clearly visible, well-lit, and presented attractively.",
        "Showcase the key components mentioned in the description.",
        "Setting: Clean white or light grey neutral background, studio lighting.",
        "Style: Realistic, sharp focus, detailed product photography, slightly elevated angle view.",
        "--no text labels on components --no excessive clutter --no people --no hands --no packaging unless specified" # Negative prompts
    ])

    return " ".join(prompt_elements)

# --- Main Execution ---

def main():
    logging.info(f"Starting prompt generation from root directory: {PRODUCTS_ROOT_DIR}")
    prompts_data = []
    total_products = 0
    error_count = 0

    # Find all products.jsonl files recursively
    product_files = glob.glob(os.path.join(PRODUCTS_ROOT_DIR, '**', 'products.jsonl'), recursive=True)

    if not product_files:
        logging.warning(f"No 'products.jsonl' files found under {PRODUCTS_ROOT_DIR}")
        return

    logging.info(f"Found {len(product_files)} product file(s): {product_files}")

    for filepath in product_files:
        logging.info(f"Processing file: {filepath}")
        # Extract family name from the directory path
        # Example: products/logicleaps/products.jsonl -> logicleaps
        try:
            family_name = os.path.basename(os.path.dirname(filepath))
        except Exception:
            logging.warning(f"Could not determine family name for {filepath}. Using 'unknown'.")
            family_name = "unknown"

        try:
            with open(filepath, 'r') as f:
                for i, line in enumerate(f):
                    line_num = i + 1
                    try:
                        product = json.loads(line.strip())
                        product_id = product.get("id")

                        if not product_id:
                            logging.warning(f"Skipping product with missing 'id' in {filepath} (Line {line_num})")
                            error_count += 1
                            continue

                        # Use family from data if present, otherwise use directory-derived name
                        final_family_name = product.get("family", family_name)

                        prompt = generate_prompt(product)

                        prompts_data.append({
                            "id": product_id,
                            "prompt": prompt,
                            "family": final_family_name
                        })
                        total_products += 1

                    except json.JSONDecodeError:
                        logging.error(f"Skipping invalid JSON line in {filepath} (Line {line_num}): {line.strip()}")
                        error_count += 1
                    except Exception as e:
                        logging.error(f"Error processing product line in {filepath} (Line {line_num}): {e}")
                        error_count += 1

        except FileNotFoundError:
            logging.error(f"File not found during processing loop (should not happen): {filepath}")
            error_count += 1
        except Exception as e:
            logging.error(f"Error reading file {filepath}: {e}")
            error_count += 1

    # Write prompts to the output file
    if prompts_data:
        try:
            with open(OUTPUT_PROMPTS_FILE, 'w') as outfile:
                for entry in prompts_data:
                    json.dump(entry, outfile)
                    outfile.write('\n')
            logging.info(f"Successfully generated {len(prompts_data)} prompts.")
            logging.info(f"Output written to: {OUTPUT_PROMPTS_FILE}")
        except IOError as e:
            logging.error(f"Failed to write prompts to {OUTPUT_PROMPTS_FILE}: {e}")
            error_count += 1
    else:
        logging.warning("No valid product data found to generate prompts.")

    logging.info("--- Prompt Generation Complete ---")
    logging.info(f"Total products processed: {total_products}")
    logging.info(f"Errors encountered: {error_count}")

if __name__ == "__main__":
    main() 