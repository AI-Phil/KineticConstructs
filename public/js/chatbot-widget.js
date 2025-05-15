// Chatbot Widget JavaScript
// 
// This widget creates a dynamic chat interface that can be configured for different chatbot types.
// To use this widget:
// 1. Include this script in your HTML
// 2. Add the required HTML elements with the expected IDs (chat-widget, chat-toggle, etc.)
// 3. Configure the chatbot using either:
//    - A data-config attribute on the #chat-widget element: 
//      <div id="chat-widget" data-config='{"chatbotType":"support-assistant","introductoryMessage":{"text":"Hello!","sender":"bot","isHTML":true},"persistChat":true}'></div>
//    - The global initChatbot() function: 
//      window.initChatbot({chatbotType: "product-assistant", persistChat: true, introductoryMessage: {...}})
//
// Configuration options:
// - chatbotType: String identifying which backend chatbot endpoint to use (required)
// - introductoryMessage: Object with text, sender, and isHTML properties for welcome message
// - persistChat: Boolean to control if chat history should be stored in localStorage

// DOM Element Selectors
const chatWindow = document.getElementById('chat-widget');
const chatToggle = document.getElementById('chat-toggle');
const messagesContainer = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input-text');
const sendButton = document.getElementById('chat-send-button');
const minimizeChatButton = document.getElementById('minimize-chat');
const clearChatButton = document.getElementById('clear-chat-button-header');

// State and Constants
let chatLog = [];
let currentEventSource = null; // Track current SSE connection
let chatbotEnabled = false; // Track if the chatbot is available
let isChatOpen = false; // Track if chat window is currently open
let chatbotConfig = {}; // Will hold the actual configuration
let isWidgetInitialized = false; // Track if widget has been initialized

// API Endpoints (will be set after config is loaded)
let CHATBOT_API_BASE_PATH;
let CHATBOT_API_ENDPOINT;
let CHATBOT_STATUS_ENDPOINT;
let CHAT_LOG_STORAGE_KEY;

// --- Function Definitions ---

function renderChatLog() {
    if (!messagesContainer) {
        console.error("Error: Chat messages container not found. UI render failed.");
        return;
    }
    messagesContainer.innerHTML = '';
    chatLog.forEach(entry => {
        addMessage(entry.text, entry.sender, entry.isHTML);
    });
}

function saveChatLog() {
    if (chatbotConfig.persistChat) {
        localStorage.setItem(CHAT_LOG_STORAGE_KEY, JSON.stringify(chatLog));
    }
}

function addMessage(text, sender, isHTML = false, messageId = null) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message', sender);
    if (messageId) {
        messageElement.id = messageId;
    }

    // Handle displaying HTML content or plain text
    if (isHTML) {
        messageElement.innerHTML = text;
    } else {
        messageElement.textContent = text;
    }

    if (!messagesContainer) {
        console.error("Error: Chat messages container not found. Cannot append message.");
        return;
    }
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // We'll handle all clicks on product recommendations and links through delegation instead
    // of attaching individual event listeners to each element
}

function clearChatHistory() {
    if (confirm("Are you sure you want to clear the chat history?")) {
        chatLog = [chatbotConfig.introductoryMessage];

        localStorage.removeItem('chatSessionId_' + chatbotConfig.chatbotType);
        let newSessionId = "user_" + Date.now();
        localStorage.setItem('chatSessionId_' + chatbotConfig.chatbotType, newSessionId);

        saveChatLog();
        renderChatLog();
    }
}

/**
 * Initialize the chatbot with configuration parameters
 * @param {Object} config - Configuration object
 * @param {string} config.chatbotType - Type of chatbot to use (e.g., "product-assistant", "support-agent")
 * @param {Object} config.introductoryMessage - Welcome message when chat starts
 * @param {string} config.introductoryMessage.text - Message text content
 * @param {string} config.introductoryMessage.sender - Sender (typically "bot")
 * @param {boolean} config.introductoryMessage.isHTML - Whether text contains HTML
 * @param {boolean} config.persistChat - Whether to store chat history in localStorage
 */
