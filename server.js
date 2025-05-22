require('dotenv').config();

// Log environment configuration status
console.log("Dotenv loaded.");
console.log('ASTRA_DB_API_ENDPOINT:', process.env.ASTRA_DB_API_ENDPOINT);
console.log('ASTRA_DB_TOKEN:', process.env.ASTRA_DB_TOKEN ? 'Token loaded (masked)' : 'Token NOT loaded');

const express = require('express');
const path = require('path');
const { DataAPIClient } = require("@datastax/astra-db-ts");
const { marked } = require('marked');
const yaml = require('js-yaml');
const fs = require('fs');

// --- Langflow-Chatbot Package Integration ---
const { LangflowProxyService } = require('langflow-chatbot/langflow-proxy'); 
const LANGFLOW_PROXY_API_BASE_PATH = '/api/langflow';
// --- END Langflow-Chatbot Package Integration ---

const app = express();
const port = process.env.PORT || 3000;

// Environment variables validation
const {
    ASTRA_DB_API_ENDPOINT,
    ASTRA_DB_TOKEN,
    ASTRA_DB_COLLECTION, 
} = process.env;

if (!ASTRA_DB_API_ENDPOINT || !ASTRA_DB_TOKEN) {
    console.error("Error: ASTRA_DB_API_ENDPOINT and ASTRA_DB_TOKEN must be set in the .env file.");
    process.exit(1);
}

// --- Langflow-Chatbot Proxy Initialization ---
let langflowProxy;
let mainChatbotProfileInfoForEJS; // To pass to EJS templates globally

try {
    const chatbotYamlPath = path.resolve(process.cwd(), 'langflow-chatbot.yaml');
    if (!fs.existsSync(chatbotYamlPath)) {
        throw new Error(`langflow-chatbot.yaml not found at ${chatbotYamlPath}`);
    }
    const parsedChatbotYamlConfig = yaml.load(fs.readFileSync(chatbotYamlPath, 'utf8'));
    console.log("Successfully loaded langflow-chatbot.yaml");

    // Expecting a top-level 'profiles' array in langflow-chatbot.yaml
    if (!parsedChatbotYamlConfig || !parsedChatbotYamlConfig.profiles || parsedChatbotYamlConfig.profiles.length === 0) {
        throw new Error("No profiles defined in langflow-chatbot.yaml or format is incorrect. Expected a top-level 'profiles' array.");
    }

    // Use the first profile for general EJS context if needed
    const firstProfile = parsedChatbotYamlConfig.profiles[0];
    if (!firstProfile || !firstProfile.profileId) {
        throw new Error("The first profile in langflow-chatbot.yaml is missing or lacks a profileId.");
    }
    mainChatbotProfileInfoForEJS = {
        profileId: firstProfile.profileId,
        widgetTitle: firstProfile.chatbot?.labels?.widgetTitle || "Chat with Us" 
    };
    console.log(`Using chatbot profile with profileId '${mainChatbotProfileInfoForEJS.profileId}' as default for EJS context.`);

    const proxyInitConfig = {
        instanceConfigPath: chatbotYamlPath, 
        proxyApiBasePath: LANGFLOW_PROXY_API_BASE_PATH 
    };
    langflowProxy = new LangflowProxyService(proxyInitConfig);
    console.log("LangflowProxyService instance created.");

} catch (error) {
    console.error("CRITICAL - Failed to load langflow-chatbot.yaml or initialize LangflowProxyService instance:", error);
    process.exit(1);
}
// --- END Langflow-Chatbot Proxy Initialization ---

// --- Setup app.locals for global EJS template data ---
app.locals.langflowProxyApiBasePath = LANGFLOW_PROXY_API_BASE_PATH; 
app.locals.siteTitle = "Astra Product Catalog"; 
if (mainChatbotProfileInfoForEJS) {
    app.locals.defaultChatbotProfileInfo = mainChatbotProfileInfoForEJS;
}
// --- END Setup app.locals ---


const collectionName = ASTRA_DB_COLLECTION || 'products';

let db;
let productCollection;
let documentCollection;
let productHierarchy = {};
let tagsByFrequency = [];
let docTitleMap = new Map(); 

