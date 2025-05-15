// Handles interactions on the /product/:id page
function initializeProductDetailPageInteractions() {
    const docLinksContainer = document.querySelector('.product-documentation-links ul');
    const docViewerTitle = document.getElementById('docViewerTitle');
    const docViewerContent = document.getElementById('docViewerContent');
    const productImage = document.querySelector('.product-detail-image');
    const imageModal = document.getElementById('imageModal');
    const imageModalImg = document.getElementById('imageModalContent');
    const imageModalCaption = document.getElementById('imageModalCaption');
    const imageModalCloseBtn = document.getElementById('imageModalCloseBtn');

    if (!docViewerContent || !imageModal) {
        return;
    }

    const docDisplayElement = docViewerContent.closest('.product-detail-doc-display');
    const initialDocId = docDisplayElement ? docDisplayElement.dataset.initialDocId : null;

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
        docViewerTitle.textContent = 'Select a document';
        docViewerTitle.style.display = 'none';
        docViewerContent.innerHTML = '<p>Select a document from the list to view its content.</p>';
    }

    if (docLinksContainer) {
        docLinksContainer.replaceWith(docLinksContainer.cloneNode(true));
        const newDocLinksContainer = document.querySelector('.product-documentation-links ul');
        if (newDocLinksContainer) {
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

    const productPagePopstateHandler = async (event) => {
        const state = event.state;
        if (state && state.docId && document.querySelector('.product-detail-container')) {
            const currentDocLinksContainer = document.querySelector('.product-documentation-links ul');
            await loadDocumentation(state.docId, state.docTitle);
            if (currentDocLinksContainer) {
                currentDocLinksContainer.querySelectorAll('.doc-link').forEach(link => link.classList.remove('active'));
                const activeLink = currentDocLinksContainer.querySelector(`.doc-link[data-doc-id="${state.docId}"]`);
                if (activeLink) activeLink.classList.add('active');
            }
        } else if (!state && document.querySelector('.product-detail-container')) {
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
    window.addEventListener('popstate', productPagePopstateHandler);

    const currentProductImage = document.querySelector('.product-detail-image');
    const currentImageModal = document.getElementById('imageModal');
    const currentImageModalImg = document.getElementById('imageModalContent');
    const currentImageModalCaption = document.getElementById('imageModalCaption');
    const currentImageModalCloseBtn = document.getElementById('imageModalCloseBtn');

    if (currentProductImage && currentImageModal && currentImageModalImg && currentImageModalCloseBtn) {
        currentProductImage.replaceWith(currentProductImage.cloneNode(true));
        const freshProductImage = document.querySelector('.product-detail-image');
        
        if (freshProductImage) {
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

    const imageModalEscapeHandler = (event) => {
        const activeImageModal = document.getElementById('imageModal');
        if (event.key === 'Escape' && activeImageModal && activeImageModal.style.display === 'block') {
            activeImageModal.style.display = 'none';
        }
    };
    document.addEventListener('keydown', imageModalEscapeHandler);
}

document.addEventListener('DOMContentLoaded', () => {
    initializeProductDetailPageInteractions();
});

const mainContent = document.querySelector('main');
if (mainContent) {
    mainContent.addEventListener('mainContentReloaded', (event) => {
        if (document.querySelector('.product-detail-container')) {
            initializeProductDetailPageInteractions();
        }
    });
} else {
    console.error('Main content element not found for mainContentReloaded listener in product-detail.js');
} 