import os
import json
from dotenv import load_dotenv
from astrapy import DataAPIClient

# Load environment variables from .env file
load_dotenv(override=True)

# --- AstraDB Credentials (Loaded from .env) ---
ASTRA_DB_TOKEN = os.getenv("ASTRA_DB_TOKEN")
ASTRA_DB_API_ENDPOINT = os.getenv("ASTRA_DB_API_ENDPOINT")
ASTRA_CLIENT_KWARGS_JSON = os.getenv("ASTRA_CLIENT_KWARGS")
# --- ---

COLLECTIONS_TO_TRUNCATE = ["products", "documents"] # Add any other collections you want to truncate

if not ASTRA_DB_TOKEN or not ASTRA_DB_API_ENDPOINT:
    print("Error: ASTRA_DB_TOKEN and ASTRA_DB_API_ENDPOINT must be set.")
    print("Please set them in a .env file or ensure they are environment variables.")
    exit(1)

def truncate_collections():
    """Connects to AstraDB and deletes all documents from specified collections."""

    print(f"Connecting to AstraDB: {ASTRA_DB_API_ENDPOINT}")
    client_kwargs = {}
    if ASTRA_CLIENT_KWARGS_JSON:
        try:
            client_kwargs = json.loads(ASTRA_CLIENT_KWARGS_JSON)
            print(f"Using additional client kwargs: {client_kwargs}")
        except json.JSONDecodeError as e:
            print(f"Warning: Could not parse ASTRA_CLIENT_KWARGS as JSON: {e}")
            print(f"         Value was: {ASTRA_CLIENT_KWARGS_JSON}")

    try:
        # Initialize the client
        client = DataAPIClient(ASTRA_DB_TOKEN, **client_kwargs)
        db = client.get_database(ASTRA_DB_API_ENDPOINT)
        print("Successfully connected to the database.")

        for collection_name in COLLECTIONS_TO_TRUNCATE:
            print(f"\nAttempting to truncate collection: '{collection_name}'...")
            try:
                collection = db.get_collection(collection_name)
                print(f"  Connected to collection: '{collection_name}'")

                # Delete all documents in the collection
                # An empty filter {} matches all documents
                delete_result = collection.delete_many({})

                deleted_count = delete_result.deleted_count
                print(f"  Successfully deleted {deleted_count} documents from '{collection_name}'.")

            except Exception as e:
                print(f"  Error truncating collection '{collection_name}': {e}")
                # Optionally, you could decide to stop or continue with other collections

        print("\nFinished truncating specified collections.")

    except Exception as e:
        print(f"An error occurred during the process: {e}")

if __name__ == "__main__":
    # Optional: Add a confirmation step before proceeding
    confirm = input(f"This script will delete ALL data from the collections {COLLECTIONS_TO_TRUNCATE} in database {ASTRA_DB_API_ENDPOINT}.\nAre you sure you want to continue? (yes/no): ")
    if confirm.lower() == 'yes':
        print("Starting truncation process...")
        truncate_collections()
    else:
        print("Truncation cancelled by user.")
