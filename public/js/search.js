// This file now handles interactions specifically on the /search page

document.addEventListener('DOMContentLoaded', () => {
    const tagSearchInput = document.getElementById('tagSearchInput');
    const availableTagsList = document.querySelector('.available-tags ul');
    const hierarchyFilter = document.querySelector('.hierarchy-filter'); // Get hierarchy container

    // --- Tag Search Input Filtering ---
    if (tagSearchInput && availableTagsList) {
        tagSearchInput.addEventListener('input', (event) => {
            const searchTerm = event.target.value.toLowerCase();
            const listItems = availableTagsList.querySelectorAll('li');
            
            listItems.forEach(li => {
                const tagName = li.getAttribute('data-tag-name') || '';
                if (tagName.includes(searchTerm)) {
                    li.style.display = ''; // Show if matches
                } else {
                    li.style.display = 'none'; // Hide if doesn't match
                }
            });
        });
    }

    // --- Hierarchy Dropdown Toggle ---
    if (hierarchyFilter) {
        hierarchyFilter.addEventListener('click', (event) => {
            const dropbtn = event.target.closest('.dropbtn');
            if (dropbtn) {
                event.preventDefault(); // Prevent link navigation
                
                const dropdown = dropbtn.closest('.nav-item.dropdown');
                if (!dropdown) return;

                // Toggle active class on the clicked dropdown
                const currentlyActive = dropdown.classList.contains('active');
                
                // Close all other dropdowns first
                hierarchyFilter.querySelectorAll('.nav-item.dropdown.active').forEach(activeDropdown => {
                    if (activeDropdown !== dropdown) { // Don't close the one we just clicked if it was already open
                         activeDropdown.classList.remove('active');
                    }
                });

                // Toggle the clicked one
                if (currentlyActive) {
                    dropdown.classList.remove('active');
                } else {
                    dropdown.classList.add('active');
                }
            }
            // Allow clicks on dropdown-content links to proceed as normal navigation
        });
    }

    // --- Make Product Cards Clickable (Navigate to data-href) ---
    const productGrid = document.querySelector('.product-grid');
    if (productGrid) {
        productGrid.addEventListener('click', (event) => {
            // Find the closest parent product card
            const card = event.target.closest('.product-card.product-card-link');
            
            // Check if the click originated from within a tag link inside the card
            const isClickOnTagLink = event.target.closest('.tag-link');

            // Only navigate if the click is on the card itself (or its non-link children)
            // AND not on an actual tag link inside the card.
            if (card && !isClickOnTagLink) {
                const targetUrl = card.dataset.href;
                if (targetUrl) {
                    window.location.href = targetUrl; // Navigate to the product page
                }
            }
            // If the click was on a tag-link, the browser's default link behavior will handle it.
        });
    }

    // --- Toggle Filter Sidebar Visibility via Hamburger ---
    const hamburgerBtn = document.getElementById('mobile-menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-product-area'); // To detect clicks outside

    if (hamburgerBtn && sidebar) {
        hamburgerBtn.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent click from immediately closing sidebar if logic below is added
            sidebar.classList.toggle('sidebar-visible');
        });
    }

    // Optional: Close sidebar if clicking outside of it
    if (mainContent && sidebar) {
        document.addEventListener('click', (event) => {
            // Check if sidebar is visible and the click was not on the sidebar or the toggle button
            if (sidebar.classList.contains('sidebar-visible') && 
                !sidebar.contains(event.target) && 
                !hamburgerBtn.contains(event.target)) {
                sidebar.classList.remove('sidebar-visible');
            }
        });
    }

    // --- Other potential search page interactions (e.g., advanced hierarchy toggles) could go here ---

});

/* 
   Removed modal logic as it's no longer used on the search page.
   The search page now relies on standard link navigation with query parameters.
   Product details are handled on the separate /product/:id page.
*/ 