async function initializeDbAndData() {
    console.log("Running DB and Data Initialization...");
    try {
        const client = new DataAPIClient(ASTRA_DB_TOKEN);
        db = client.db(ASTRA_DB_API_ENDPOINT);

        productCollection = await db.collection(process.env.ASTRA_DB_PRODUCT_COLLECTION || 'products');
        documentCollection = await db.collection(process.env.ASTRA_DB_DOCUMENT_COLLECTION || 'documents');
        console.log(`Connected to Astra DB collections: ${productCollection.collectionName}, ${documentCollection.collectionName}`);

        console.log('Fetching data from products collection...');
        const productCursor = await productCollection.find({}, {
            projection: { family: 1, product_type: 1, tags: 1 }
        });
        const initialProductItems = await productCursor.toArray();
        console.log(`Fetched ${initialProductItems.length} product items.`);

        console.log('Building hierarchy and counting tags from DB data...');
        const hierarchy = {};
        const tagCounts = new Map();
        initialProductItems.forEach(item => {
            const family = item.family;
            const productType = item.product_type;
            if (!family || !productType || productType === 'Consumables' || productType === 'Accessory') return;
            if (!hierarchy[family]) hierarchy[family] = {};
            hierarchy[family][productType] = true;
            if (item.tags && Array.isArray(item.tags)) {
                item.tags.forEach(tag => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1));
            }
        });
        const sortedHierarchy = {};
        Object.keys(hierarchy).sort().forEach(family => {
            sortedHierarchy[family] = {};
            Object.keys(hierarchy[family]).sort().forEach(productType => sortedHierarchy[family][productType] = true);
        });
        productHierarchy = sortedHierarchy;
        console.log('Product hierarchy built.');
        tagsByFrequency = Array.from(tagCounts.entries())
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count !== a.count ? b.count - a.count : a.tag.localeCompare(b.tag));
        console.log(`Counted and sorted ${tagsByFrequency.length} unique tags by frequency.`);

        console.log('Fetching document titles...');
        const docCursor = await documentCollection.find({}, { projection: { _id: 1, title: 1 } });
        const docTitles = await docCursor.toArray();
        docTitleMap.clear();
        docTitles.forEach(doc => { if (doc._id && doc.title) docTitleMap.set(doc._id, doc.title); });
        console.log(`Mapped ${docTitleMap.size} document titles.`);

        if (langflowProxy && typeof langflowProxy.initializeFlows === 'function') {
            console.log("Initializing LangflowProxyService flow mappings...");
            await langflowProxy.initializeFlows();
            console.log("LangflowProxyService flow mappings initialized successfully.");
        } else {
            console.error("LangflowProxyService not instantiated or initializeFlows not available. Cannot initialize flows. Chatbot may not function correctly.");
        }

    } catch (e) {
        console.error("Error during DB connection or initial data build:", e);
        db = null; productCollection = null; documentCollection = null;
        productHierarchy = {}; tagsByFrequency = []; docTitleMap.clear();
    }
    console.log("Initialization complete.");
}

// Express configuration
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images/products', express.static(path.join(__dirname, 'public/images/products')));
app.use(express.json());

// --- Langflow-Chatbot Static Assets ---
// Adjust paths based on your langflow-chatbot package structure.
// This assumes 'dist/plugins' and 'dist/styles' within the package.
app.use('/static/LangflowChatbotPlugin.js', express.static(
    path.join(__dirname, 'node_modules/langflow-chatbot/plugins/LangflowChatbotPlugin.js')
));
app.use('/static/langflow-chatbot.css', express.static(
    path.join(__dirname, 'node_modules/langflow-chatbot/styles/langflow-chatbot.css')
));
// --- END Langflow-Chatbot Static Assets ---

// Routes
app.get('/', (req, res) => {
    const renderData = { title: 'Welcome' };
    if (req.get('X-Request-Partial') === 'true') {
        res.set('X-Page-Title', renderData.title);
        res.render('partials/home-main', renderData);
    } else {
        res.render('home', renderData);
    }
});

