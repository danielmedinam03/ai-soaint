const vscode = require('vscode');
const axios = require('axios');
const path = require('path');

function activate(context) {
    console.log('Activating extension');
    const provider = new ChatViewProvider(context.extensionUri, context.globalState);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, provider)
    );
}

class ChatViewProvider {
    static viewType = 'tuExtensionInputView';

    constructor(extensionUri, globalState) {
        this._extensionUri = extensionUri;
        this._view = undefined;
        this._globalState = globalState;
        this._messages = this._globalState.get('chatMessages', []);
        console.log('ChatViewProvider constructed', this._messages);
    }

    resolveWebviewView(webviewView, context, _token) {
        console.log('Resolving webview view');
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(message => {
            if (message.type === 'viewReady') {
                console.log('View ready, restoring messages');
                this._restoreMessages();
            } else if (message.type === 'userInput') {
                this._handleUserInput(message.value);
            }
        });

        // Mantener la vista
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                console.log('View became visible, restoring messages');
                this._restoreMessages();
            }
        });
    }

    _restoreMessages() {
        console.log('Restoring messages', this._messages);
        this._messages.forEach(message => {
            this._view.webview.postMessage(message);
        });
    }

    async _handleUserInput(input) {
        console.log('Handling user input', input);
        const userMessage = { type: 'addMessage', value: input, sender: 'user' };
        this._addMessage(userMessage);

        try {
            const currentFileContent = await this._getCurrentFileContent();
            const payload = {
                text: input,
                context: currentFileContent ? JSON.stringify(currentFileContent) : ''
            };
            const response = await axios.post('http://127.0.0.1:5000/chat', payload);
            const botMessage = { type: 'addMessage', value: response.data.response || JSON.stringify(response.data, null, 2), sender: 'bot' };
            this._addMessage(botMessage);
        } catch (error) {
            const errorMessage = { type: 'addMessage', value: `Error: ${error.message}`, sender: 'bot' };
            this._addMessage(errorMessage);
        }
    }

    _addMessage(message) {
        this._messages.push(message);
        this._view.webview.postMessage(message);
        this._saveMessages();
    }

    _saveMessages() {
        console.log('Saving messages', this._messages);
        this._globalState.update('chatMessages', this._messages);
    }

    async _getCurrentFileContent() {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const fileContent = document.getText();
            const fileName = path.basename(document.fileName);
            return { file: fileName, content: fileContent };
        }
        return null;
    }

    _getHtmlForWebview(webview) {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Chat</title>
            <style>
                :root {
                    --background-color: #1e1e1e;
                    --foreground-color: #ffffff;
                    --user-bg-color: #3a3d41;
                    --bot-bg-color: #252526;
                    --border-color: #3a3a3a;
                    --button-bg-color: #007acc;
                    --button-hover-bg-color: #005f9e;
                }
                body {
                    font-family: var(--vscode-font-family, sans-serif);
                    font-size: var(--vscode-font-size, 16px);
                    color: var(--foreground-color);
                    background-color: var(--background-color);
                    padding: 0;
                    margin: 0;
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                }
                #chat-container {
                    display: flex;
                    flex-direction: column;
                    flex-grow: 1;
                    overflow-y: auto;
                    padding: 1rem;
                    background-color: var(--background-color);
                }
                .message {
                    margin-bottom: 1rem;
                    padding: 0.75rem 1rem;
                    border-radius: 15px;
                    max-width: 80%;
                    word-wrap: break-word;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                }
                .user {
                    align-self: flex-end;
                    background-color: var(--user-bg-color);
                    color: var(--foreground-color);
                }
                .bot {
                    align-self: flex-start;
                    background-color: var(--bot-bg-color);
                    border: 1px solid var(--border-color);
                }
                #input-container {
                    display: flex;
                    padding: 1rem;
                    background-color: var(--background-color);
                    border-top: 1px solid var(--border-color);
                }
                #userInput {
                    flex-grow: 1;
                    padding: 0.75rem;
                    font-size: var(--vscode-font-size);
                    background-color: var(--bot-bg-color);
                    color: var(--foreground-color);
                    border: 1px solid var(--border-color);
                    border-radius: 4px;
                }
                #sendButton {
                    margin-left: 0.5rem;
                    padding: 0.75rem 1rem;
                    background-color: var(--button-bg-color);
                    color: var(--foreground-color);
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    transition: background-color 0.3s;
                }
                #sendButton:hover {
                    background-color: var(--button-hover-bg-color);
                }
                #statusMessage {
                    padding: 1rem;
                    font-style: italic;
                    background-color: var(--bot-bg-color);
                    color: var(--foreground-color);
                    border-bottom: 1px solid var(--border-color);
                }
                pre {
                    background-color: var(--bot-bg-color);
                    padding: 0.75rem;
                    border-radius: 5px;
                    overflow-x: auto;
                    font-size: 0.9em;
                }
                code {
                    font-family: var(--vscode-editor-font-family, monospace);
                }
            </style>
        </head>
        <body>
            <div id="chat-container"></div>
            <div id="input-container">
                <input type="text" id="userInput" placeholder="Escribe tu mensaje aquí...">
                <button id="sendButton">Enviar</button>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                const chatContainer = document.getElementById('chat-container');
                const userInput = document.getElementById('userInput');
                const sendButton = document.getElementById('sendButton');

                // Notificar que la vista está lista
                vscode.postMessage({ type: 'viewReady' });

                function sendMessage() {
                    const message = userInput.value.trim();
                    if (message) {
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
            </script>
        </body>
        </html>`;
    }
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};