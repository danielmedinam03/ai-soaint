const vscode = require('vscode');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

function activate(context) {
    const provider = new ChatViewProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, provider)
    );

    let analyzeProject = vscode.commands.registerCommand('extension.analyzeProject', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders[0];
        if (workspaceFolder) {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Analizando el proyecto",
                cancellable: false
            }, async (progress) => {
                const projectContent = await getProjectContent(workspaceFolder.uri.fsPath, progress);
                provider.setProjectContent(projectContent);
                vscode.window.showInformationMessage('Análisis del proyecto completado.');
            });
        } else {
            vscode.window.showInformationMessage('No hay una carpeta de trabajo abierta.');
        }
    });

    context.subscriptions.push(analyzeProject);
}

async function getProjectContent(dir, progress) {
    let result = '';
    const list = fs.readdirSync(dir);
    for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            result += `Directory: ${fullPath}\n`;
            result += await getProjectContent(fullPath, progress);
        } else {
            result += `File: ${fullPath}\n`;
            try {
                const content = fs.readFileSync(fullPath, 'utf8');
                result += `Content:\n${content}\n\n`;
            } catch (error) {
                result += `Error reading file: ${error.message}\n\n`;
            }
        }
        progress.report({ increment: 100 / list.length, message: `Analizando: ${fullPath}` });
    }
    return result;
}

class ChatViewProvider {
    static viewType = 'tuExtensionInputView';

    constructor(extensionUri) {
        this._extensionUri = extensionUri;
        this._view = undefined;
        this._projectContent = '';
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
                        const payload = { 
                            text: data.value,
                            projectContent: this._projectContent
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

    setProjectContent(content) {
        this._projectContent = content;
        if (this._view) {
            this._view.webview.postMessage({ type: 'projectAnalyzed' });
        }
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
                    font-family: Arial, sans-serif; 
                    margin: 0; 
                    padding: 10px; 
                    display: flex; 
                    flex-direction: column; 
                    height: 100vh; 
                    background-color: #f9f9f9; 
                }
                #chat-container { 
                    flex-grow: 1; 
                    overflow-y: auto; 
                    margin-bottom: 10px; 
                    padding: 10px; 
                    background-color: #fff; 
                    border: 1px solid #ddd; 
                    border-radius: 4px; 
                }
                .message { 
                    margin-bottom: 10px; 
                    padding: 10px; 
                    border-radius: 10px; 
                    max-width: 80%; 
                    word-wrap: break-word; 
                    white-space: pre-wrap; 
                    color: black; 
                }
                .user { 
                    background-color: #DCF8C6; 
                    align-self: flex-end; 
                    margin-left: 20%;
                }
                .bot { 
                    background-color: #E5E5EA; 
                    align-self: flex-start; 
                    margin-right: 20%;
                }
                #input-container { 
                    display: flex; 
                    margin-bottom: 10px; 
                }
                #userInput { 
                    flex-grow: 1; 
                    padding: 10px; 
                    font-size: 14px; 
                    border: 1px solid #ddd; 
                    border-radius: 4px; 
                    margin-right: 5px; 
                }
                #sendButton { 
                    padding: 10px 20px; 
                    font-size: 14px; 
                    background-color: #007ACC; 
                    color: white; 
                    border: none; 
                    border-radius: 4px; 
                    cursor: pointer; 
                }
                #sendButton:hover { 
                    background-color: #005A9E; 
                }
                #statusMessage { 
                    margin-bottom: 10px; 
                    font-style: italic; 
                }
                #loading { 
                    display: none; 
                    text-align: center; 
                    margin-top: 10px; 
                }
                .spinner { 
                    border: 4px solid #f3f3f3; 
                    border-top: 4px solid #3498db; 
                    border-radius: 50%; 
                    width: 20px; 
                    height: 20px; 
                    animation: spin 1s linear infinite; 
                    display: inline-block; 
                }
                @keyframes spin { 
                    0% { transform: rotate(0deg); } 
                    100% { transform: rotate(360deg); } 
                }
                pre { 
                    background-color: #f4f4f4; 
                    padding: 10px; 
                    border-radius: 5px; 
                    overflow-x: auto; 
                    font-size: 12px;
                }
                code { 
                    font-family: 'Courier New', Courier, monospace; 
                }

                /* Estilos responsivos */
                @media (max-width: 600px) {
                    body {
                        padding: 5px;
                    }
                    #chat-container {
                        padding: 5px;
                    }
                    .message {
                        max-width: 90%;
                    }
                    .user {
                        margin-left: 10%;
                    }
                    .bot {
                        margin-right: 10%;
                    }
                    #userInput, #sendButton {
                        font-size: 12px;
                    }
                    pre {
                        font-size: 10px;
                    }
                }
            </style>
        </head>
        <body>
            <div id="statusMessage">Ejecute el comando "Analizar proyecto completo" antes de chatear.</div>
            <div id="chat-container"></div>
            <div id="loading">
                <div class="spinner"></div>
                <p>Procesando...</p>
            </div>
            <div id="input-container">
                <input type="text" id="userInput" placeholder="Escribe algo aquí" disabled>
                <button id="sendButton" disabled>Enviar</button>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                const chatContainer = document.getElementById('chat-container');
                const userInput = document.getElementById('userInput');
                const sendButton = document.getElementById('sendButton');
                const statusMessage = document.getElementById('statusMessage');
                const loading = document.getElementById('loading');

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

                function formatCode(text) {
                    const codeBlockRegex = /\`\`\`([\s\S]*?)\`\`\`/g;
                    return text.replace(codeBlockRegex, function(match, code) {
                        return '<pre><code>' + code.trim() + '</code></pre>';
                    });
                }

                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'addMessage':
                            const messageElement = document.createElement('div');
                            messageElement.classList.add('message', message.sender);
                            messageElement.innerHTML = formatCode(message.value);
                            chatContainer.appendChild(messageElement);
                            chatContainer.scrollTop = chatContainer.scrollHeight;
                            break;
                        case 'projectAnalyzed':
                            statusMessage.textContent = 'Proyecto analizado. Puedes comenzar a chatear.';
                            userInput.disabled = false;
                            sendButton.disabled = false;
                            break;
                        case 'setLoading':
                            loading.style.display = message.value ? 'block' : 'none';
                            userInput.disabled = message.value;
                            sendButton.disabled = message.value;
                            break;
                    }
                });

                // Ajustar el tamaño del contenedor de chat cuando cambia el tamaño de la ventana
                window.addEventListener('resize', function() {
                    chatContainer.style.height = (window.innerHeight - 150) + 'px';
                });

                // Inicializar el tamaño del contenedor de chat
                chatContainer.style.height = (window.innerHeight - 150) + 'px';
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