// Handles interactions on the /product/:id page
document.addEventListener('DOMContentLoaded', () => {
    const docLinksContainer = document.querySelector('.product-documentation-links ul');
    const docViewerTitle = document.getElementById('docViewerTitle');
    const docViewerContent = document.getElementById('docViewerContent');
    const productImage = document.querySelector('.product-detail-image'); // Get product image
    const imageModal = document.getElementById('imageModal'); // Get image modal elements
    const imageModalImg = document.getElementById('imageModalContent');
    const imageModalCaption = document.getElementById('imageModalCaption');
    const imageModalCloseBtn = document.getElementById('imageModalCloseBtn');

    // Get initial doc ID from EJS (if provided)
    const initialDocId = docViewerContent.closest('.product-detail-doc-display').dataset.initialDocId; 

    // Highlight initial doc link if applicable
    if (initialDocId && docLinksContainer) {
        const initialLink = docLinksContainer.querySelector(`.doc-link[data-doc-id="${initialDocId}"]`);
        if (initialLink) {
            initialLink.classList.add('active');
            docViewerTitle.style.display = 'block'; // Ensure title is shown if initial content loaded
        } else {
             // If initialDocId from query is invalid (not in product list), clear server-rendered content
             docViewerTitle.textContent = 'Select a document';
             docViewerTitle.style.display = 'none'; // Hide title if no doc selected
             docViewerContent.innerHTML = '<p>Select a document from the list to view its content.</p>';
        }
    }

    if (docLinksContainer) {
        docLinksContainer.addEventListener('click', async (event) => {
            const docLink = event.target.closest('.doc-link');
            if (docLink) {
                event.preventDefault();
                const docId = docLink.getAttribute('data-doc-id');
                const docTitle = docLink.textContent || docId; // Get title from link text
                
                // Visually indicate active link
                docLinksContainer.querySelectorAll('.doc-link').forEach(link => link.classList.remove('active'));
                docLink.classList.add('active');

                // Fetch and load content
                await loadDocumentation(docId, docTitle);

                // Update URL with history.pushState
                const currentUrl = new URL(window.location.href);
                currentUrl.searchParams.set('doc', docId);
                history.pushState({ docId: docId, docTitle: docTitle }, docTitle, currentUrl.toString());
            }
        });
    }

    // Function to fetch and display documentation in the right panel
    async function loadDocumentation(docId, docTitleFromLink = null) {
        const displayTitle = docTitleFromLink || 'Loading...'; // Use link text or Loading...
        docViewerTitle.textContent = displayTitle;
        docViewerTitle.style.display = 'block'; // Always show title when loading
        docViewerContent.innerHTML = '<p>Loading...</p>';

        try {
            const response = await fetch(`/api/document/${docId}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();

            // Use title from API response if available, otherwise keep title from link
            docViewerTitle.textContent = data.title || displayTitle; 
            docViewerContent.innerHTML = data.htmlContent;

        } catch (error) {
            console.error('Error fetching documentation:', error);
            docViewerTitle.textContent = 'Error';
            docViewerContent.innerHTML = '<p>Could not load document content. Please try again later.</p>';
        }
    }

    // Handle Back/Forward navigation
    window.addEventListener('popstate', async (event) => {
        const state = event.state;
        if (state && state.docId) {
            // Load document based on the state
            await loadDocumentation(state.docId, state.docTitle);
            // Update active link
            if (docLinksContainer) {
                docLinksContainer.querySelectorAll('.doc-link').forEach(link => link.classList.remove('active'));
                const activeLink = docLinksContainer.querySelector(`.doc-link[data-doc-id="${state.docId}"]`);
                if (activeLink) activeLink.classList.add('active');
            }
        } else {
            // No state or docId in state - likely navigated back to the base product page
            docViewerTitle.textContent = 'Select a document';
            docViewerTitle.style.display = 'none';
            docViewerContent.innerHTML = '<p>Select a document from the list to view its content.</p>';
            if (docLinksContainer) {
                docLinksContainer.querySelectorAll('.doc-link').forEach(link => link.classList.remove('active'));
            }
        }
    });

    // --- Image Modal Logic --- 
    if (productImage && imageModal && imageModalImg && imageModalCloseBtn) {
        productImage.addEventListener('click', () => {
            imageModal.style.display = "block";
            imageModalImg.src = productImage.src;
            imageModalCaption.textContent = productImage.alt; // Use alt text as caption
        });

        imageModalCloseBtn.addEventListener('click', () => {
            imageModal.style.display = "none";
        });

        // Close modal if clicking the background overlay
        imageModal.addEventListener('click', (event) => {
             if (event.target === imageModal) {
                 imageModal.style.display = "none";
             }
        });
    }

    // --- Close image modal on Escape key ---
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && imageModal && imageModal.style.display === 'block') {
            imageModal.style.display = 'none';
        }
    });
}); 