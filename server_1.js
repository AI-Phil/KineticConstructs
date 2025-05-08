require('dotenv').config();

// Log environment configuration status
console.log("Dotenv loaded.");
console.log('ASTRA_DB_API_ENDPOINT:', process.env.ASTRA_DB_API_ENDPOINT);
console.log('ASTRA_DB_TOKEN:', process.env.ASTRA_DB_TOKEN ? 'Token loaded (masked)' : 'Token NOT loaded');

const express = require('express');
const path = require('path');
const { DataAPIClient } = require("@datastax/astra-db-ts");
const { marked } = require('marked');

const app = express();
const port = process.env.PORT || 3000;

// Environment variables validation
const { ASTRA_DB_API_ENDPOINT, ASTRA_DB_TOKEN, ASTRA_DB_COLLECTION } = process.env;

if (!ASTRA_DB_API_ENDPOINT || !ASTRA_DB_TOKEN) {
    console.error("Error: ASTRA_DB_API_ENDPOINT and ASTRA_DB_TOKEN must be set in the .env file.");
    process.exit(1);
}

const collectionName = ASTRA_DB_COLLECTION || 'products';

let db;
let productCollection;
let documentCollection;
let productHierarchy = {};
let tagsByFrequency = [];
let docTitleMap = new Map(); // Maps document IDs to their titles for quick lookup

// Database initialization and data structure setup
async function initializeDbAndData() {
    console.log("Running DB and Data Initialization...");
    try {
        const client = new DataAPIClient(ASTRA_DB_TOKEN);
        db = client.db(ASTRA_DB_API_ENDPOINT);

        productCollection = await db.collection(process.env.ASTRA_DB_PRODUCT_COLLECTION || 'products');
        documentCollection = await db.collection(process.env.ASTRA_DB_DOCUMENT_COLLECTION || 'documents');
        console.log(`Connected to Astra DB collections: ${productCollection.collectionName}, ${documentCollection.collectionName}`);

        // Fetch and process product data
        console.log('Fetching data from products collection...');
        const productCursor = await productCollection.find({}, {
            projection: { family: 1, product_type: 1, tags: 1 }
        });
        const initialProductItems = await productCursor.toArray();
        console.log(`Fetched ${initialProductItems.length} product items.`);
        
        // Build product hierarchy and tag frequency map
        console.log('Building hierarchy and counting tags from DB data...');
        const hierarchy = {};
        const tagCounts = new Map();

        initialProductItems.forEach(item => {
            const family = item.family;
            const productType = item.product_type;

            // Skip non-product items
            if (!family || !productType || productType === 'Consumables' || productType === 'Accessory') {
                return;
            }

            if (!hierarchy[family]) {
                hierarchy[family] = {};
            }
            hierarchy[family][productType] = true;

            if (item.tags && Array.isArray(item.tags)) {
                item.tags.forEach(tag => {
                    tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
                });
            }
        });

        // Sort hierarchy alphabetically for consistent display
        const sortedHierarchy = {};
        Object.keys(hierarchy).sort().forEach(family => {
            sortedHierarchy[family] = {};
            Object.keys(hierarchy[family]).sort().forEach(productType => {
                sortedHierarchy[family][productType] = true;
            });
        });
        productHierarchy = sortedHierarchy;
        console.log('Product hierarchy built.');

        // Sort tags by frequency (descending) and alphabetically for ties
        tagsByFrequency = Array.from(tagCounts.entries())
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => {
                if (b.count !== a.count) {
                    return b.count - a.count;
                }
                return a.tag.localeCompare(b.tag);
            });
        console.log(`Counted and sorted ${tagsByFrequency.length} unique tags by frequency.`);

        // Cache document titles for quick lookup
        console.log('Fetching document titles...');
        const docCursor = await documentCollection.find({}, {
            projection: { _id: 1, title: 1 }
        });
        const docTitles = await docCursor.toArray();
        docTitleMap.clear();
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
        tagsByFrequency = [];
        docTitleMap.clear(); 
    }
    console.log("Initialization complete.");
}

// Express configuration
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images/products', express.static(path.join(__dirname, 'public/images/products')));
app.use(express.json());

// Routes
app.get('/', (req, res) => {
    res.render('home', { title: 'Welcome' });
});

