import os
import json
import glob
from dotenv import load_dotenv
from astrapy import DataAPIClient
from create_astra_collection import create_collection_if_not_exists

load_dotenv()

ASTRA_DB_APPLICATION_TOKEN = os.getenv("ASTRA_DB_APPLICATION_TOKEN") 
ASTRA_DB_API_ENDPOINT = os.getenv("ASTRA_DB_API_ENDPOINT")

ASTRA_DB_COLLECTION = "documents"

if not ASTRA_DB_APPLICATION_TOKEN or not ASTRA_DB_API_ENDPOINT:
    print("Error: ASTRA_DB_APPLICATION_TOKEN and ASTRA_DB_API_ENDPOINT must be set in the .env file.")
    exit(1)

def load_documents():
    """Finds document JSONL files, connects to AstraDB, and loads the data."""

    print(f"Connecting to AstraDB: {ASTRA_DB_API_ENDPOINT}")
    client = DataAPIClient(ASTRA_DB_APPLICATION_TOKEN)
    db = client.get_database(ASTRA_DB_API_ENDPOINT)

    is_lexical, collection_name = create_collection_if_not_exists(db, ASTRA_DB_COLLECTION)
    text_field_name = '$hybrid' if is_lexical else '$vectorize'
    
    collection = db.get_collection(collection_name)
    print(f"Connected to collection: '{collection_name}'")

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
                for line_num, line in enumerate(f, 1):
                    try:
                        doc_data = json.loads(line.strip())
                        
                        doc_to_insert = doc_data.copy()                       
                        if 'text' in doc_to_insert and doc_to_insert['text']:
                            doc_to_insert[text_field_name] = doc_to_insert['text']
                        else:
                            print(f"  Warning: 'text' field missing or empty in document from {file_path} (line {line_num}), '{text_field_name}' field will not be generated for this doc.")

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