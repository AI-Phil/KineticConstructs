import os
import json
import glob
from dotenv import load_dotenv
from astrapy import DataAPIClient

# Load environment variables from .env file
load_dotenv()

# --- AstraDB Credentials (Loaded from .env) ---
ASTRA_DB_TOKEN = os.getenv("ASTRA_DB_TOKEN") 
ASTRA_DB_API_ENDPOINT = os.getenv("ASTRA_DB_API_ENDPOINT")
# --- ---

ASTRA_DB_COLLECTION = "documents" # Target the 'documents' collection

if not ASTRA_DB_TOKEN or not ASTRA_DB_API_ENDPOINT:
    print("Error: ASTRA_DB_TOKEN and ASTRA_DB_API_ENDPOINT must be set in the .env file.")
    exit(1)

def load_documents():
    """Finds document JSONL files, connects to AstraDB, and loads the data."""

    # Initialize the client
    print(f"Connecting to AstraDB: {ASTRA_DB_API_ENDPOINT}")
    client = DataAPIClient(ASTRA_DB_TOKEN)
    db = client.get_database(ASTRA_DB_API_ENDPOINT)
    collection = db.get_collection(ASTRA_DB_COLLECTION)
    print(f"Connected to collection: '{ASTRA_DB_COLLECTION}'")

    # Find all documents.jsonl files within product subdirectories
    document_files = glob.glob("products/*/documents.jsonl") 
    print(f"Found {len(document_files)} document file(s):")
    for f in document_files:
        print(f"- {f}")

    total_inserted = 0
    for file_path in document_files:
        print(f"Processing {file_path}...")
        inserted_in_file = 0
        try:
            with open(file_path, 'r') as f:
                for line_num, line in enumerate(f, 1): # Enumerate for better error reporting
                    try:
                        doc_data = json.loads(line.strip())
                        
                        # Create the document for insertion with $vectorize using the 'text' field
                        doc_to_insert = doc_data.copy() # Start with original data
                        if 'text' in doc_to_insert and doc_to_insert['text']: # Ensure 'text' exists and is not empty
                            doc_to_insert['$vectorize'] = doc_to_insert['text']
                        else:
                            print(f"  Warning: 'text' field missing or empty in document from {file_path} (line {line_num}), skipping vectorization for this doc.")
                            # Optionally skip insertion: continue

                        # Insert the modified document
                        response = collection.insert_one(doc_to_insert)
                        
                        inserted_in_file += 1
                    except json.JSONDecodeError as e:
                        print(f"  Warning: Skipping invalid JSON line in {file_path} (line {line_num}): {e}")
                    except Exception as e:
                        print(f"  Error inserting document from {file_path} (line {line_num}): {e}")
                        print(f"  Problematic data: {line.strip()}")

            print(f"  Successfully inserted {inserted_in_file} documents from {file_path}.")
            total_inserted += inserted_in_file
        except FileNotFoundError:
            print(f"  Error: File not found {file_path}")
        except Exception as e:
            print(f"  Error processing file {file_path}: {e}")

    print(f"\nFinished loading data. Total documents inserted: {total_inserted}")

if __name__ == "__main__":
    load_documents() 