// Handles interactions on the /product/:id page
function initializeProductDetailPageInteractions() {
    console.log('Initializing product detail page interactions...');
    const docLinksContainer = document.querySelector('.product-documentation-links ul');
    const docViewerTitle = document.getElementById('docViewerTitle');
    const docViewerContent = document.getElementById('docViewerContent');
    const productImage = document.querySelector('.product-detail-image');
    const imageModal = document.getElementById('imageModal');
    const imageModalImg = document.getElementById('imageModalContent');
    const imageModalCaption = document.getElementById('imageModalCaption');
    const imageModalCloseBtn = document.getElementById('imageModalCloseBtn');

    // Check if essential elements for product detail page exist
    if (!docViewerContent || !imageModal) { // Added checks for core elements
        console.log('Product detail specific elements not found. Skipping initialization.');
        return;
    }

    // Get initial doc ID from EJS (if provided)
    // Ensure closest returns a non-null element before accessing dataset
    const docDisplayElement = docViewerContent.closest('.product-detail-doc-display');
    const initialDocId = docDisplayElement ? docDisplayElement.dataset.initialDocId : null;

    // Highlight initial doc link if applicable
    if (initialDocId && docLinksContainer) {
        const initialLink = docLinksContainer.querySelector(`.doc-link[data-doc-id="${initialDocId}"]`);
        if (initialLink) {
            initialLink.classList.add('active');
            if (docViewerTitle) docViewerTitle.style.display = 'block';
        } else if (docViewerTitle && docViewerContent) {
             docViewerTitle.textContent = 'Select a document';
             docViewerTitle.style.display = 'none';
             docViewerContent.innerHTML = '<p>Select a document from the list to view its content.</p>';
        }
    } else if (docViewerTitle && docViewerContent && !initialDocId) {
        // If no initialDocId, ensure a placeholder state if elements exist
        docViewerTitle.textContent = 'Select a document';
        docViewerTitle.style.display = 'none';
        docViewerContent.innerHTML = '<p>Select a document from the list to view its content.</p>';
    }

    if (docLinksContainer) {
        // Remove existing listener to prevent duplicates if re-initializing on same overall page structure
        // This is a simple approach; more robust would be to use AbortController for listeners
        // or ensure elements are fully replaced. For now, assuming full replacement of product-main content.
        docLinksContainer.replaceWith(docLinksContainer.cloneNode(true)); // Re-clone to remove old listeners
        const newDocLinksContainer = document.querySelector('.product-documentation-links ul'); // Re-select
        if (newDocLinksContainer) { // Check if it exists after re-selection
            newDocLinksContainer.addEventListener('click', async (event) => {
                const docLink = event.target.closest('.doc-link');
                if (docLink) {
                    event.preventDefault();
                    const docId = docLink.getAttribute('data-doc-id');
                    const docTitle = docLink.textContent || docId;
                    
                    newDocLinksContainer.querySelectorAll('.doc-link').forEach(link => link.classList.remove('active'));
                    docLink.classList.add('active');

                    await loadDocumentation(docId, docTitle);

                    const currentUrl = new URL(window.location.href);
                    currentUrl.searchParams.set('doc', docId);
                    history.pushState({ docId: docId, docTitle: docTitle }, docTitle, currentUrl.toString());
                }
            });
        }
    }

    async function loadDocumentation(docId, docTitleFromLink = null) {
        if (!docViewerTitle || !docViewerContent) return;
        const displayTitle = docTitleFromLink || 'Loading...';
        docViewerTitle.textContent = displayTitle;
        docViewerTitle.style.display = 'block';
        docViewerContent.innerHTML = '<p>Loading...</p>';

        try {
            const response = await fetch(`/api/document/${docId}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            docViewerTitle.textContent = data.title || displayTitle;
            docViewerContent.innerHTML = data.htmlContent;
        } catch (error) {
            console.error('Error fetching documentation:', error);
            docViewerTitle.textContent = 'Error';
            docViewerContent.innerHTML = '<p>Could not load document content. Please try again later.</p>';
        }
    }

    // Popstate for intra-page document navigation
    // Consider if this needs to be guarded from running multiple times if not fully cleaned up.
    // For now, assuming it's okay as it checks event.state.docId which is specific.
    const productPagePopstateHandler = async (event) => {
        const state = event.state;
        if (state && state.docId && document.querySelector('.product-detail-container')) { // Check for product context
            const currentDocLinksContainer = document.querySelector('.product-documentation-links ul'); // Re-select
            await loadDocumentation(state.docId, state.docTitle);
            if (currentDocLinksContainer) {
                currentDocLinksContainer.querySelectorAll('.doc-link').forEach(link => link.classList.remove('active'));
                const activeLink = currentDocLinksContainer.querySelector(`.doc-link[data-doc-id="${state.docId}"]`);
                if (activeLink) activeLink.classList.add('active');
            }
        } else if (!state && document.querySelector('.product-detail-container')) { // Navigated back to base product page (no docId in state)
            const currentDocViewerTitle = document.getElementById('docViewerTitle');
            const currentDocViewerContent = document.getElementById('docViewerContent');
            const currentDocLinksContainer = document.querySelector('.product-documentation-links ul');
            if(currentDocViewerTitle && currentDocViewerContent) {
                currentDocViewerTitle.textContent = 'Select a document';
                currentDocViewerTitle.style.display = 'none';
                currentDocViewerContent.innerHTML = '<p>Select a document from the list to view its content.</p>';
            }
            if (currentDocLinksContainer) {
                currentDocLinksContainer.querySelectorAll('.doc-link').forEach(link => link.classList.remove('active'));
            }
        }
    };
    // Add popstate listener, perhaps ensure it's unique if this function can be called multiple times without full page reload
    // For now, we add it each time. The handler itself checks for product context.
    window.addEventListener('popstate', productPagePopstateHandler);

    // Image Modal Logic - re-select elements each time
    const currentProductImage = document.querySelector('.product-detail-image');
    const currentImageModal = document.getElementById('imageModal');
    const currentImageModalImg = document.getElementById('imageModalContent');
    const currentImageModalCaption = document.getElementById('imageModalCaption');
    const currentImageModalCloseBtn = document.getElementById('imageModalCloseBtn');

    if (currentProductImage && currentImageModal && currentImageModalImg && currentImageModalCloseBtn) {
        currentProductImage.replaceWith(currentProductImage.cloneNode(true)); // Re-clone for listeners
        const freshProductImage = document.querySelector('.product-detail-image');
        
        if (freshProductImage) { // Check if exists after re-selection
            freshProductImage.addEventListener('click', () => {
                if(currentImageModal && currentImageModalImg && currentImageModalCaption) {
                    currentImageModal.style.display = "block";
                    currentImageModalImg.src = freshProductImage.src;
                    currentImageModalCaption.textContent = freshProductImage.alt;
                }
            });
        }

        currentImageModalCloseBtn.replaceWith(currentImageModalCloseBtn.cloneNode(true));
        const freshImageModalCloseBtn = document.getElementById('imageModalCloseBtn');
        if (freshImageModalCloseBtn) {
            freshImageModalCloseBtn.addEventListener('click', () => {
                if(currentImageModal) currentImageModal.style.display = "none";
            });
        }
        
        currentImageModal.replaceWith(currentImageModal.cloneNode(true));
        const freshImageModal = document.getElementById('imageModal');
        if (freshImageModal) {
            freshImageModal.addEventListener('click', (event) => {
                if (event.target === freshImageModal) {
                    freshImageModal.style.display = "none";
                }
            });
        }
    }

    // Keydown for Escape for image modal - this is a document level listener.
    // Adding it inside means it might be added multiple times if not careful.
    const imageModalEscapeHandler = (event) => {
        const activeImageModal = document.getElementById('imageModal'); // Re-check modal on event fire
        if (event.key === 'Escape' && activeImageModal && activeImageModal.style.display === 'block') {
            activeImageModal.style.display = 'none';
        }
    };
    // Remove previous listener if any, then add the new one.
    // This is a common pattern but has limitations. Better to manage listener lifecycle carefully.
    // document.removeEventListener('keydown', imageModalEscapeHandler); // This would require storing the handler instance.
    // For simplicity, let's assume that if the product page is reloaded, a new set of keydown listeners is acceptable 
    // as long as they check for the modal's existence and visibility.
    document.addEventListener('keydown', imageModalEscapeHandler);
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('Product detail DOMContentLoaded.');
    initializeProductDetailPageInteractions();
});

// Listen for custom event from main-navigation.js
const mainContent = document.querySelector('main');
if (mainContent) {
    mainContent.addEventListener('mainContentReloaded', (event) => {
        console.log('mainContentReloaded event caught in product-detail.js');
        // Check if the new content is a product page before re-initializing
        if (document.querySelector('.product-detail-container')) {
            console.log('Product container found, re-initializing product detail interactions.');
            initializeProductDetailPageInteractions();
        } else {
            console.log('Not a product page, product detail interactions not re-initialized.');
            // Potentially clean up any persistent listeners if product-detail.js added them (e.g. on window/document)
            // For now, the popstate and keydown listeners added by initializeProductDetailPageInteractions might persist
            // even when navigating away from a product page via background nav. This needs careful review.
            // A simple approach for global listeners is to remove them if we know we are no longer on a product page.
            // window.removeEventListener('popstate', productPagePopstateHandler); // Needs productPagePopstateHandler to be in scope
            // document.removeEventListener('keydown', imageModalEscapeHandler); // Needs imageModalEscapeHandler to be in scope
        }
    });
} else {
    console.error('Main content element not found for mainContentReloaded listener in product-detail.js');
} 