function initializeChatbotConfig(config = {}) {
    // Prevent multiple initializations
    if (isWidgetInitialized) {
        // Silent return without logging - initialization is already done
        return;
    }

    // Validate required configuration
    if (!config.chatbotType) {
        console.error('Chatbot initialization failed: chatbotType is required');
        return;
    }

    // Set up configuration with reasonable defaults for missing values
    chatbotConfig = {
        chatbotType: config.chatbotType,
        persistChat: config.persistChat !== undefined ? config.persistChat : true,
        introductoryMessage: config.introductoryMessage || {
            text: `Hello! I'm a ${config.chatbotType} assistant. How can I help you today?`,
            sender: 'bot',
            isHTML: true
        }
    };

    // Set up API endpoints based on config
    CHATBOT_API_BASE_PATH = '/api/chatbot';
    CHATBOT_API_ENDPOINT = `${CHATBOT_API_BASE_PATH}/${chatbotConfig.chatbotType}`;
    CHATBOT_STATUS_ENDPOINT = `${CHATBOT_API_ENDPOINT}/status`;
    CHAT_LOG_STORAGE_KEY = `chatLog_${chatbotConfig.chatbotType}`;

    // Mark as initialized
    isWidgetInitialized = true;

    // Initialize chat with the new configuration
    initializeChat();
}

function initializeChat() {
    if (chatbotConfig.persistChat) {
        const storedLog = localStorage.getItem(CHAT_LOG_STORAGE_KEY);

        if (storedLog) {
            try {
                chatLog = JSON.parse(storedLog);
                if (chatLog.length === 0) {
                    chatLog.push(chatbotConfig.introductoryMessage);
                }
            } catch (e) {
                console.error('Error: Failed to parse chat history from storage. Starting fresh.');
                chatLog = [chatbotConfig.introductoryMessage];
                localStorage.removeItem(CHAT_LOG_STORAGE_KEY);
            }
        } else {
            chatLog = [chatbotConfig.introductoryMessage];
        }
    } else {
        chatLog = [chatbotConfig.introductoryMessage];
    }

    renderChatLog();
    saveChatLog();

    let sessionId = localStorage.getItem('chatSessionId_' + chatbotConfig.chatbotType);
    if (!sessionId) {
        sessionId = "user_" + Date.now();
        localStorage.setItem('chatSessionId_' + chatbotConfig.chatbotType, sessionId);
    }

    // Check chatbot status on initialization
    checkChatbotStatus();
}

function toggleChatWindow() {
    if (!chatWindow || !chatToggle) return;

    const isVisible = chatWindow.classList.contains('active');

    if (isVisible) {
        // Hide window
        chatWindow.classList.remove('active');
        chatWindow.style.display = 'none';
        chatToggle.style.display = 'flex';
        isChatOpen = false;

        // Close any active stream when hiding the window
        closeEventSource();
    } else {
        // Show window
        chatToggle.style.display = 'none';
        chatWindow.style.display = 'flex';
        setTimeout(() => {
            chatWindow.classList.add('active');
            isChatOpen = true;
        }, 10);
    }
}

function showChatbotIcon() {
    if (chatToggle) {
        chatToggle.style.display = 'flex';
    }
    if (chatWindow) {
        chatWindow.classList.remove('active');
        chatWindow.style.display = 'none';
    }
    isChatOpen = false;
}

function hideChatbotUI() {
    if (chatWindow) {
        chatWindow.classList.remove('active');
        chatWindow.style.display = 'none';
    }
    if (chatToggle) {
        chatToggle.style.display = 'none';
    }
    isChatOpen = false;
}

