# Kinetic Constructs - Product Catalog Web App

This is a simple Node.js web application that displays products from an Astra DB collection.

## Prerequisites

*   Node.js and npm (or yarn)
*   Access to an Astra DB instance

## Setup

1.  **Clone the repository (if applicable):**
    ```bash
    git clone <repository-url>
    cd <repository-directory>
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```
    or
    ```bash
    yarn install
    ```

3.  **Configure Astra DB Connection:**
    *   Create a `.env` file in the root directory.
    *   Add your Astra DB credentials to the `.env` file:
        ```dotenv
        ASTRA_DB_ENDPOINT="your_astra_db_api_endpoint"
        ASTRA_DB_TOKEN="your_astra_db_application_token"

        # Optional: Specify a different collection name
        # ASTRA_DB_COLLECTION="your_product_collection_name"
        ```
    *   Replace placeholders with your actual Astra DB endpoint and application token (ensure the token starts with `AstraCS:...`).
    *   Ensure your Astra DB has a collection named `products` (or the name specified in `ASTRA_DB_COLLECTION`) populated with product data similar to the structure found in the `products/**/*.jsonl` files.

## Running the Application

1.  **Start the server:**
    ```bash
    node server.js
    ```

2.  Open your web browser and navigate to `http://localhost:3000` (or the port specified in the console output).

## Project Structure

*   `server.js`: The main application file (Express server, Astra DB connection, routing).
*   `views/`: Contains EJS template files.
    *   `products.ejs`: Template to display the product list.
*   `public/`: Contains static assets.
    *   `css/style.css`: Stylesheet for the application.
*   `products/`: Contains example data and images. Product images are served directly from here.
*   `.env`: Stores environment variables (Astra DB credentials). **(Not committed to Git)**
*   `.gitignore`: Specifies intentionally untracked files that Git should ignore.
*   `package.json`, `package-lock.json`: Node.js project configuration and dependency lock file.
