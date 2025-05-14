require('dotenv').config();

// Log environment configuration status
console.log("Dotenv loaded.");
console.log('ASTRA_DB_API_ENDPOINT:', process.env.ASTRA_DB_API_ENDPOINT);
console.log('ASTRA_DB_TOKEN:', process.env.ASTRA_DB_TOKEN ? 'Token loaded (masked)' : 'Token NOT loaded');

const express = require('express');
const path = require('path');
const { DataAPIClient } = require("@datastax/astra-db-ts");
const { marked } = require('marked');
const { LangflowClient } = require('@datastax/langflow-client');

const app = express();
const port = process.env.PORT || 3000;

// Environment variables validation
const { 
    ASTRA_DB_API_ENDPOINT, 
    ASTRA_DB_TOKEN, 
    ASTRA_DB_COLLECTION, 
    LANGFLOW_ENDPOINT,
    LANGFLOW_PRODUCT_ASSISTANT_FLOW_ID,
    LANGFLOW_API_KEY
} = process.env;

if (!ASTRA_DB_API_ENDPOINT || !ASTRA_DB_TOKEN) {
    console.error("Error: ASTRA_DB_API_ENDPOINT and ASTRA_DB_TOKEN must be set in the .env file.");
    process.exit(1);
}

// Chatbot configuration
const CHATBOT_API_BASE_PATH = '/api/chatbot';
const chatbots = {
    // Chatbots will be defined from environment variables during initialization
};

// Initialize Langflow client if endpoint is available
let langflowClient = null;
try {
    if (LANGFLOW_ENDPOINT) {
        console.log(`Initializing Langflow client with endpoint: ${LANGFLOW_ENDPOINT}`);
        const clientConfig = {
            baseUrl: LANGFLOW_ENDPOINT
        };
        
        if (LANGFLOW_API_KEY) {
            console.log('Using API key for Langflow authentication');
            clientConfig.apiKey = LANGFLOW_API_KEY;
        } else {
            console.log('No API key provided for Langflow');
        }
        
        langflowClient = new LangflowClient(clientConfig);
        console.log('Langflow client initialized successfully.');
        
        // Find and register all available chatbot types from environment variables
        // Format: LANGFLOW_<TYPE>_FLOW_ID (e.g., LANGFLOW_PRODUCT_ASSISTANT_FLOW_ID)
        const chatbotEnvVars = Object.keys(process.env).filter(key => 
            key.startsWith('LANGFLOW_') && key.endsWith('_FLOW_ID')
        );
        
        console.log(`Found ${chatbotEnvVars.length} potential chatbot flow IDs in environment variables`);
        
        chatbotEnvVars.forEach(envVar => {
            const flowId = process.env[envVar];
            if (!flowId) return;
            
            // Extract chatbot type from environment variable name
            // Convert LANGFLOW_PRODUCT_ASSISTANT_FLOW_ID to product-assistant
            const typeMatch = envVar.match(/LANGFLOW_(.+)_FLOW_ID/);
            if (!typeMatch || !typeMatch[1]) return;
            
            const chatbotType = typeMatch[1]
                .replace(/_/g, '-')
                .toLowerCase();
                
            console.log(`Registering chatbot type '${chatbotType}' with flow ID: ${flowId}`);
            
            chatbots[chatbotType] = {
                enabled: true,
                flowId: flowId,
                client: langflowClient
            };
            
            console.log(`Chatbot '${chatbotType}' enabled and ready.`);
        });
        
        if (Object.keys(chatbots).length === 0) {
            console.warn('No chatbot flow IDs found in environment variables. No chatbots will be available.');
        } else {
            console.log(`Successfully registered ${Object.keys(chatbots).length} chatbots: ${Object.keys(chatbots).join(', ')}`);
        }
    } else {
        console.warn('LANGFLOW_ENDPOINT not set. All chatbot functionality will be disabled.');
    }
} catch (error) {
    console.error('Failed to initialize Langflow client:', error);
}

// Expose chatbot URL to templates without revealing implementation details
// No longer needed since client-side code will use API endpoints directly
// const productAssistantUrl = `${CHATBOT_API_BASE_PATH}/product-assistant`;

