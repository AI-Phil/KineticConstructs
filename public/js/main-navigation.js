document.addEventListener('DOMContentLoaded', () => {
    const mainContentElement = document.querySelector('main'); // Or a more specific selector if needed

    if (!mainContentElement) {
        console.error('Main content element not found. Background navigation will not work.');
        return;
    }

    async function loadContent(url, isPopState = false) {
        console.log(`Loading content for URL: ${url}, popstate: ${isPopState}`);
        try {
            const response = await fetch(url, {
                headers: {
                    'X-Request-Partial': 'true'
                }
            });

            if (!response.ok) {
                console.error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
                window.location.href = url; // Fallback to full navigation on error
                return;
            }

            const htmlText = await response.text();
            const newTitle = response.headers.get('X-Page-Title');

            mainContentElement.innerHTML = htmlText;
            
            if (newTitle) {
                document.title = newTitle;
            }

            if (!isPopState) {
                history.pushState({ path: url }, '', url);
            }

            // Dispatch a custom event that other scripts can listen to for re-initialization.
            const contentUpdateEvent = new CustomEvent('mainContentReloaded', {
                detail: { container: mainContentElement, newPageUrl: url },
                bubbles: true,
                cancelable: true
            });
            mainContentElement.dispatchEvent(contentUpdateEvent);

        } catch (error) {
            console.error('Error during background navigation:', error);
            window.location.href = url; // Fallback to full navigation on error
        }
    }

    document.addEventListener('backgroundNavigationRequest', async (event) => {
        if (event.detail && event.detail.url) {
            loadContent(event.detail.url, false);
        }
    });

    window.addEventListener('popstate', async (event) => {
        if (event.state && event.state.path) {
            loadContent(event.state.path, true);
        } else if (!event.state && window.location.pathname !== '/') { 
            // If there's no state from popstate (e.g. initial load, manual hash change, or back to a non-SPA page)
            // and we are not at the root, a full reload might be safest to ensure consistency.
            // However, avoid this for the very first page load at root if it has no state.
            console.log('Popstate event with no state or path. Current location:', window.location.href, 'Performing full reload.');
            window.location.reload();
        }
    });
}); 