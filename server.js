require('dotenv').config();

// --- Add debugging ---
console.log("Dotenv loaded.");
console.log('ASTRA_DB_API_ENDPOINT:', process.env.ASTRA_DB_API_ENDPOINT);
console.log('ASTRA_DB_TOKEN:', process.env.ASTRA_DB_TOKEN ? 'Token loaded (masked)' : 'Token NOT loaded');
// --- End debugging ---

const express = require('express');
const path = require('path');
const { DataAPIClient } = require("@datastax/astra-db-ts");
const { marked } = require('marked');

const app = express();
const port = process.env.PORT || 3000;

// --- Astra DB Configuration ---
const { ASTRA_DB_API_ENDPOINT, ASTRA_DB_TOKEN, ASTRA_DB_COLLECTION } = process.env;

if (!ASTRA_DB_API_ENDPOINT || !ASTRA_DB_TOKEN) {
    console.error("Error: ASTRA_DB_API_ENDPOINT and ASTRA_DB_TOKEN must be set in the .env file.");
    process.exit(1);
}

const collectionName = ASTRA_DB_COLLECTION || 'products'; // Default to 'products'

let db;
let productCollection;
let documentCollection;
let productHierarchy = {};
let tagsByFrequency = [];
let docTitleMap = new Map(); // Map to store DocID -> DocTitle

// Updated initialization function name and logic
async function initializeDbAndData() {
    console.log("Running DB and Data Initialization...");
    try {
        // Connect to DB
        const client = new DataAPIClient(ASTRA_DB_TOKEN);
        db = client.db(ASTRA_DB_API_ENDPOINT);
        // Get both collections
        productCollection = await db.collection(process.env.ASTRA_DB_PRODUCT_COLLECTION || 'products');
        documentCollection = await db.collection(process.env.ASTRA_DB_DOCUMENT_COLLECTION || 'documents');
        console.log(`Connected to Astra DB collections: ${productCollection.collectionName}, ${documentCollection.collectionName}`);

        // Fetch product data for hierarchy/tags
        console.log('Fetching data from products collection...');
        const productCursor = await productCollection.find({}, {
            projection: { family: 1, product_type: 1, tags: 1 }
        });
        const initialProductItems = await productCursor.toArray();
        console.log(`Fetched ${initialProductItems.length} product items.`);
        
        // Build hierarchy and count tags
        console.log('Building hierarchy and counting tags from DB data...');
        const hierarchy = {};
        const tagCounts = new Map(); // Use a Map for counts

        initialProductItems.forEach(item => {
            const family = item.family;
            const productType = item.product_type;

            // Skip unwanted types
            if (!family || !productType || productType === 'Consumables' || productType === 'Accessory') {
                return; // Skip this item
            }

            if (!hierarchy[family]) {
                hierarchy[family] = {};
            }
            hierarchy[family][productType] = true; // Store types as keys for uniqueness

            // --- Tag counting ---
            if (item.tags && Array.isArray(item.tags)) {
                item.tags.forEach(tag => {
                    tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
                });
            }
            // --- End tag counting ---
        });

        // Sort families and product types alphabetically
        const sortedHierarchy = {};
        Object.keys(hierarchy).sort().forEach(family => {
            sortedHierarchy[family] = {};
            Object.keys(hierarchy[family]).sort().forEach(productType => {
                sortedHierarchy[family][productType] = true;
            });
        });
        productHierarchy = sortedHierarchy;
        console.log('Product hierarchy built.');

        // Convert Map to array, sort by count (desc), then alphabetically for ties
        tagsByFrequency = Array.from(tagCounts.entries())
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => {
                if (b.count !== a.count) {
                    return b.count - a.count; // Sort by count descending
                }
                return a.tag.localeCompare(b.tag); // Sort alphabetically for ties
            });
        console.log(`Counted and sorted ${tagsByFrequency.length} unique tags by frequency.`);

        // Fetch document titles
        console.log('Fetching document titles...');
        const docCursor = await documentCollection.find({}, {
            projection: { _id: 1, title: 1 }
        });
        const docTitles = await docCursor.toArray();
        docTitleMap.clear(); // Clear previous map
        docTitles.forEach(doc => {
            if (doc._id && doc.title) {
                docTitleMap.set(doc._id, doc.title);
            }
        });
        console.log(`Mapped ${docTitleMap.size} document titles.`);

    } catch (e) {
        console.error("Error during DB connection or initial data build:", e);
        db = null;
        productCollection = null;
        documentCollection = null;
        productHierarchy = {};
        tagsByFrequency = []; // Ensure empty on error
        docTitleMap.clear(); 
    }
    console.log("Initialization complete.");
}

