require('dotenv').config();

const express = require('express');
const path = require('path');
const { DataAPIClient } = require("@datastax/astra-db-ts");
const { marked } = require('marked'); // If you still render markdown from product/document details
// const fetch = require('node-fetch'); // No longer needed, Node.js v20+ has native fetch

const app = express();
const port = process.env.PORT || 3000;

// Environment variables validation
const { ASTRA_DB_API_ENDPOINT, ASTRA_DB_TOKEN, LANGFLOW_RAG_API_ENDPOINT } = process.env;

if (!ASTRA_DB_API_ENDPOINT || !ASTRA_DB_TOKEN) {
    console.error("Error: ASTRA_DB_API_ENDPOINT and ASTRA_DB_TOKEN must be set in the .env file.");
    process.exit(1);
}

if (!LANGFLOW_RAG_API_ENDPOINT) {
    console.error("Error: LANGFLOW_RAG_API_ENDPOINT must be set in the .env file. This is the full URL to your Langflow RAG flow.");
    process.exit(1);
}

let db;
let productCollection;
let documentCollection;
let productHierarchy = {};
let tagsByFrequency = [];
let docTitleMap = new Map();

// Database initialization and data structure setup (for filters, product details, etc.)
async function initializeDbAndData() {
    console.log("Running DB and Data Initialization for server_4.js...");
    try {
        const client = new DataAPIClient(ASTRA_DB_TOKEN);
        db = client.db(ASTRA_DB_API_ENDPOINT);

        productCollection = await db.collection(process.env.ASTRA_DB_PRODUCT_COLLECTION || 'products');
        documentCollection = await db.collection(process.env.ASTRA_DB_DOCUMENT_COLLECTION || 'documents');
        console.log(`Connected to Astra DB collections: ${productCollection.collectionName}, ${documentCollection.collectionName}`);

        const productCursor = await productCollection.find({}, {
            projection: { family: 1, product_type: 1, tags: 1 }
        });
        const initialProductItems = await productCursor.toArray();
        
        const hierarchy = {};
        const tagCounts = new Map();

        initialProductItems.forEach(item => {
            const family = item.family;
            const productType = item.product_type;
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

        const sortedHierarchy = {};
        Object.keys(hierarchy).sort().forEach(family => {
            sortedHierarchy[family] = {};
            Object.keys(hierarchy[family]).sort().forEach(productType => {
                sortedHierarchy[family][productType] = true;
            });
        });
        productHierarchy = sortedHierarchy;

        tagsByFrequency = Array.from(tagCounts.entries())
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => {
                if (b.count !== a.count) {
                    return b.count - a.count;
                }
                return a.tag.localeCompare(b.tag);
            });

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
        console.log("Initialization complete for server_4.js.");
    } catch (e) {
        console.error("Error during DB connection or initial data build for server_4.js:", e);
        // Keep app running but with potentially missing filter data
    }
}

async function queryLangflowRAG(userQuery) {
    const langflowApiUrl = LANGFLOW_RAG_API_ENDPOINT; // Use the environment variable

    const requestBody = {
        input_value: userQuery,
    };

    console.log(`Calling Langflow RAG API: ${langflowApiUrl} with body: ${JSON.stringify(requestBody)}`);

    try {
        // Native fetch is available in Node.js v20+
        const response = await fetch(langflowApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Langflow API Error (${response.status}): ${errorBody}`);
            return { error: `Langflow API Error: ${response.status} - ${errorBody}`, answer: null };
        }

        const result = await response.json();
        console.log("Raw Langflow RAG Result:", JSON.stringify(result, null, 2));

        let answer = "Sorry, I couldn't retrieve an answer at this moment.";
        let error = null;

        if (result.outputs && result.outputs.length > 0 &&
            result.outputs[0].outputs && result.outputs[0].outputs.length > 0 &&
            result.outputs[0].outputs[0].results &&
            result.outputs[0].outputs[0].results.message &&
            typeof result.outputs[0].outputs[0].results.message.text === 'string') {
          answer = result.outputs[0].outputs[0].results.message.text;
        } else {
          console.warn("Could not find expected answer in the primary path of Langflow RAG response structure. Please check the raw log.");
          error = "Failed to parse answer from Langflow response.";
        }

        return { answer, error };

    } catch (e) {
        console.error("Error calling or parsing Langflow API response:", e);
        return { error: "Error processing the request with Langflow.", answer: null };
    }
}

// Express configuration
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images/products', express.static(path.join(__dirname, 'public/images/products')));
app.use(express.json());

// Routes
app.get('/', (req, res) => {
    res.render('home', { title: 'Kinetic Constructs - Langflow RAG Search' });
});

app.get('/search', async (req, res) => {
    const queryText = req.query.q; // Single query input from the UI
    
    let displayAnswer = null;
    let productsToDisplay = []; // May or may not be used depending on UI design
    let searchError = null;

    if (queryText) {
        const langflowResult = await queryLangflowRAG(queryText);
        displayAnswer = langflowResult.answer;
        searchError = langflowResult.error;
        // If your Langflow flow was modified to also return raw products, extract them here.
        // For now, productsToDisplay will remain empty when using Langflow.
    } else {
        // Optional: Handle case with no query - e.g., show all products or an empty state
        // This might involve a direct DB call if you want to show products without a query.
        // Example: 
        // if (productCollection) {
        //   try {
        //     const cursor = await productCollection.find({}, {limit: 20 }); // Get some default products
        //     productsToDisplay = await cursor.toArray();
        //   } catch (dbError) {
        //     console.error("Error fetching default products:", dbError);
        //     searchError = "Error fetching initial product list.";
        //   }
        // } else {
        //   searchError = "Database not available for initial product list.";
        // }
    }

    // Data for rendering filters and other UI elements, fetched during initialization
    const dynamicTagCounts = new Map(); // Recalculate if productsToDisplay is populated
    if (productsToDisplay.length > 0) {
         productsToDisplay.forEach(product => {
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
        title: 'Search Products - Powered by Langflow',
        products: productsToDisplay, 
        displayAnswer: displayAnswer,
        error: searchError,
        hierarchy: productHierarchy, 
        displayTags: displayTags,    
        currentFamily: req.query.family, // Keep for filter UI consistency
        currentType: req.query.type,   // Keep for filter UI consistency
        currentTags: typeof req.query.tag === 'string' ? [req.query.tag] : (req.query.tag || []), // Keep for filter UI consistency
        queryParams: req.query,
        langflowRagMode: true // New flag for EJS to adjust UI (e.g., show answer section)
    });
});

// Product detail and document API routes (copied from other server files for completeness if needed)
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
            product = await productCollection.findOne({ _id: productId });
            if (product) {
                product.documentation = [];
                if (product.documentation_ids && Array.isArray(product.documentation_ids)) {
                    product.documentation = product.documentation_ids
                        .map(id => ({ id: id, title: docTitleMap.get(id) || id }))
                        .sort((a, b) => a.title.localeCompare(b.title)); 
                }
                if (requestedDocId && product.documentation.some(doc => doc.id === requestedDocId)) {
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

app.get('/api/document/:docId', async (req, res) => {
    const docId = req.params.docId;
    if (!documentCollection) {
        return res.status(503).json({ error: 'Database connection (documents) not available.' });
    }
    try {
        const doc = await documentCollection.findOne({ _id: docId });
        if (!doc) {
            return res.status(404).json({ error: 'Document not found' });
        }
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

// Server startup
initializeDbAndData().then(() => {
    app.listen(port, () => {
        console.log(`Server_4.js (Langflow RAG) listening at http://localhost:${port}`);
        console.log("Ensure Langflow is running and accessible, and that the API endpoint in server_4.js is correctly set.");
    });
}).catch(err => {
    console.error("Failed to initialize database and data before starting server_4.js:", err);
    // Still start the server, but it might not have all UI elements like filters populated
    app.listen(port, () => {
        console.log(`Server_4.js (Langflow RAG) listening at http://localhost:${port}, but DB/data initialization failed.`);
    });
}); 