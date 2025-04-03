import os
import json
import glob
from dotenv import load_dotenv
from astrapy import DataAPIClient

# Load environment variables from .env file
load_dotenv()

# --- AstraDB Credentials (Replace with your actual credentials or load from env) ---
ASTRA_DB_TOKEN = os.getenv("ASTRA_DB_TOKEN") # Or replace with "AstraCS:..."
ASTRA_DB_API_ENDPOINT = os.getenv("ASTRA_DB_API_ENDPOINT") # Or replace with "https://<db_id>-<region>.apps.astra.datastax.com"
# --- ---

ASTRA_DB_COLLECTION = "products"

if not ASTRA_DB_TOKEN or not ASTRA_DB_API_ENDPOINT:
    print("Error: ASTRA_DB_TOKEN and ASTRA_DB_API_ENDPOINT must be set.")
    print("Please set them in a .env file or directly in the script.")
    exit(1)

def load_products():
    """Finds product JSONL files, connects to AstraDB, and loads the data."""

    # Initialize the client
    print(f"Connecting to AstraDB: {ASTRA_DB_API_ENDPOINT}")
    client = DataAPIClient(ASTRA_DB_TOKEN)
    db = client.get_database(ASTRA_DB_API_ENDPOINT)
    collection = db.get_collection(ASTRA_DB_COLLECTION)
    print(f"Connected to collection: '{ASTRA_DB_COLLECTION}'")

    # Find all products.jsonl files
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
                        
                        # Create the document for insertion with $vectorize
                        doc_to_insert = product_data.copy() # Start with original data
                        if 'description' in doc_to_insert:
                            doc_to_insert['$vectorize'] = doc_to_insert['description']
                        else:
                            print(f"  Warning: 'description' field missing in document from {file_path}, skipping vectorization for this doc.")
                            # Decide if you still want to insert without vectorization
                            # If not, you could use 'continue' here.

                        # Insert the modified document
                        response = collection.insert_one(doc_to_insert)
                        
                        # print(f"  Inserted document ID: {response.inserted_id}")
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