// Collection names from environment variables
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
    const renderData = {
        title: 'Welcome'
    };
    if (req.get('X-Request-Partial') === 'true') {
        res.set('X-Page-Title', renderData.title);
        res.render('partials/home-main', renderData);
    } else {
        res.render('home', renderData);
    }
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
        options.sort = { $hybrid: semanticQuery };
        options.limit = 25;
    }

    let products = [];
    let error = null;

    if (!productCollection) {
        error = "Database connection error.";
    } else {
        try {
            console.log(`Querying products with filter: ${JSON.stringify(filter)} and options: ${JSON.stringify(options)}`);
            if (semanticQuery) {
                const cursor = await productCollection.findAndRerank(filter, options);
                const rankedResults = await cursor.toArray();
                products = rankedResults.map(result => result.document);
                console.log(`findAndRerank returned ${products.length} results.`);
            } else {
                const cursor = await productCollection.find(filter, options);
                products = await cursor.toArray();
                console.log(`find returned ${products.length} results.`);
            }
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
    const referer = req.get('referer') || '';
    const fromSearchPage = referer.includes('/search');

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
        } catch (e) {
            console.error(`Error fetching product ${productId} or document ${requestedDocId}:`, e);
            error = "Could not retrieve product details or document.";
        }
    }

    const pageTitle = product ? product.name : 'Product Not Found';
    const renderData = {
        product: product,
        error: error,
        script: '/js/product-detail.js',
        searchParams: searchQueryParams,
        initialDocContent: initialDocContent,
        initialDocTitle: initialDocTitle,
        initialDocId: requestedDocId,
        fromSearchPage: fromSearchPage
    };

    if (req.get('X-Request-Partial') === 'true') {
        res.set('X-Page-Title', pageTitle);
        // For partial, we don't need the overall page title or script vars used by the main layout
        const partialData = { ...renderData };
        delete partialData.script; // Not needed for the partial itself
        // The 'title' variable for the <title> tag is handled by X-Page-Title header for partials
        res.render('partials/product-main', partialData);
    } else {
        res.render('product', {
            title: pageTitle,
            ...renderData
        });
    }
});

