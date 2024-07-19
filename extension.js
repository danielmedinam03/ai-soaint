const vscode = require('vscode');

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

        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'userInput':
                    this._view.webview.postMessage({ type: 'addMessage', value: data.value, sender: 'user' });
                    setTimeout(() => {
                        this._view.webview.postMessage({ type: 'addMessage', value: `Recibido: ${data.value}`, sender: 'bot' });
                    }, 1000);
                    break;
            }
        });
    }

    _getHtmlForWebview(webview) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Chat</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 0; padding: 10px; display: flex; flex-direction: column; height: 100vh; background-color: #f9f9f9; }
                #chat-container { flex-grow: 1; overflow-y: auto; margin-bottom: 10px; padding: 10px; background-color: #fff; border: 1px solid #ddd; border-radius: 4px; }
                .message { margin-bottom: 10px; padding: 10px; border-radius: 10px; max-width: 80%; color: black; }
                .user { background-color: #DCF8C6; align-self: flex-end; }
                .bot { background-color: #E5E5EA; align-self: flex-start; }
                #input-container { display: flex; margin-bottom: 10px; }
                #userInput { flex-grow: 1; padding: 10px; font-size: 14px; border: 1px solid #ddd; border-radius: 4px; margin-right: 5px; }
                #sendButton { padding: 10px 20px; font-size: 14px; background-color: #007ACC; color: white; border: none; border-radius: 4px; cursor: pointer; }
                #sendButton:hover { background-color: #005A9E; }
            </style>
        </head>
        <body>
            <div id="chat-container"></div>
            <div id="input-container">
                <input type="text" id="userInput" placeholder="Escribe algo aquí">
                <button id="sendButton" onclick="sendMessage()">Enviar</button>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                const chatContainer = document.getElementById('chat-container');

                function sendMessage() {
                    const input = document.getElementById('userInput');
                    const message = input.value.trim();
                    if (message) {
                        vscode.postMessage({
                            type: 'userInput',
                            value: message
                        });
                        input.value = '';
                    }
                }

                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'addMessage':
                            const messageElement = document.createElement('div');
                            messageElement.classList.add('message', message.sender);
                            messageElement.textContent = message.value;
                            chatContainer.appendChild(messageElement);
                            chatContainer.scrollTop = chatContainer.scrollHeight;
                            break;
                    }
                });

                document.getElementById('userInput').addEventListener('keypress', function(event) {
                    if (event.key === 'Enter') {
                        sendMessage();
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