// Search endpoint with filtering capabilities
app.get('/search', async (req, res) => {
    const requestedFamily = req.query.family;
    const requestedType = req.query.type;
    let requestedTags = req.query.tag || [];
    if (typeof requestedTags === 'string') requestedTags = [requestedTags];
    const semanticQuery = req.query.q;

    // Build compound filter for family/type and tags
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

    let options = {};
    if (semanticQuery) {        
        options.sort = { $vectorize: semanticQuery };
        options.limit = 25;
    }

    let products = [];
    let error = null;

    if (!productCollection) {
        error = "Database connection error.";
    } else {
        try {
            console.log(`Querying products with filter: ${JSON.stringify(filter)} and options: ${JSON.stringify(options)}`);
            const cursor = await productCollection.find(filter, options);
            products = await cursor.toArray();
            console.log(`Fetched ${products.length} products.`);
        } catch (e) {
            console.error("Error fetching products:", e);
            error = "Could not retrieve products.";
            products = [];
        }
    }

    // Calculate tag frequencies for current result set
    const dynamicTagCounts = new Map();
    if (!error) {
        products.forEach(product => {
            if (product.tags && Array.isArray(product.tags)) {
                product.tags.forEach(tag => dynamicTagCounts.set(tag, (dynamicTagCounts.get(tag) || 0) + 1));
            }
        });
    }

    const displayTags = tagsByFrequency.map(tagInfo => ({
        tag: tagInfo.tag,
        dynamicCount: dynamicTagCounts.get(tagInfo.tag) || 0
    }));

    res.render('search', {
        title: 'Search Products',
        products: products,
        error: error,
        hierarchy: productHierarchy,
        displayTags: displayTags,
        currentFamily: requestedFamily,
        currentType: requestedType,
        currentTags: requestedTags,
        queryParams: req.query,
        semanticSearchEnabled: true,
        keywordSearchEnabled: false
    });
});

// Product detail page with optional initial document loading
app.get('/product/:productId', async (req, res) => {
    const productId = req.params.productId;
    const searchQueryParams = req.query;
    const requestedDocId = req.query.doc;

    let product = null;
    let initialDocContent = null;
    let initialDocTitle = null;
    let error = null;

    if (!productCollection || !documentCollection) {
        error = "Database connection error.";
    } else {
        try {
            console.log(`Fetching product with _id: ${productId}`);
            product = await productCollection.findOne({ _id: productId });
            
            if (product) {
                // Attach document metadata to product
                product.documentation = [];
                if (product.documentation_ids && Array.isArray(product.documentation_ids)) {
                    product.documentation = product.documentation_ids
                        .map(id => ({ id: id, title: docTitleMap.get(id) || id }))
                        .sort((a, b) => a.title.localeCompare(b.title)); 
                }

                // Load initial document if specified
                if (requestedDocId && product.documentation.some(doc => doc.id === requestedDocId)) {
                    console.log(`Fetching initial document content for docId: ${requestedDocId}`);
                    const docData = await documentCollection.findOne({ _id: requestedDocId }, {
                        projection: { content: 1, title: 1 }
                    });
                    if (docData && docData.content) {
                        initialDocContent = marked(docData.content);
                        initialDocTitle = docData.title || requestedDocId;
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
        initialDocContent: initialDocContent,
        initialDocTitle: initialDocTitle,
        initialDocId: requestedDocId
    });
});

// Document content API endpoint
app.get('/api/document/:docId', async (req, res) => {
    const docId = req.params.docId;
    if (!documentCollection) {
        return res.status(503).json({ error: 'Database connection (documents) not available.' });
    }
    try {
        console.log(`Fetching document with _id: ${docId}`);
        const doc = await documentCollection.findOne({ _id: docId });

        if (!doc) {
            return res.status(404).json({ error: 'Document not found' });
        }

        // Convert markdown to HTML if applicable
        let htmlContent = '';
        if (doc.format && doc.format.toLowerCase() === 'markdown' && doc.text) {
            htmlContent = marked.parse(doc.text);
        } else {
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

// Server startup with database initialization
initializeDbAndData().then(() => {
    app.listen(port, () => {
        console.log(`Server listening at http://localhost:${port}`);
    });
}).catch(err => {
    console.error("Failed to initialize database and data before starting server:", err);
    app.listen(port, () => {
        console.log(`Server listening at http://localhost:${port}, but initialization failed.`);
    });
}); 