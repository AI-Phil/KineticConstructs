require('dotenv').config();

// --- Add debugging ---
console.log("Dotenv loaded.");
console.log('ASTRA_DB_API_ENDPOINT:', process.env.ASTRA_DB_API_ENDPOINT);
console.log('ASTRA_DB_TOKEN:', process.env.ASTRA_DB_TOKEN ? 'Token loaded (masked)' : 'Token NOT loaded');
// --- End debugging ---

const express = require('express');
const path = require('path');
const { DataAPIClient } = require("@datastax/astra-db-ts");

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
let collection;
let productHierarchy = {}; // Hierarchy built from DB on startup
let tagsByFrequency = []; // List of {tag, count}, sorted by count desc

// Updated initialization function name and logic
async function initializeDbAndHierarchy() {
    try {
        // Connect to DB
        const client = new DataAPIClient(ASTRA_DB_TOKEN);
        db = client.db(ASTRA_DB_API_ENDPOINT);
        collection = await db.collection(collectionName);
        console.log(`Connected to Astra DB and collection '${collectionName}'`);

        // Fetch necessary fields for hierarchy AND tags
        console.log('Fetching family/type/tags data from DB for hierarchy and tags list...');
        const cursor = await collection.find({}, {
            projection: {
                family: 1,
                product_type: 1,
                tags: 1 // Add tags to projection
            }
        });
        const initialItems = await cursor.toArray();
        console.log(`Fetched ${initialItems.length} items for hierarchy/tags build.`);

        // Build hierarchy and count tags
        console.log('Building hierarchy and counting tags from DB data...');
        const hierarchy = {};
        const tagCounts = new Map(); // Use a Map for counts

        initialItems.forEach(item => {
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
        productHierarchy = sortedHierarchy; // Assign to the global variable
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

    } catch (e) {
        console.error("Error during DB connection or initial data build:", e);
        db = null;
        collection = null;
        productHierarchy = {};
        tagsByFrequency = []; // Ensure empty on error
    }
}

// --- Express App Setup ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files (CSS, images)
app.use(express.static(path.join(__dirname, 'public')));


// --- Routes ---
app.get('/', async (req, res) => {
    // Get query parameters
    const requestedFamily = req.query.family;
    const requestedType = req.query.type;
    // Get tags - ensure it's an array
    let requestedTags = req.query.tag || []; 
    if (typeof requestedTags === 'string') {
        requestedTags = [requestedTags]; // Convert single tag string to array
    }

    // Build filter for DB query - Tags take precedence
    const filter = {};
    if (requestedTags.length > 0) {
        // Use $all operator implicitly via the driver for array of tags
        // Assumes the driver handles mapping an array value to the correct query ($all or similar)
        filter.tags = { $all: requestedTags }; 
    } else if (requestedFamily) { // Otherwise, filter by family/type
        filter.family = requestedFamily;
        if (requestedType) {
            filter.product_type = requestedType;
        }
    }

    let products = [];
    let error = null;

    if (!collection) {
        error = "Database connection not available.";
    } else {
        try {
            // Query DB on each request with the filter
            console.log(`Querying DB with filter: ${JSON.stringify(filter)}`);
            const cursor = await collection.find(filter);
            products = await cursor.toArray(); // These are the *filtered* products
            console.log(`Fetched ${products.length} products from DB.`);
        } catch (e) {
            console.error("Error fetching products from Astra DB:", e);
            error = "Could not retrieve products from the database.";
            products = []; // Ensure empty array on error
        }
    }

    // Calculate dynamic tag counts from the *filtered* products
    const dynamicTagCounts = new Map();
    if (!error) { // Only calculate if products were fetched successfully
        products.forEach(product => {
            if (product.tags && Array.isArray(product.tags)) {
                product.tags.forEach(tag => {
                    dynamicTagCounts.set(tag, (dynamicTagCounts.get(tag) || 0) + 1);
                });
            }
        });
    }

    // Prepare display tags with dynamic counts (using all from static list)
    const displayTags = tagsByFrequency.map(tagInfo => ({
        tag: tagInfo.tag,
        totalCount: tagInfo.count, // Keep total count if needed later
        dynamicCount: dynamicTagCounts.get(tagInfo.tag) || 0 // Get count within filtered results
    }));

    // Log rendering info - include tags array
    console.log(`Rendering page with ${products.length} products (filtered by tags: [${requestedTags.join(', ') || 'none'}], family: ${requestedFamily || 'none'}, type: ${requestedType || 'none'})`);
    
    res.render('products', { 
        products: products, 
        error: error, 
        hierarchy: productHierarchy, 
        displayTags: displayTags, // Pass tags with dynamic counts
        currentFamily: requestedFamily,
        currentType: requestedType,
        currentTags: requestedTags // Pass array of current tags
    });
});

// --- Start Server ---
// Use the updated initialization function
initializeDbAndHierarchy().then(() => {
    app.listen(port, () => {
        console.log(`Server listening at http://localhost:${port}`);
    });
}).catch(err => {
    console.error("Failed to initialize database and hierarchy before starting server:", err);
    app.listen(port, () => {
        console.log(`Server listening at http://localhost:${port}, but initialization failed.`);
    });
}); 