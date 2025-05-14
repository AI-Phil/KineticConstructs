document.addEventListener('DOMContentLoaded', () => {
    const mainContentElement = document.querySelector('main'); // Or a more specific selector if needed

    if (!mainContentElement) {
        console.error('Main content element not found. Background navigation will not work.');
        return;
    }

    // Function to attach click handlers to all internal links
    function setupBackgroundNavigationLinks(container = document) {
        const links = container.querySelectorAll('a[href^="/"]:not([data-bypass-background-nav])');
        links.forEach(link => {
            // Skip external links or links with the bypass attribute
            if (link.hostname !== window.location.hostname || link.getAttribute('data-bypass-background-nav') === 'true') {
                return;
            }
            
            link.addEventListener('click', function(event) {
                // Don't capture if user pressed modifier keys (to open in new tab, etc.)
                if (event.ctrlKey || event.metaKey || event.shiftKey) {
                    return;
                }
                
                event.preventDefault();
                const url = this.href;
                
                // Use the same loadContent function as for backgroundNavigationRequest
                loadContent(url, false);
            });
        });
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

            // Remove duplicate navigation elements before inserting content
            let tempContainer = document.createElement('div');
            tempContainer.innerHTML = htmlText;
            
            // Remove any navigation elements that might be included in the fetched content
            const duplicateNavs = tempContainer.querySelectorAll('nav');
            duplicateNavs.forEach(nav => {
                // Only remove navigation elements that appear to be main navigation
                // Check if this nav contains links to Home or Search Products
                const navLinks = nav.querySelectorAll('a');
                let isMainNav = false;
                navLinks.forEach(link => {
                    if (link.textContent.includes('Home') || link.textContent.includes('Search Products')) {
                        isMainNav = true;
                    }
                });
                
                if (isMainNav) {
                    nav.parentNode.removeChild(nav);
                }
            });
            
            // Update the content with the cleaned HTML
            mainContentElement.innerHTML = tempContainer.innerHTML;
            
            if (newTitle) {
                document.title = newTitle;
            }

            if (!isPopState) {
                history.pushState({ path: url }, '', url);
            }

            // Set up click handlers for all links in the new content
            setupBackgroundNavigationLinks(mainContentElement);

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
    
    // Set up initial click handlers
    setupBackgroundNavigationLinks();
}); 