// --- Express App Setup ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files (CSS, images)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images/products', express.static(path.join(__dirname, 'public/images/products'))); // Serve copied images
app.use(express.json()); // Needed to parse request body if we used POST later

// --- Routes ---

// Home Page - Reverted to simple render
app.get('/', (req, res) => {
    res.render('home', { title: 'Welcome' });
});

// Search Page (Handles Text Search + Filtering)
app.get('/search', async (req, res) => {
    const queryText = req.query.q; // Text search query
    const requestedFamily = req.query.family;
    const requestedType = req.query.type;
    let requestedTags = req.query.tag || [];
    if (typeof requestedTags === 'string') requestedTags = [requestedTags];
    
    const minSimilarity = 0.7; // Re-added similarity threshold
    let products = [];
    let error = null;

    if (!productCollection) {
        error = "Database connection error.";
    } else {
        try {
            // --- Build Filter Object (Always) ---
            const filterConditions = [];
            if (requestedFamily) {
                const familyTypeFilter = { family: requestedFamily };
                if (requestedType) {
                    familyTypeFilter.product_type = requestedType;
                }
                filterConditions.push(familyTypeFilter);
            }
            if (requestedTags.length > 0) {
                filterConditions.push({ tags: { $all: requestedTags } });
            }

            let filter = {};
            if (filterConditions.length > 1) { 
                filter = { $and: filterConditions }; 
            } else if (filterConditions.length === 1) { 
                filter = filterConditions[0]; 
            }
            // filter remains {} if no metadata filters specified

            // --- Build Options Object ---
            const options = {};
            if (queryText) {
                console.log(`Adding text search options for: "${queryText}"`);
                options.limit = 25;
                options.sort = { $hybrid: queryText };
                options.hybridLimits = 50;
            }

            // --- Single Find Call ---           
            console.log(`Querying products with filter: ${JSON.stringify(filter)} and options: ${JSON.stringify(options)}`);
            
            if (queryText) {
                const cursor = await productCollection.findAndRerank(filter, options);
                const rankedResults = await cursor.toArray(); // This is RankedResult[]
                // Extract the document from each RankedResult
                products = rankedResults.map(result => result.document);
                console.log(`findAndRerank returned ${products.length} results.`);
            } else {
                const cursor = await productCollection.find(filter, options);
                products = await cursor.toArray(); // This is a list of our product objects directly
                console.log(`find returned ${products.length} results.`);
            }
            
        } catch (e) { 
            console.error("Error during search:", e); 
            error = "Could not retrieve products.";
            products = [];
        }
    }

    // --- Dynamic Tag Counts & Hierarchy (based on final filtered results) --- 
    const dynamicTagCounts = new Map();
    const displayHierarchy = {}; 
    if (!error) {
        products.forEach(product => {
            // Count Tags
            if (product.tags && Array.isArray(product.tags)) {
                product.tags.forEach(tag => dynamicTagCounts.set(tag, (dynamicTagCounts.get(tag) || 0) + 1));
            }
            // Build Dynamic Hierarchy
            const family = product.family;
            const productType = product.product_type;
            if (family && productType && productType !== 'Consumables' && productType !== 'Accessory') {
                if (!displayHierarchy[family]) {
                    displayHierarchy[family] = {};
                }
                displayHierarchy[family][productType] = true; 
            }
        });
    }
    const displayTags = tagsByFrequency.map(tagInfo => ({
        tag: tagInfo.tag,
        dynamicCount: dynamicTagCounts.get(tagInfo.tag) || 0
    }));
    // --- End Dynamic Calculations --- 

    res.render('search', { 
        title: queryText ? `Search Results for "${queryText}"` : 'Search Products',
        products: products, 
        error: error, 
        hierarchy: displayHierarchy, 
        displayTags: displayTags, 
        currentFamily: requestedFamily,
        currentType: requestedType,
        currentTags: requestedTags,
        queryParams: req.query 
    });
});

