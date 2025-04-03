import json
import os
from pathlib import Path

def create_family_directories():
    """Create directories for each product family if they don't exist."""
    families = {
        "ConstructoBots": "constructobots",
        "LogicLeaps": "logicleaps",
        "ImagiWorlds": "imagiworlds",
        "KinetiKits": "kinetikits",
        "CreatiSpark": "creatispark"
    }
    
    # Create products parent directory
    products_dir = Path("products")
    products_dir.mkdir(exist_ok=True)
    
    # Create family subdirectories
    for family in families.values():
        (products_dir / family).mkdir(exist_ok=True)
    
    return families

def process_product(product):
    """Process a product dictionary to rename category_path to product_type, adjust image_url, and rename id to _id."""
    # Handle id renaming to _id
    if 'id' in product:
        product['_id'] = product['id']
        del product['id']
    
    # Handle category_path
    if 'category_path' in product:
        # Split on ">" and take the second part, stripping whitespace
        category_parts = product['category_path'].split('>')
        if len(category_parts) > 1:
            product['product_type'] = category_parts[1].strip()
        else:
            product['product_type'] = category_parts[0].strip()
        del product['category_path']

    # Handle image_url
    if 'image_url' in product and isinstance(product['image_url'], str):
        try:
            original_path = Path(product['image_url'])
            directory = original_path.parent
            stem = original_path.stem
            
            # Convert stem to lowercase and set extension to .png
            new_filename = f"{stem.lower()}.png"
            
            # Reconstruct the path, ensuring forward slashes
            new_path = directory / new_filename
            product['image_url'] = str(new_path).replace('\\\\', '/') # Ensure forward slashes
        except Exception as e:
            print(f"Warning: Could not process image_url '{product['image_url']}': {e}")

    return product

def split_products_by_family():
    """Split products.jsonl into separate files by family."""
    families = create_family_directories()
    
    # Read all products
    products = []
    with open('products.jsonl', 'r') as f:
        for line in f:
            product = json.loads(line)
            product = process_product(product)
            products.append(product)
    
    # Group products by family
    family_products = {family: [] for family in families.values()}
    
    for product in products:
        family = product.get('family')
        if family in families:
            family_products[families[family]].append(product)
    
    # Write products to family-specific files
    for family, products in family_products.items():
        if products:
            output_file = Path("products") / family / "products.jsonl"
            with open(output_file, 'w') as f:
                for product in products:
                    # Ensure the product is processed before writing
                    processed_product = process_product(product)
                    f.write(json.dumps(processed_product) + '\n')
            print(f"Created {output_file} with {len(products)} products")

if __name__ == "__main__":
    try:
        split_products_by_family()
        print("Successfully split products by family!")
    except Exception as e:
        print(f"An error occurred: {str(e)}") 