function checkChatbotStatus() {
    fetch(CHATBOT_STATUS_ENDPOINT)
        .then(response => {
            if (!response.ok && response.status !== 404) {
                // For any error except 404, throw to be caught later
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            chatbotEnabled = !!data.enabled;
            if (!chatbotEnabled) {
                // Only log at debug level - disabled is an expected state
                hideChatbotUI();
            } else {
                // Show only the chatbot icon initially
                showChatbotIcon();

                // Reset message content if needed
                if (chatLog.length === 1 && chatLog[0].sender === 'bot' &&
                    chatLog[0].text !== chatbotConfig.introductoryMessage.text) {
                    // Replace with configured intro message
                    chatLog[0] = chatbotConfig.introductoryMessage;
                    saveChatLog();
                    renderChatLog();
                }

                // Enable input
                if (chatInput) chatInput.disabled = false;
                if (sendButton) sendButton.disabled = false;
            }
        })
        .catch(error => {
            console.error('Error: Chatbot service unavailable');
            chatbotEnabled = false;
            // Hide the entire chatbot UI on error
            hideChatbotUI();
        });
}

// Close any active SSE connection
function closeEventSource() {
    if (currentEventSource) {
        currentEventSource.close();
        currentEventSource = null;
    }
}

function sendMessage() {
    if (!chatInput) {
        console.error("Error: Chat input element not found");
        return;
    }
    if (!chatbotEnabled) {
        // Log warning and display user-friendly message
        console.warn("Chatbot service unavailable");
        addMessage("The chatbot service is currently unavailable. Please try again later.", 'bot', false);
        return;
    }

    const messageText = chatInput.value.trim();
    if (!messageText) return;

    // Clean up any existing SSE connection
    closeEventSource();

    addMessage(messageText, 'user');
    chatLog.push({ text: messageText, sender: 'user', isHTML: false });
    saveChatLog();

    chatInput.value = '';

    let sessionId = localStorage.getItem('chatSessionId_' + chatbotConfig.chatbotType);
    if (!sessionId) {
        sessionId = "user_" + Date.now();
        localStorage.setItem('chatSessionId_' + chatbotConfig.chatbotType, sessionId);
    }

    // Create streaming response container
    const thinkingMsgId = 'thinking-' + Date.now();
    // Add thinking animation while waiting for response
    addMessage('<div class="thinking-dots"><span></span><span></span><span></span></div>', 'bot', true, thinkingMsgId);

    const payload = {
        "input_value": messageText,
        "session_id": sessionId
    };

    // Use server-sent events for streaming responses
    const useStreaming = true;

    if (useStreaming) {
        // Create streaming response container - will replace the thinking dots
        const streamingMsgId = thinkingMsgId;
        let currentStreamedText = '';

        // Set up SSE connection
        const queryParams = new URLSearchParams({
            stream: 'true',
            input_value: messageText,
            session_id: sessionId
        }).toString();

        const eventSource = new EventSource(`${CHATBOT_API_ENDPOINT}?${queryParams}`);
        currentEventSource = eventSource;

        eventSource.onmessage = function (event) {
            try {
                const data = JSON.parse(event.data);

                // Only process messages from "Machine" and ignore "User" events
                if (data.data && data.data.sender === "User") {
                    return;
                }

                const messageElement = document.getElementById(streamingMsgId);
                if (!messageElement) {
                    console.error('Message element not found:', streamingMsgId);
                    return;
                }

                // Handle different event types
                if (data.event === 'add_message' && data.data && data.data.text) {
                    // Replace thinking dots with actual message content on first chunk
                    if (currentStreamedText === '') {
                        messageElement.innerHTML = data.data.text;
                    } else {
                        // Update existing content for subsequent chunks
                        messageElement.innerHTML = data.data.text;
                    }

                    // Update our cached text content
                    currentStreamedText = data.data.text;
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                } else if (data.event === 'token' && data.token) {
                    // Append token to the current message
                    currentStreamedText += data.token;
                    messageElement.innerHTML = currentStreamedText;
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                } else if (data.event === 'end') {
                    // Message complete
                    eventSource.close();
                    currentEventSource = null;

                    // Save the complete message to chat log
                    if (currentStreamedText) {
                        chatLog.push({
                            text: currentStreamedText,
                            sender: 'bot',
                            isHTML: true
                        });
                        saveChatLog();
                    } else {
                        // No content received
                        messageElement.textContent = "I'm sorry, I couldn't generate a response. Please try again.";
                        chatLog.push({
                            text: "I'm sorry, I couldn't generate a response. Please try again.",
                            sender: 'bot',
                            isHTML: false
                        });
                        saveChatLog();
                    }
                }
            } catch (error) {
                console.error('Error: Failed to process streaming message');
            }
        };

        eventSource.onerror = function (error) {
            console.error('Error: Streaming connection failed');
            eventSource.close();
            currentEventSource = null;

            // Handle error in the UI
            const messageElement = document.getElementById(streamingMsgId);
            if (messageElement) {
                messageElement.innerHTML = "I'm sorry, there was an error processing your request. Please try again.";
            }

            // Save error message to chat log
            chatLog.push({
                text: "I'm sorry, there was an error processing your request. Please try again.",
                sender: 'bot',
                isHTML: false
            });
            saveChatLog();
        };
    } else {
        // Non-streaming fallback with regular fetch
        fetch(CHATBOT_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                let botResponseMessageText;
                let botResponseIsHTML = true; // Default to HTML since we're now expecting HTML responses
                if (data && data.outputs && data.outputs.length > 0) {
                    const responseObjectOutputsArrayElement = data.outputs[0];
                    if (responseObjectOutputsArrayElement &&
                        responseObjectOutputsArrayElement.outputs &&
                        Array.isArray(responseObjectOutputsArrayElement.outputs) &&
                        responseObjectOutputsArrayElement.outputs.length > 0) {
                        const targetDataContainer = responseObjectOutputsArrayElement.outputs[0];
                        if (targetDataContainer && typeof targetDataContainer === 'object' &&
                            targetDataContainer.results &&
                            targetDataContainer.results.message &&
                            targetDataContainer.results.message.data) {
                            const dataPayload = targetDataContainer.results.message.data;
                            if (dataPayload.session_id) {
                                localStorage.setItem('chatSessionId_' + chatbotConfig.chatbotType, dataPayload.session_id);
                            }
                            if (typeof dataPayload.text === 'string' && dataPayload.text.trim() !== '') {
                                botResponseMessageText = dataPayload.text;
                            }
                        }
                    }
                }
                if (typeof botResponseMessageText === 'undefined') {
                    if (data && data.outputs && data.outputs.length > 0) {
                        try {
                            botResponseMessageText = JSON.stringify(data.outputs[0], null, 2);
                            botResponseIsHTML = false; // Error message as plain text
                        } catch (e) {
                            botResponseMessageText = "[Error displaying message content]";
                            botResponseIsHTML = false;
                        }
                    } else {
                        botResponseMessageText = "[No response or unexpected format from bot server]";
                        botResponseIsHTML = false;
                    }
                }
                if (botResponseMessageText) {
                    addMessage(botResponseMessageText, 'bot', botResponseIsHTML);
                    chatLog.push({ text: botResponseMessageText, sender: 'bot', isHTML: botResponseIsHTML });
                } else {
                    const anErrorOccurredMsg = "I'm sorry, an unexpected issue occurred while processing the response.";
                    addMessage(anErrorOccurredMsg, 'bot', false);
                    chatLog.push({ text: anErrorOccurredMsg, sender: 'bot', isHTML: false });
                }
                saveChatLog();
            })
            .catch(error => {
                console.error('Error: Network connection failed');
                const errorMsg = 'Error: Could not connect to the bot server. Please try again later.';
                addMessage(errorMsg, 'bot', false);
                chatLog.push({ text: errorMsg, sender: 'bot', isHTML: false });
                saveChatLog();
            })
            .finally(() => {
                const thinkingMsgElement = document.getElementById(thinkingMsgId);
                if (thinkingMsgElement) {
                    thinkingMsgElement.remove();
                }
            });
    }
}

