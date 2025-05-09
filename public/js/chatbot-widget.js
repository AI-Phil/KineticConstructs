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
const CHAT_LOG_STORAGE_KEY = 'chatLogPersistent';
const INTRODUCTORY_MESSAGE = {
    text: "Hello! I'm your Product Assistant. How can I help you find the perfect product today?",
    sender: 'bot',
    isMarkdown: false
};

// --- Function Definitions ---

function renderChatLog() {
    if (!messagesContainer) {
         console.error("[renderChatLog] messagesContainer is null! Cannot render.");
         return;
    }
    messagesContainer.innerHTML = ''; 
    chatLog.forEach(entry => {
        addMessage(entry.text, entry.sender, entry.isMarkdown);
    });
}

function saveChatLog() {
    localStorage.setItem(CHAT_LOG_STORAGE_KEY, JSON.stringify(chatLog));
}

function addMessage(text, sender, isMarkdown = false, messageId = null) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message', sender);
    if (messageId) {
        messageElement.id = messageId;
    }

    if (messageId && messageId.startsWith('thinking-')) {
        messageElement.classList.add('thinking-indicator');
        messageElement.innerHTML = '<span></span><span></span><span></span>';
    } else if (isMarkdown && typeof marked !== 'undefined') {
        try {
            const parsedMarkdown = marked.parse(text);
            messageElement.innerHTML = parsedMarkdown;
        } catch (error) {
            console.error('Markdown parsing error:', error);
            messageElement.textContent = text; 
        }
    } else {
        messageElement.textContent = text;
    }
    
    if (!messagesContainer) {
         console.error("[addMessage] messagesContainer is null! Cannot append message.");
         return;
    }
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Intercept links if the message was rendered from Markdown
    if (isMarkdown) {
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
                        bubbles: true, // Allow event to bubble up to document
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
}

function sendMessage() {
    if (!chatInput) { console.error("sendMessage: chatInput is null"); return; }
    const messageText = chatInput.value.trim();
    if (!messageText) return;

    addMessage(messageText, 'user');
    chatLog.push({ text: messageText, sender: 'user', isMarkdown: false });
    saveChatLog();

    chatInput.value = '';

    let sessionId = localStorage.getItem('chatSessionId');
    if (!sessionId) {
        sessionId = "user_" + Date.now();
        localStorage.setItem('chatSessionId', sessionId);
    }

    const thinkingMsgId = 'thinking-' + Date.now();
    addMessage("...", 'bot', false, thinkingMsgId);

    if (typeof productAssistantUrl === 'undefined') {
        console.error("productAssistantUrl is not defined. Please ensure it's set globally.");
        const thinkingMsgElement = document.getElementById(thinkingMsgId);
        if (thinkingMsgElement) thinkingMsgElement.remove();
        addMessage("Configuration error: Cannot connect to the bot server.", 'bot');
        return;
    }
    
    const payload = {
        "input_value": messageText,
        "output_type": "chat",
        "input_type": "chat",
        "user_id": sessionId, 
        "session_id": sessionId 
    };

    fetch(productAssistantUrl, {
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
        let botResponseIsMarkdown = false;
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
                        botResponseIsMarkdown = true;
                    }
                }
            }
        }
        if (typeof botResponseMessageText === 'undefined') {
            if (data && data.outputs && data.outputs.length > 0) {
                try {
                    botResponseMessageText = JSON.stringify(data.outputs[0], null, 2);
                } catch (e) {
                    botResponseMessageText = "[Error displaying message content]";
                }
            } else {
                botResponseMessageText = "[No response or unexpected format from bot server]";
            }
            botResponseIsMarkdown = false;
        }
        if (botResponseMessageText) {
            addMessage(botResponseMessageText, 'bot', botResponseIsMarkdown);
            chatLog.push({ text: botResponseMessageText, sender: 'bot', isMarkdown: botResponseIsMarkdown });
        } else {
            const anErrorOccurredMsg = "I'm sorry, an unexpected issue occurred while processing the response.";
            addMessage(anErrorOccurredMsg, 'bot', false);
            chatLog.push({ text: anErrorOccurredMsg, sender: 'bot', isMarkdown: false });
        }
        saveChatLog();
    })
    .catch(error => {
        console.error('Fetch error:', error);
        const errorMsg = 'Error: Could not connect to the bot server. ' + error.message;
        addMessage(errorMsg, 'bot', false);
        chatLog.push({ text: errorMsg, sender: 'bot', isMarkdown: false });
        saveChatLog();
    })
    .finally(() => {
        const thinkingMsgElement = document.getElementById(thinkingMsgId);
        if (thinkingMsgElement) {
            thinkingMsgElement.remove();
        }
    });
}

// --- Event Listeners and Initialization ---
document.addEventListener('DOMContentLoaded', function() {
    if (!chatWindow || !chatToggle || !messagesContainer || !chatInput || !sendButton || !minimizeChatButton || !clearChatButton) {
         console.error("Chatbot Widget Error: One or more essential DOM elements are missing. Ensure HTML structure is correct and IDs match.");
         return;
    }
    
    if (typeof marked === 'undefined') {
        console.warn("Marked library is not loaded. Markdown rendering will be disabled for chatbot messages.");
    } else {
        marked.setOptions({
            breaks: true,
            gfm: true
        });
    }

    chatToggle.addEventListener('click', () => {
        chatWindow.classList.toggle('active');
        chatToggle.style.display = chatWindow.classList.contains('active') ? 'none' : 'flex';
    });

    minimizeChatButton.addEventListener('click', () => {
        chatWindow.classList.remove('active');
        chatToggle.style.display = 'flex';
    });

    sendButton.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    clearChatButton.addEventListener('click', clearChatHistory);

    initializeChat(); 
}); 