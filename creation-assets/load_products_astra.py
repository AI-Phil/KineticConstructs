import os
import json
import glob
from dotenv import load_dotenv
from astrapy import DataAPIClient
from create_astra_collection import create_collection_if_not_exists

load_dotenv()

ASTRA_DB_APPLICATION_TOKEN = os.getenv("ASTRA_DB_APPLICATION_TOKEN")
ASTRA_DB_API_ENDPOINT = os.getenv("ASTRA_DB_API_ENDPOINT")

ASTRA_DB_COLLECTION = "products"

if not ASTRA_DB_APPLICATION_TOKEN or not ASTRA_DB_API_ENDPOINT:
    print("Error: ASTRA_DB_APPLICATION_TOKEN and ASTRA_DB_API_ENDPOINT must be set.")
    print("Please set them in a .env file or directly in the script.")
    exit(1)

def as_markdown(product_doc: dict) -> str | None:
    """
    Generates a markdown representation of a product document, including its
    name, description, attributes, and tags.
    Returns None if the description is missing or empty.
    """
    if 'description' not in product_doc or not product_doc['description']:
        return None

    markdown_elements = []
    
    # Product Name
    product_name = product_doc.get('name')
    if product_name:
        markdown_elements.append(f"# {product_name}")
    
    # Product Description (guaranteed to exist and be non-empty by the initial check)
    markdown_elements.append(product_doc['description'])
    
    # Product Attributes
    product_attributes = product_doc.get('attributes')
    if product_attributes:
        attribute_strings = []
        if isinstance(product_attributes, dict):
            for key, value in product_attributes.items():
                if value is not None: # Only include attributes with a value
                    attribute_strings.append(f"* **{key}**: {value}")
        elif isinstance(product_attributes, list):
            for attr in product_attributes:
                if isinstance(attr, dict):
                    name = attr.get('name', attr.get('key'))
                    val = attr.get('value')
                    if name and val is not None:
                        attribute_strings.append(f"* **{name}**: {val}")
                    elif name: # Attribute with name but no value
                        attribute_strings.append(f"* {name}")
                    # else: skip malformed dict attributes
                elif isinstance(attr, str) and attr.strip():
                    attribute_strings.append(f"* {attr.strip()}")
                # else: skip non-string/non-dict attributes in list
        if attribute_strings:
            markdown_elements.append("\n## Attributes")
            markdown_elements.extend(attribute_strings)
    
    # Product Tags
    product_tags = product_doc.get('tags')
    if product_tags:
        tag_list = []
        if isinstance(product_tags, list):
            tag_list = [str(tag).strip() for tag in product_tags if tag and str(tag).strip()]
        elif isinstance(product_tags, str) and product_tags.strip():
            tag_list = [product_tags.strip()]
        
        if tag_list:
            markdown_elements.append("\n## Tags")
            markdown_elements.append(", ".join(tag_list))

    return "\n\n".join(markdown_elements)

def load_products():
    """Finds product JSONL files, connects to AstraDB, and loads the data."""

    print(f"Connecting to AstraDB: {ASTRA_DB_API_ENDPOINT}")
    client = DataAPIClient(ASTRA_DB_APPLICATION_TOKEN)
    db = client.get_database(ASTRA_DB_API_ENDPOINT)

    is_lexical, collection_name = create_collection_if_not_exists(db, ASTRA_DB_COLLECTION)
    text_field_name = '$hybrid' if is_lexical else '$vectorize'

    collection = db.get_collection(collection_name)
    print(f"Connected to collection: '{collection_name}'")

    product_files = glob.glob("products/*/products.jsonl")
    print(f"Found {len(product_files)} product file(s):")
    for f in product_files:
        print(f"- {f}")

    total_inserted = 0
    for file_path in product_files:
        print(f"Processing {file_path}...")
        inserted_in_file = 0
        try:
            with open(file_path, 'r') as f:
                for line in f:
                    try:
                        product_data = json.loads(line.strip())
                        
                        doc_to_insert = product_data.copy()

                        generated_markdown = as_markdown(doc_to_insert)
                        if generated_markdown:
                            doc_to_insert[text_field_name] = generated_markdown
                        else:
                            print(f"  Warning: descriptive content missing or empty in document from {file_path}. '{text_field_name}' field will not be populated.")
                        
                        response = collection.insert_one(doc_to_insert)
                        
                        inserted_in_file += 1
                    except json.JSONDecodeError as e:
                        print(f"  Warning: Skipping invalid JSON line in {file_path}: {e}")
                    except Exception as e:
                        print(f"  Error inserting document from {file_path}: {e}")
                        print(f"  Problematic data: {line.strip()}")

            print(f"  Successfully inserted {inserted_in_file} documents from {file_path}.")
            total_inserted += inserted_in_file
        except FileNotFoundError:
            print(f"  Error: File not found {file_path}")
        except Exception as e:
            print(f"  Error processing file {file_path}: {e}")

    print(f"\nFinished loading data. Total documents inserted: {total_inserted}")

if __name__ == "__main__":
    load_products() 