app.get('/search', async (req, res) => {
    const requestedFamily = req.query.family;
    const requestedType = req.query.type;
    let requestedTags = req.query.tag || [];
    if (typeof requestedTags === 'string') requestedTags = [requestedTags];

    const filterConditions = [];
    if (requestedFamily) {
        const familyTypeFilter = { family: requestedFamily };
        if (requestedType) familyTypeFilter.product_type = requestedType;
        filterConditions.push(familyTypeFilter);
    }
    if (requestedTags.length > 0) filterConditions.push({ tags: { $all: requestedTags } });
    
    let filter = {};
    if (filterConditions.length > 1) filter = { $and: filterConditions };
    else if (filterConditions.length === 1) filter = filterConditions[0];

    let products = [];
    let error = null;
    if (!productCollection) error = "Database connection error.";
    else {
        try {
            const cursor = await productCollection.find(filter, {});
            products = await cursor.toArray();
        } catch (e) {
            console.error("Error fetching products:", e);
            error = "Could not retrieve products.";
        }
    }

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
        title: 'Search Products', products, error, hierarchy: productHierarchy,
        displayTags, currentFamily: requestedFamily, currentType: requestedType,
        currentTags: requestedTags, queryParams: req.query,
    });
});

app.get('/product/:productId', async (req, res) => {
    const productId = req.params.productId;
    const requestedDocId = req.query.doc;
    const fromSearchPage = (req.get('referer') || '').includes('/search');
    let product = null, initialDocContent = null, initialDocTitle = null, error = null;

    if (!productCollection || !documentCollection) error = "Database connection error.";
    else {
        try {
            product = await productCollection.findOne({ _id: productId });
            if (product) {
                product.documentation = [];
                if (product.documentation_ids && Array.isArray(product.documentation_ids)) {
                    product.documentation = product.documentation_ids
                        .map(id => ({ id, title: docTitleMap.get(id) || id }))
                        .sort((a, b) => a.title.localeCompare(b.title));
                }
                if (requestedDocId && product.documentation.some(doc => doc.id === requestedDocId)) {
                    const docData = await documentCollection.findOne({ _id: requestedDocId }, { projection: { content: 1, title: 1 } });
                    if (docData?.content) {
                        initialDocContent = marked(docData.content);
                        initialDocTitle = docData.title || requestedDocId;
                    }
                }
            } else error = "Product not found.";
        } catch (e) {
            console.error(`Error fetching product ${productId} or document ${requestedDocId}:`, e);
            error = "Could not retrieve product details or document.";
        }
    }
    const pageTitle = product ? product.name : 'Product Not Found';
    const renderData = {
        product, error, script: '/js/product-detail.js', searchParams: req.query,
        initialDocContent, initialDocTitle, initialDocId: requestedDocId, fromSearchPage,
    };
    if (req.get('X-Request-Partial') === 'true') {
        res.set('X-Page-Title', pageTitle);
        const { script, ...partialData } = renderData; // Remove script for partial
        res.render('partials/product-main', partialData);
    } else {
        res.render('product', { title: pageTitle, ...renderData });
    }
});

app.get('/product/sku/:sku', async (req, res) => {
    const sku = req.params.sku;
    const requestedDocId = req.query.doc;
    const fromSearchPage = (req.get('referer') || '').includes('/search');
    let product = null, initialDocContent = null, initialDocTitle = null, error = null;

    if (!productCollection || !documentCollection) error = "Database connection error.";
    else {
        try {
            product = await productCollection.findOne({ sku: sku });
            if (product) {
                product.documentation = [];
                if (product.documentation_ids && Array.isArray(product.documentation_ids)) {
                    product.documentation = product.documentation_ids
                        .map(id => ({ id, title: docTitleMap.get(id) || id }))
                        .sort((a, b) => a.title.localeCompare(b.title));
                }
                if (requestedDocId && product.documentation.some(doc => doc.id === requestedDocId)) {
                    const docData = await documentCollection.findOne({ _id: requestedDocId }, { projection: { content: 1, title: 1 } });
                    if (docData?.content) {
                        initialDocContent = marked(docData.content);
                        initialDocTitle = docData.title || requestedDocId;
                    }
                }
            } else error = "Product not found.";
        } catch (e) {
            console.error(`Error fetching product with SKU ${sku}:`, e);
            error = "Could not retrieve product details.";
        }
    }
    const pageTitle = product ? product.name : 'Product Not Found';
    const renderData = {
        product, error, script: '/js/product-detail.js', searchParams: req.query,
        initialDocContent, initialDocTitle, initialDocId: requestedDocId, fromSearchPage,
    };
    if (req.get('X-Request-Partial') === 'true') {
        res.set('X-Page-Title', pageTitle);
        const { script, ...partialData } = renderData;
        res.render('partials/product-main', partialData);
    } else {
        res.render('product', { title: pageTitle, ...renderData });
    }
});

