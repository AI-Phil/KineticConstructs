import json
from pathlib import Path

def load_jsonl(file_path):
    """Load a JSONL file and return a list of dictionaries."""
    items = []
    with open(file_path, 'r') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:  # Skip empty lines
                continue
            try:
                items.append(json.loads(line))
            except json.JSONDecodeError as e:
                print(f"\nError in {file_path} at line {line_num}:")
                print(f"Line content: {line}")
                print(f"Error message: {str(e)}")
                print(f"Position: {e.pos}")
                if e.lineno:
                    print(f"Line number: {e.lineno}")
                if e.colno:
                    print(f"Column number: {e.colno}")
                print("-" * 80)
                raise
    return items

def validate_jsonl(file_path):
    """Validate JSONL file format and content."""
    print(f"\nValidating {file_path}...")
    try:
        items = load_jsonl(file_path)
        print(f"Successfully loaded {len(items)} items")
        
        # Check for required fields based on file type
        if "products.jsonl" in str(file_path):
            required_fields = {'id', 'name', 'documentation_ids'}
        else:  # documents.jsonl
            required_fields = {'doc_id', 'title', 'text', 'product_id'}
            
        # Validate each item
        for i, item in enumerate(items, 1):
            missing_fields = required_fields - set(item.keys())
            if missing_fields:
                print(f"\nError in {file_path} at item {i}:")
                print(f"Missing required fields: {missing_fields}")
                print(f"Item content: {item}")
                print("-" * 80)
                
        return True
    except Exception as e:
        print(f"\nFailed to validate {file_path}: {str(e)}")
        return False

def check_missing_docs(directory):
    """Check for missing documentation in the specified directory."""
    # Construct paths
    products_path = Path(directory) / "products.jsonl"
    docs_path = Path(directory) / "documents.jsonl"
    
    # Validate files first
    if not validate_jsonl(products_path) or not validate_jsonl(docs_path):
        print("\nValidation failed. Please fix the JSON formatting issues before proceeding.")
        return
    
    # Load products and documents
    products = load_jsonl(products_path)
    documents = load_jsonl(docs_path)
    
    # Create set of existing document IDs
    existing_doc_ids = {doc['doc_id'] for doc in documents}
    
    # Check each product's documentation
    missing_docs = []
    for product in products:
        product_id = product['id']
        required_docs = product.get('documentation_ids', [])
        
        for doc_id in required_docs:
            if doc_id not in existing_doc_ids:
                missing_docs.append({
                    'product_id': product_id,
                    'product_name': product['name'],
                    'missing_doc_id': doc_id
                })
    
    # Print results
    if missing_docs:
        print(f"\nMissing documentation in {directory}:")
        print("-" * 80)
        for item in missing_docs:
            print(f"Product: {item['product_name']} ({item['product_id']})")
            print(f"Missing: {item['missing_doc_id']}")
            print("-" * 80)
        print(f"\nTotal missing documents: {len(missing_docs)}")
    else:
        print(f"\nAll documentation present in {directory}!")

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) != 2:
        print("Usage: python check_docs.py <directory>")
        print("Example: python check_docs.py products/constructobots")
        sys.exit(1)
    
    directory = sys.argv[1]
    if not Path(directory).exists():
        print(f"Error: Directory '{directory}' does not exist")
        sys.exit(1)
    
    check_missing_docs(directory) 