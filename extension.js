const vscode = require('vscode');
const axios = require('axios');
const path = require('path');

async function resetConversation() {
    try {
        const response = await axios.post('http://127.0.0.1:5000/reset');
        console.log('Conversation reset:', response.data.message);
        vscode.window.showInformationMessage('Conversación reseteada exitosamente.');
    } catch (error) {
        console.error('Failed to reset conversation:', error);
        vscode.window.showErrorMessage('No se pudo resetear la conversación.');
    }
}

async function activate(context) {
    console.log('Activating extension');

    // Resetear la conversación al activar la extensión
    await resetConversation();

    const provider = new ChatViewProvider(context.extensionUri, context.globalState);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, provider)
    );

    // Registrar el comando para resetear la conversación
    let disposable = vscode.commands.registerCommand('extension.resetConversation', async () => {
        await resetConversation();
    });

    context.subscriptions.push(disposable);
}

class ChatViewProvider {
    static viewType = 'tuExtensionInputView';

    constructor(extensionUri, globalState) {
        this._extensionUri = extensionUri;
        this._view = undefined;
        this._globalState = globalState;
        this._messages = [];
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
                body {
                    font-family: var(--vscode-font-family, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif);
                    font-size: var(--vscode-font-size, 14px);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
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
                    padding: 10px;
                    border-bottom: 1px solid var(--vscode-editorGroup-border);
                    background-color: var(--vscode-editor-background);
                }
                .message {
                    margin-bottom: 10px;
                    padding: 8px 12px;
                    border-radius: 8px;
                    max-width: 75%;
                    word-wrap: break-word;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                }
                .user {
                    align-self: flex-end;
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                }
                .bot {
                    align-self: flex-start;
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    color: var(--vscode-editor-foreground);
                }
                #input-container {
                    display: flex;
                    align-items: center;
                    padding: 10px;
                    background-color: var(--vscode-editor-background);
                    border-top: 1px solid var(--vscode-editorGroup-border);
                }
                #userInput {
                    flex-grow: 1;
                    padding: 10px;
                    font-size: var(--vscode-font-size);
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 5px;
                    outline: none;
                    box-sizing: border-box;
                }
                #sendButton {
                    margin-left: 10px;
                    padding: 10px 20px;
                    font-size: var(--vscode-font-size);
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    transition: background-color 0.3s;
                }
                #sendButton:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                #loading {
                    display: none;
                    align-self: center;
                    margin: 20px 0;
                }
                #loading svg {
                    animation: rotate 1s linear infinite;
                }
                @keyframes rotate {
                    100% { transform: rotate(360deg); }
                }
            </style>
        </head>
        <body>
            <div id="chat-container"></div>
            <div id="input-container">
                <input type="text" id="userInput" placeholder="Escribe tu mensaje aquí...">
                <button id="sendButton">Enviar</button>
            </div>
            <div id="loading">
                <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" fill="#007acc">
                    <circle cx="20" cy="20" r="18" stroke-width="4" stroke-opacity="0.5" stroke-dasharray="28.274333882308138 28.274333882308138" stroke-linecap="round">
                        <animateTransform
                            attributeName="transform"
                            type="rotate"
                            from="0 20 20"
                            to="360 20 20"
                            dur="1s"
                            repeatCount="indefinite"/>
                    </circle>
                </svg>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                const chatContainer = document.getElementById('chat-container');
                const userInput = document.getElementById('userInput');
                const sendButton = document.getElementById('sendButton');
                const loading = document.getElementById('loading');
    
                vscode.postMessage({ type: 'viewReady' });
    
                function sendMessage() {
                    const message = userInput.value.trim();
                    if (message) {
                        loading.style.display = 'block'; // Mostrar el indicador de carga
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
                    loading.style.display = 'none'; // Ocultar el indicador de carga
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

function deactivate() {
    console.log('Extension deactivated');
}

module.exports = {
    activate,
    deactivate
};