app.get('/api/document/:docId', async (req, res) => {
    const docId = req.params.docId;
    if (!documentCollection) return res.status(503).json({ error: 'Database (documents) not available.' });
    try {
        const doc = await documentCollection.findOne({ _id: docId });
        if (!doc) return res.status(404).json({ error: 'Document not found' });
        
        let htmlContent = '';
        // Assuming doc.content holds the markdown/text, not doc.text
        if (doc.format?.toLowerCase() === 'markdown' && doc.content) {
            htmlContent = marked.parse(doc.content);
        } else {
            htmlContent = `<pre>${doc.content || 'No content found.'}</pre>`;
        }
        res.json({ title: doc.title || 'Document', htmlContent });
    } catch (e) {
        console.error(`Error fetching document ${docId}:`, e);
        res.status(500).json({ error: 'Failed to retrieve document content.' });
    }
});

// --- Langflow-Chatbot Proxy API Route ---
if (langflowProxy) {
    app.use(LANGFLOW_PROXY_API_BASE_PATH, async (req, res, next) => {
        const originalExpressReqUrl = req.url; // Store the path stripped by Express (e.g., /config/product-recommender)
        req.url = req.originalUrl;             // Provide the full original path to langflowProxy

        try {
            // langflowProxy.handleRequest will now receive the full path in req.url.
            // It will strip its proxyApiBasePath, set req.url to the stripped version
            // for its internal call to request-handler.ts, and then restore req.url
            // to the full path in its own finally block.
            await langflowProxy.handleRequest(req, res);
        } catch (proxyError) {
            console.error(`Error during LangflowProxyService handleRequest for ${req.method} ${req.originalUrl}:`, proxyError);
            if (!res.headersSent) {
                res.status(500).json({ error: "Internal error in chatbot proxy." });
            } else if (!res.writableEnded) {
                console.error("Proxy error after headers sent, attempting to end response.");
                res.end();
            }
            // Consider if you want to call next(proxyError) for Express's default error handling
        } finally {
            // After langflowProxy.handleRequest is done, req.url would have been restored
            // by langflowProxy to req.originalUrl.
            // Restore req.url to what Express expects for any subsequent middleware.
            req.url = originalExpressReqUrl;
        }
    });
    console.log(`Langflow-Chatbot proxy mounted at ${LANGFLOW_PROXY_API_BASE_PATH}`);
} else {
    console.error("LangflowProxyService instance (langflowProxy) is not initialized. Chatbot proxy route CANNOT be set up.");
    app.use(LANGFLOW_PROXY_API_BASE_PATH, (req, res) => {
        res.status(503).json({ error: "Chatbot service is currently unavailable. Please check server logs."});
    });
}
// --- END Langflow-Chatbot Proxy API Route ---

// Server startup
initializeDbAndData().then(() => {
    app.listen(port, () => {
        console.log(`Server listening at http://localhost:${port}`);
        if (langflowProxy) {
            console.log(`Chatbot proxy available at http://localhost:${port}${LANGFLOW_PROXY_API_BASE_PATH}`);
        } else {
            console.warn(`Chatbot proxy is NOT available. LangflowProxyService was not initialized.`);
        }
    });
}).catch(err => {
    console.error("Failed to initialize database and data before starting server:", err);
    app.listen(port, () => {
        console.log(`Server listening at http://localhost:${port}, BUT some initializations (DB or Chatbot Proxy Flows) FAILED.`);
    });
});