// Chatbot Widget JavaScript

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
const CHAT_LOG_STORAGE_KEY = 'chatLogPersistent';
const CHATBOT_TYPE = 'product-assistant'; // The type of chatbot this widget uses
const CHATBOT_API_BASE_PATH = '/api/chatbot';
const CHATBOT_API_ENDPOINT = `${CHATBOT_API_BASE_PATH}/${CHATBOT_TYPE}`;
const CHATBOT_STATUS_ENDPOINT = `${CHATBOT_API_ENDPOINT}/status`;
const INTRODUCTORY_MESSAGE = {
    text: "Hello! I'm your Product Assistant. How can I help you find the perfect product today?",
    sender: 'bot',
    isHTML: true
};

// --- Function Definitions ---

function renderChatLog() {
    if (!messagesContainer) {
         console.error("[renderChatLog] messagesContainer is null! Cannot render.");
         return;
    }
    messagesContainer.innerHTML = ''; 
    chatLog.forEach(entry => {
        addMessage(entry.text, entry.sender, entry.isHTML);
    });
}

function saveChatLog() {
    localStorage.setItem(CHAT_LOG_STORAGE_KEY, JSON.stringify(chatLog));
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
         console.error("[addMessage] messagesContainer is null! Cannot append message.");
         return;
    }
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Intercept links in HTML messages
    if (isHTML) {
        const links = messageElement.querySelectorAll('a');
        links.forEach(link => {
            // Only intercept relative links or links to the same origin
            if (link.hostname === window.location.hostname || !link.hostname) {
                link.addEventListener('click', function(event) {
                    event.preventDefault();
                    const url = this.href;
                    console.log('Chatbot link clicked, dispatching backgroundNavigationRequest for:', url);
                    const navEvent = new CustomEvent('backgroundNavigationRequest', {
                        detail: { url: url },
                        bubbles: true, 
                        cancelable: true
                    });
                    document.dispatchEvent(navEvent);
                });
            }
        });
        
        // Make product recommendation cards clickable
        const productCards = messageElement.querySelectorAll('.product-recommendation');
        productCards.forEach(card => {
            const titleLink = card.querySelector('h4 a');
            if (titleLink) {
                const url = titleLink.href;
                
                // Add click event to the entire card
                card.addEventListener('click', function(event) {
                    // Only prevent default if it wasn't the link itself that was clicked
                    if (event.target.tagName === 'A') {
                        // Let the link's own click handler handle it
                        return;
                    }
                    
                    // For any other element in the card, manually trigger navigation
                    event.preventDefault();
                    console.log('Product card clicked, dispatching backgroundNavigationRequest for:', url);
                    const navEvent = new CustomEvent('backgroundNavigationRequest', {
                        detail: { url: url },
                        bubbles: true,
                        cancelable: true
                    });
                    document.dispatchEvent(navEvent);
                });
            }
        });
    }
}

function clearChatHistory() {
    if (confirm("Are you sure you want to clear the chat history?")) {
        chatLog = [INTRODUCTORY_MESSAGE]; 
        
        localStorage.removeItem('chatSessionId');
        let newSessionId = "user_" + Date.now();
        localStorage.setItem('chatSessionId', newSessionId);

        saveChatLog();
        renderChatLog(); 
    }
}

function initializeChat() {
    const storedLog = localStorage.getItem(CHAT_LOG_STORAGE_KEY);

    if (storedLog) {
        try {
            chatLog = JSON.parse(storedLog);
            if (chatLog.length === 0) { 
                chatLog.push(INTRODUCTORY_MESSAGE);
            }
        } catch (e) {
            console.error('[initializeChat] Error parsing chat log from localStorage:', e);
            chatLog = [INTRODUCTORY_MESSAGE]; 
            localStorage.removeItem(CHAT_LOG_STORAGE_KEY); 
        }
    } else {
        chatLog = [INTRODUCTORY_MESSAGE]; 
    }
    renderChatLog();
    saveChatLog();

    let sessionId = localStorage.getItem('chatSessionId');
    if (!sessionId) {
        sessionId = "user_" + Date.now();
        localStorage.setItem('chatSessionId', sessionId);
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
        .then(response => response.json())
        .then(data => {
            chatbotEnabled = !!data.enabled;
            if (!chatbotEnabled) {
                console.warn('Chatbot is disabled:', data.message);
                // Hide the entire chatbot UI when disabled
                hideChatbotUI();
            } else {
                // Show only the chatbot icon initially
                showChatbotIcon();
                
                // Reset message content if needed
                if (chatLog.length === 1 && chatLog[0].sender === 'bot' && 
                    chatLog[0].text !== INTRODUCTORY_MESSAGE.text) {
                    // Replace with regular intro message
                    chatLog[0] = INTRODUCTORY_MESSAGE;
                    saveChatLog();
                    renderChatLog();
                }
                
                // Enable input
                if (chatInput) chatInput.disabled = false;
                if (sendButton) sendButton.disabled = false;
            }
        })
        .catch(error => {
            console.error('Error checking chatbot status:', error);
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
    if (!chatInput) { console.error("sendMessage: chatInput is null"); return; }
    if (!chatbotEnabled) {
        console.warn("Cannot send message: chatbot is disabled");
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

    let sessionId = localStorage.getItem('chatSessionId');
    if (!sessionId) {
        sessionId = "user_" + Date.now();
        localStorage.setItem('chatSessionId', sessionId);
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
        
        eventSource.onmessage = function(event) {
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
                console.error('Error processing SSE message:', error, event.data);
            }
        };
        
        eventSource.onerror = function(error) {
            console.error('SSE Error:', error);
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
                            localStorage.setItem('chatSessionId', dataPayload.session_id);
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
            console.error('Fetch error:', error);
            const errorMsg = 'Error: Could not connect to the bot server. ' + error.message;
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
document.addEventListener('DOMContentLoaded', function() {
    if (!chatWindow || !chatToggle || !messagesContainer || !chatInput || !sendButton || !minimizeChatButton || !clearChatButton) {
         console.error("Chatbot Widget Error: One or more essential DOM elements are missing. Ensure HTML structure is correct and IDs match.");
         return;
    }

    // Initially hide the chatbot UI until we confirm status
    hideChatbotUI();

    // Set up event listeners
    chatToggle.addEventListener('click', function(e) {
        e.preventDefault();
        openChatWindow();
        // Ensure chat content is visible and up-to-date
        if (messagesContainer) {
            setTimeout(() => {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }, 100);
        }
    });

    minimizeChatButton.addEventListener('click', function(e) {
        e.preventDefault();
        closeChatWindow();
    });

    sendButton.addEventListener('click', sendMessage);
    
    chatInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    
    clearChatButton.addEventListener('click', clearChatHistory);

    // Close SSE connection when page is unloaded
    window.addEventListener('beforeunload', closeEventSource);

    // Set up listener for mainContentReloaded when loading new pages in the background
    document.addEventListener('mainContentReloaded', function(event) {
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

    initializeChat(); 
}); 