// Product detail page by SKU
app.get('/product/sku/:sku', async (req, res) => {
    const sku = req.params.sku;
    const searchQueryParams = req.query;
    const requestedDocId = req.query.doc;
    const referer = req.get('referer') || '';
    const fromSearchPage = referer.includes('/search');

    let product = null;
    let initialDocContent = null;
    let initialDocTitle = null;
    let error = null;

    if (!productCollection || !documentCollection) {
        error = "Database connection error.";
    } else {
        try {
            console.log(`Fetching product with SKU: ${sku}`);
            product = await productCollection.findOne({ sku: sku });

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
        } catch (e) {
            console.error(`Error fetching product with SKU ${sku}:`, e);
            error = "Could not retrieve product details.";
        }
    }

    const pageTitle = product ? product.name : 'Product Not Found';
    const renderData = {
        product: product,
        error: error,
        script: '/js/product-detail.js',
        searchParams: searchQueryParams,
        initialDocContent: initialDocContent,
        initialDocTitle: initialDocTitle,
        initialDocId: requestedDocId,
        fromSearchPage: fromSearchPage
    };

    if (req.get('X-Request-Partial') === 'true') {
        res.set('X-Page-Title', pageTitle);
        const partialData = { ...renderData };
        delete partialData.script;
        res.render('partials/product-main', partialData);
    } else {
        res.render('product', {
            title: pageTitle,
            ...renderData
        });
    }
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

// Chatbot API endpoints
app.get(`${CHATBOT_API_BASE_PATH}/:botId/status`, (req, res) => {
    const botId = req.params.botId;
    const chatbot = chatbots[botId];
    
    if (!chatbot) {
        // Return 200 OK with disabled status instead of 404
        // This allows the frontend to gracefully handle unavailable chatbots
        return res.status(200).json({
            enabled: false,
            message: `Chatbot '${botId}' is currently unavailable`
        });
    }
    
    res.json({
        enabled: chatbot.enabled,
        message: chatbot.enabled ? `${botId} chatbot is operational` : `${botId} chatbot is currently unavailable`
    });
});

// Test endpoint for Langflow client
app.get('/api/test-langflow', async (req, res) => {
    if (!langflowClient) {
        return res.status(500).json({
            error: 'Langflow client not initialized',
            status: 'error'
        });
    }
    
    try {
        // Simple test to check if we can get the flows from Langflow
        console.log('Testing Langflow client connection...');
        const flows = await langflowClient.getFlows();
        console.log('Langflow client test succeeded. Got flows:', flows.length);
        
        // Check if our flow ID exists 
        const flowExists = flows.some(flow => flow.id === LANGFLOW_PRODUCT_ASSISTANT_FLOW_ID);
        
        return res.json({
            status: 'success',
            message: 'Langflow client is working',
            flowCount: flows.length,
            flowIdExists: flowExists,
            flowId: LANGFLOW_PRODUCT_ASSISTANT_FLOW_ID
        });
    } catch (error) {
        console.error('Error testing Langflow client:', error);
        return res.status(500).json({
            error: `Langflow client test failed: ${error.message}`,
            status: 'error'
        });
    }
});

// Support both GET and POST for the streaming endpoint
app.all(`${CHATBOT_API_BASE_PATH}/:botId`, async (req, res) => {
    // Only allow GET and POST methods
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({
            error: 'Method not allowed',
            message: 'Only GET and POST methods are supported for this endpoint'
        });
    }

    const botId = req.params.botId;
    console.log(`Received ${req.method} request for chatbot '${botId}'`);
    
    const chatbot = chatbots[botId];
    
    if (!chatbot) {
        console.warn(`Chatbot '${botId}' not found`);
        return res.status(404).json({
            error: `Chatbot '${botId}' not found`
        });
    }
    
    if (!chatbot.enabled) {
        console.warn(`Chatbot '${botId}' is disabled`);
        return res.status(503).json({
            error: `${botId} chatbot service is currently unavailable (disabled)`
        });
    }
    
    if (!chatbot.client) {
        console.warn(`Chatbot '${botId}' has no client`);
        return res.status(503).json({
            error: `${botId} chatbot service is currently unavailable (no client)`
        });
    }

    // For GET requests, use query parameters; for POST, use body
    const inputValue = req.method === 'GET' ? 
        req.query.input_value : 
        req.body.input_value;
    
    const sessionId = (req.method === 'GET' ? 
        req.query.session_id : 
        req.body.session_id) || `session_${Date.now()}`;
    
    const userId = (req.method === 'GET' ? 
        req.query.user_id : 
        req.body.user_id) || sessionId;
    
    if (!inputValue && req.method === 'POST') {
        return res.status(400).json({ error: 'Missing required field: input_value' });
    }

    // For GET without input_value, just return status info about the chatbot
    if (!inputValue && req.method === 'GET' && !req.query.stream) {
        return res.json({
            botId: botId,
            enabled: chatbot.enabled,
            flowId: chatbot.flowId,
            message: 'Chatbot is ready to use. Send a POST request with input_value to chat.'
        });
    }
    
    console.log(`Processing ${req.method} message from user ${userId} in session ${sessionId}`);
    console.log(`Message: "${inputValue}"`);

    try {
        // For streaming responses
        if (req.query.stream === 'true') {
            console.log(`Using streaming response for chatbot '${botId}'`);
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            
            // Create the streaming response
            console.log(`Creating streaming response with flowId: ${chatbot.flowId}`);
            try {
                // Use the correct flow().stream() method instead of runFlowStreaming
                const stream = await chatbot.client.flow(chatbot.flowId).stream(inputValue, {
                    input_type: 'chat',
                    output_type: 'chat',
                    session_id: sessionId,
                    user_id: userId
                });
                
                console.log(`Stream created successfully for chatbot '${botId}'`);
                
                // Process the ReadableStream
                (async () => {
                    try {
                        for await (const event of stream) {
                            // Send the event data to the client
                            res.write(`data: ${JSON.stringify(event)}\n\n`);
                            
                            // End the response when the 'end' event is received
                            if (event.event === 'end') {
                                console.log(`Stream ended for chatbot '${botId}'`);
                                res.end();
                                break;
                            }
                        }
                    } catch (error) {
                        console.error(`Error processing stream for chatbot '${botId}':`, error);
                        
                        // Send error to the client
                        const errorEvent = {
                            event: 'error',
                            data: {
                                message: error.message || 'An error occurred while streaming the response'
                            }
                        };
                        res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
                        
                        // End the response
                        res.write(`data: ${JSON.stringify({ event: 'end' })}\n\n`);
                        res.end();
                    }
                })();
                
                // Handle client disconnect
                req.on('close', () => {
                    console.log(`Client disconnected from chatbot '${botId}' stream`);
                    // No need to destroy the stream as it will be automatically cleaned up
                    // when it goes out of scope
                });
            } catch (streamError) {
                console.error(`Error creating stream for chatbot '${botId}':`, streamError);
                res.write(`data: {"event": "error", "error": "Failed to create stream: ${streamError.message}"}\n\n`);
                res.end();
            }
        } else {
            // For non-streaming responses (batch mode)
            console.log(`Using batch response for chatbot '${botId}'`);
            console.log(`Creating batch response with flowId: ${chatbot.flowId}`);
            
            try {
                const response = await chatbot.client.flow(chatbot.flowId).run(inputValue, {
                    input_type: 'chat',
                    output_type: 'chat',
                    session_id: sessionId,
                    user_id: userId
                });
                
                console.log(`Batch response received for chatbot '${botId}'`);
                res.json(response);
            } catch (batchError) {
                console.error(`Error with batch request for chatbot '${botId}':`, batchError);
                res.status(500).json({
                    error: 'Failed to process chatbot batch request',
                    details: batchError.message
                });
            }
        }
    } catch (error) {
        console.error(`Error running ${botId} flow:`, error);
        res.status(500).json({
            error: 'Failed to process chatbot request',
            details: error.message
        });
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