// Product Detail Page
app.get('/product/:productId', async (req, res) => {
    const productId = req.params.productId;
    const searchQueryParams = req.query; // Capture the incoming query params
    const requestedDocId = req.query.doc; // Get requested doc ID from query

    let product = null;
    let initialDocContent = null; // Variable to hold initial doc content
    let initialDocTitle = null;
    let error = null;

    if (!productCollection || !documentCollection) { // Check both collections
        error = "Database connection error.";
    } else {
        try {
            console.log(`Fetching product with _id: ${productId}`);
            product = await productCollection.findOne({ _id: productId });
            
            if (product) {
                // Add document titles to the product object
                product.documentation = [];
                if (product.documentation_ids && Array.isArray(product.documentation_ids)) {
                    product.documentation = product.documentation_ids
                        .map(id => ({ id: id, title: docTitleMap.get(id) || id }))
                        .sort((a, b) => a.title.localeCompare(b.title)); 
                }

                // Fetch initial document content if doc ID is provided and valid
                if (requestedDocId && product.documentation.some(doc => doc.id === requestedDocId)) {
                    console.log(`Fetching initial document content for docId: ${requestedDocId}`);
                    const docData = await documentCollection.findOne({ _id: requestedDocId }, {
                        projection: { content: 1, title: 1 } // Fetch content and title
                    });
                    if (docData && docData.content) {
                        initialDocContent = marked(docData.content); // Render markdown
                        initialDocTitle = docData.title || requestedDocId; // Use title or ID
                    } else {
                        console.warn(`Initial document ${requestedDocId} not found or has no content.`);
                        // Optional: could set an error message specific to doc loading
                    }
                }
            } else {
                error = "Product not found.";
            }
        } catch(e) {
            console.error(`Error fetching product ${productId} or document ${requestedDocId}:`, e);
            error = "Could not retrieve product details or document.";
        }
    }

    res.render('product', { 
        title: product ? product.name : 'Product Not Found',
        product: product,
        error: error,
        script: '/js/product-detail.js',
        searchParams: searchQueryParams,
        initialDocContent: initialDocContent, // Pass initial content
        initialDocTitle: initialDocTitle,     // Pass initial title
        initialDocId: requestedDocId          // Pass the requested ID for potential highlighting
    });
});

// --- API Route for Document Content ---
app.get('/api/document/:docId', async (req, res) => {
    const docId = req.params.docId;
    if (!documentCollection) {
        return res.status(503).json({ error: 'Database connection (documents) not available.' });
    }
    try {
        console.log(`Fetching document with _id: ${docId}`);
        // Fetch the specific document by _id
        const doc = await documentCollection.findOne({ _id: docId });

        if (!doc) {
            return res.status(404).json({ error: 'Document not found' });
        }

        // Check format and parse Markdown if applicable
        let htmlContent = '';
        if (doc.format && doc.format.toLowerCase() === 'markdown' && doc.text) {
            htmlContent = marked.parse(doc.text); // Use marked to convert MD to HTML
        } else {
            // Handle other formats or just return plain text (escaped)
            htmlContent = `<pre>${doc.text || 'No content found.'}</pre>`;
        }

        res.json({
            title: doc.title || 'Document',
            htmlContent: htmlContent
        });

    } catch (e) {
        console.error(`Error fetching document ${docId}:`, e);
        res.status(500).json({ error: 'Failed to retrieve document content.' });
    }
});

// --- Start Server ---
// Use the updated initialization function
initializeDbAndData().then(() => { // Renamed function call
    app.listen(port, () => {
        console.log(`Server listening at http://localhost:${port}`);
    });
}).catch(err => {
    console.error("Failed to initialize database and data before starting server:", err);
    app.listen(port, () => {
        console.log(`Server listening at http://localhost:${port}, but initialization failed.`);
    });
}); 