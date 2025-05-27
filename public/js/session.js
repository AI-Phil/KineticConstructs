// Session utility functions for use across scripts

/**
 * Get a cookie by name
 * @param {string} name
 * @returns {string|null}
 */
export function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for(let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

/**
 * Set a cookie with 30-day expiration by default
 * @param {string} name
 * @param {string} value
 * @param {number} days
 */
export function setCookie(name, value, days = 30) {
    let expires = "";
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax";
}

/**
 * Delete a cookie by setting it to expire in the past
 * @param {string} name
 * @param {string} path
 */
export function deleteCookie(name, path = "/") {
    document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=" + path + ";";
}

/**
 * Generate a UUID v4
 * @returns {string}
 */
export function generateUUID() { // Public Domain/MIT
    let d = new Date().getTime();//Timestamp
    let d2 = ((typeof performance !== 'undefined') && performance.now && (performance.now()*1000)) || 0;//Time in microseconds since page-load or 0 if unsupported
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        let r = Math.random() * 16;//random number between 0 and 16
        if(d > 0){//Use timestamp until depleted
            r = (d + r)%16 | 0;
            d = Math.floor(d/16);
        } else {//Use microseconds since page-load if supported
            r = (d2 + r)%16 | 0;
            d2 = Math.floor(d2/16);
        }
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

/**
 * Check if a session ID is valid (exists and is not empty)
 * @param {string} sessionId
 * @returns {boolean}
 */
export function isValidSessionId(sessionId) {
    return sessionId && sessionId.trim().length > 0 && sessionId !== 'undefined' && sessionId !== 'null';
}

/**
 * Get or create a persistent session ID
 * @param {string} cookieName
 * @param {number} days
 * @returns {string}
 */
export function getOrCreateSessionId(cookieName, days = 30) {
    let sessionId = getCookie(cookieName);
    
    if (!isValidSessionId(sessionId)) {
        sessionId = generateUUID();
        setCookie(cookieName, sessionId, days);
        console.log(`New session ID generated: ${sessionId}`);
    } else {
        console.log(`Using existing session ID: ${sessionId}`);
        // Refresh the cookie expiration to extend the session
        setCookie(cookieName, sessionId, days);
    }
    
    return sessionId;
}

/**
 * Debug function to log all cookies
 */
export function debugCookies() {
    console.log('All cookies:', document.cookie);
    const cookies = document.cookie.split(';').reduce((acc, cookie) => {
        const [name, value] = cookie.trim().split('=');
        acc[name] = value;
        return acc;
    }, {});
    console.table(cookies);
}

/**
 * Check if session is persistent across page reloads
 * @param {string} cookieName
 * @returns {Object} Session persistence info
 */
export function checkSessionPersistence(cookieName) {
    const sessionId = getCookie(cookieName);
    const lastCheck = localStorage.getItem(`${cookieName}_lastCheck`);
    const currentTime = Date.now();
    
    const info = {
        sessionId: sessionId,
        isValid: isValidSessionId(sessionId),
        lastCheck: lastCheck ? new Date(parseInt(lastCheck)) : null,
        timeSinceLastCheck: lastCheck ? currentTime - parseInt(lastCheck) : null,
        isPersistent: !!sessionId && !!lastCheck
    };
    
    // Update last check time
    localStorage.setItem(`${cookieName}_lastCheck`, currentTime.toString());
    
    return info;
} 