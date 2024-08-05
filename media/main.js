const vscode = acquireVsCodeApi();
const chatContainer = document.getElementById('chat-container');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const loading = document.getElementById('loading');

vscode.postMessage({ type: 'viewReady' });

function sendMessage() {
    const message = userInput.value.trim();
    if (message) {
        loading.style.display = 'block';
        vscode.postMessage({
            type: 'userInput',
            value: message
        });
        userInput.value = '';
    }
}

sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
});

function addMessageToUI(message, sender) {
    loading.style.display = 'none';
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', sender);
    messageElement.textContent = message;
    chatContainer.appendChild(messageElement);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

window.addEventListener('message', event => {
    const message = event.data;
    switch (message.type) {
        case 'addMessage':
            addMessageToUI(message.value, message.sender);
            break;
    }
});
