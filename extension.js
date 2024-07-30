const vscode = require('vscode');
const axios = require('axios');
const path = require('path');

function activate(context) {
    const provider = new ChatViewProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, provider)
    );
}

class ChatViewProvider {
    static viewType = 'tuExtensionInputView';

    constructor(extensionUri) {
        this._extensionUri = extensionUri;
        this._view = undefined;
    }

    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'userInput':
                    this._view.webview.postMessage({ type: 'addMessage', value: data.value, sender: 'user' });
                    try {
                        const currentFileContent = await this._getCurrentFileContent();
                        const payload = {
                            text: data.value,
                            context: currentFileContent ? JSON.stringify(currentFileContent) : ''
                        };
                        const response = await axios.post('http://127.0.0.1:5000/chat', payload);
                        const botMessage = response.data.response || JSON.stringify(response.data, null, 2);
                        this._view.webview.postMessage({ type: 'addMessage', value: botMessage, sender: 'bot' });
                    } catch (error) {
                        const errorMessage = `Error: ${error.message}`;
                        this._view.webview.postMessage({ type: 'addMessage', value: errorMessage, sender: 'bot' });
                    }
                    break;
            }
        });
    }

    async _getCurrentFileContent() {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const fileContent = document.getText();
            const fileName = path.basename(document.fileName);
            return {
                file: fileName,
                content: fileContent
            };
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
