import os
import logging
from astrapy.info import CollectionDefinition
from astrapy.constants import VectorMetric
from astrapy.database import Database

def create_collection_if_not_exists(db: Database, collection_name: str) -> tuple[bool, str]:
    """
    Creates a collection if it doesn't exist.
    Checks for reranking provider availability as a proxy for attempting lexical indexing.
    Inspects existing collections for their lexical configuration.
    Returns a tuple of (lexical_indexing_active, collection_name).
    """
    collection_names = db.list_collection_names()

    if collection_name in collection_names:
        print(f"Collection '{collection_name}' already exists. Inspecting its configuration...")
        try:
            lexical_config = db.get_collection(collection_name).options().lexical
            if lexical_config and lexical_config.enabled:
                print(f"Existing collection '{collection_name}' has lexical indexing configured.")
                return True, collection_name
            print(f"Existing collection '{collection_name}' does not appear to have lexical indexing configured.")
            return False, collection_name
        except Exception as e:
            print(f"Warning: Could not reliably inspect existing collection '{collection_name}': {e}. Assuming no lexical indexing.")
            return False, collection_name

    print(f"Collection '{collection_name}' not found. Preparing to create it...")

    ASTRA_DB_INTEGRATION_OPENAI_KEY_NAME = os.getenv("ASTRA_DB_INTEGRATION_OPENAI_KEY_NAME")
    if not ASTRA_DB_INTEGRATION_OPENAI_KEY_NAME:
        print("Error: ASTRA_DB_INTEGRATION_OPENAI_KEY_NAME must be set for collection creation.")
        exit(1)

    has_reranking_providers = False # Initialize
    original_log_level = logging.getLogger().getEffectiveLevel()
    try:
        # Store original logging level and temporarily disable logging
        logging.getLogger().setLevel(logging.ERROR)
        db_admin = db.get_database_admin()
        reranking_providers_result = db_admin.find_reranking_providers()
        has_reranking_providers = bool(reranking_providers_result and reranking_providers_result.reranking_providers)
    except Exception:
        has_reranking_providers = False
    finally:
        logging.getLogger().setLevel(original_log_level)

    collection_definition = (
        CollectionDefinition.builder()
        .set_vector_dimension(1536)
        .set_vector_metric(VectorMetric.DOT_PRODUCT)
        .set_vector_service(
            provider="openai",
            model_name="text-embedding-3-small",
            authentication={
                "providerKey": ASTRA_DB_INTEGRATION_OPENAI_KEY_NAME,
            },
            # parameters={
            #     "organizationId": "ORGANIZATION_ID",
            #     "projectId": "PROJECT_ID",
            # },
        )
    )

    if has_reranking_providers:
        lexical_options = {
            "tokenizer": {"name": "standard", "args": {}},
            "filters": [
                {"name": "lowercase"},
                {"name": "stop"},
                {"name": "porterstem"},
                {"name": "asciifolding"},
            ],
        }
        collection_definition = collection_definition.set_lexical(lexical_options)

    db.create_collection(
        collection_name,
        definition=collection_definition,
    )    
    print(f"Collection '{collection_name}' created successfully with {'lexical' if has_reranking_providers else 'vector'} indexing and OpenAI embeddings.")
    return has_reranking_providers, collection_name