function closeChatWindow() {
    if (chatWindow) {
        chatWindow.classList.remove('active');
        chatWindow.style.display = 'none';
    }
    if (chatToggle) {
        chatToggle.style.display = 'flex';
    }

    // Close any active stream when minimizing
    closeEventSource();
    isChatOpen = false;
}

function openChatWindow() {
    if (chatWindow) {
        chatWindow.style.display = 'flex';
        chatWindow.classList.add('active');
    }
    if (chatToggle) {
        chatToggle.style.display = 'none';
    }
    isChatOpen = true;
}

// --- Event Listeners and Initialization ---
document.addEventListener('DOMContentLoaded', function () {
    if (!chatWindow || !chatToggle || !messagesContainer || !chatInput || !sendButton || !minimizeChatButton || !clearChatButton) {
        console.error("Error: Required chatbot UI elements not found. Please check HTML structure.");
        return;
    }

    // Initially hide the chatbot UI until we confirm status
    hideChatbotUI();

    // Set up event listeners
    chatToggle.addEventListener('click', function (e) {
        e.preventDefault();
        openChatWindow();
        // Ensure chat content is visible and up-to-date
        if (messagesContainer) {
            setTimeout(() => {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }, 100);
        }
    });

    minimizeChatButton.addEventListener('click', function (e) {
        e.preventDefault();
        closeChatWindow();
    });

    sendButton.addEventListener('click', sendMessage);

    chatInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    clearChatButton.addEventListener('click', clearChatHistory);

    // Delegated event handler for all product recommendations and links
    if (messagesContainer) {
        messagesContainer.addEventListener('click', function (e) {
            // Handler for product recommendation cards (both article elements and .product-recommendation elements)
            const productCard = e.target.closest('article') || e.target.closest('.product-recommendation');

            if (productCard) {
                // Find the first link in the card which should be the product link
                const titleLink = productCard.querySelector('h4 a');

                if (titleLink) {
                    // If the click was directly on the link, handle it the same as the card click
                    // to keep chat window open
                    if (e.target === titleLink || titleLink.contains(e.target)) {
                        e.preventDefault();
                        const url = titleLink.href;

                        // Dispatch background navigation event
                        const navEvent = new CustomEvent('backgroundNavigationRequest', {
                            detail: { url: url },
                            bubbles: true,
                            cancelable: true
                        });
                        document.dispatchEvent(navEvent);
                        return;
                    }

                    const url = titleLink.href;
                    e.preventDefault();

                    // Dispatch background navigation event
                    const navEvent = new CustomEvent('backgroundNavigationRequest', {
                        detail: { url: url },
                        bubbles: true,
                        cancelable: true
                    });
                    document.dispatchEvent(navEvent);
                }
                return;
            }

            // Handler for all other links in the chat
            const link = e.target.closest('a');
            if (link && !e.defaultPrevented) {
                // Only for same-origin links
                if (link.hostname === window.location.hostname || !link.hostname) {
                    e.preventDefault();
                    const url = link.href;

                    // Dispatch background navigation event
                    const navEvent = new CustomEvent('backgroundNavigationRequest', {
                        detail: { url: url },
                        bubbles: true,
                        cancelable: true
                    });
                    document.dispatchEvent(navEvent);
                }
            }
        });
    }

    // Close SSE connection when page is unloaded
    window.addEventListener('beforeunload', closeEventSource);

    // Set up listener for mainContentReloaded when loading new pages in the background
    document.addEventListener('mainContentReloaded', function (event) {
        // Restore the chat window state based on the isChatOpen flag
        if (isChatOpen) {
            // If chat was open, keep it open
            if (chatWindow) {
                chatWindow.style.display = 'flex';
                chatWindow.classList.add('active');
            }
            if (chatToggle) {
                chatToggle.style.display = 'none';
            }
        } else {
            // If chat was closed, keep it closed but show the toggle button
            if (chatbotEnabled && chatToggle) {
                chatToggle.style.display = 'flex';
            }
            if (chatWindow) {
                chatWindow.classList.remove('active');
                chatWindow.style.display = 'none';
            }
        }
    });

    // Add listener for backgroundNavigationRequest to ensure chat stays open
    document.addEventListener('backgroundNavigationRequest', function (event) {
        // Mark that we want to keep the chat open during navigation
        // No action needed - the mainContentReloaded handler will keep chat open
    });

    // Check if we've already been initialized through a script tag before this runs
    if (!isWidgetInitialized) {
        // Not yet initialized, try to get config from data attribute
        if (chatWindow) {
            try {
                const configAttr = chatWindow.getAttribute('data-config');
                if (configAttr) {
                    const config = JSON.parse(configAttr);
                    initializeChatbotConfig(config);
                }
                // If no data-config attribute, don't log anything as it may be initialized by script later
            } catch (e) {
                console.error("Error parsing chatbot configuration:", e);
            }
        }
    }
});

// Export configuration function for external use
window.initChatbot = initializeChatbotConfig; 