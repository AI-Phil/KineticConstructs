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

    if (docLinksContainer) {
        docLinksContainer.addEventListener('click', async (event) => {
            const docLink = event.target.closest('.doc-link');
            if (docLink) {
                event.preventDefault();
                const docId = docLink.getAttribute('data-doc-id');
                
                // Visually indicate active link (optional)
                docLinksContainer.querySelectorAll('.doc-link').forEach(link => link.classList.remove('active'));
                docLink.classList.add('active');

                await loadDocumentation(docId);
            }
        });
    }

    // Function to fetch and display documentation in the right panel
    async function loadDocumentation(docId) {
        docViewerTitle.textContent = 'Loading...';
        docViewerContent.innerHTML = '<p>Loading...</p>';

        try {
            const response = await fetch(`/api/document/${docId}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();

            docViewerTitle.textContent = data.title || 'Documentation';
            docViewerTitle.style.display = 'block';
            docViewerContent.innerHTML = data.htmlContent;

        } catch (error) {
            console.error('Error fetching documentation:', error);
            docViewerTitle.textContent = 'Error';
            docViewerContent.innerHTML = '<p>Could not load document content. Please try again later.</p>';
        }
    }

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