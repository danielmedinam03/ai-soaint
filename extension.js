const vscode = require('vscode');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

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

    // _addMessage(message) {
    //     const format = this._determineFormat(message.value);
    //     const formattedMessage = this._formatMessage(message.value, format);
    //     const messageWithFormat = { ...message, value: formattedMessage };
    //     this._messages.push(messageWithFormat);
    //     this._view.webview.postMessage(messageWithFormat);
    // }
    _addMessage(message) {
        const formattedMessage = this._applyFormats(message.value);
        const messageWithFormat = { ...message, value: formattedMessage };
        this._messages.push(messageWithFormat);
        this._view.webview.postMessage(messageWithFormat);
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
        const htmlPath = path.join(this._extensionUri.fsPath, 'media', 'index.html');
        let html = fs.readFileSync(htmlPath, 'utf8');
        
        return html;
    }    

    _determineFormat(message) {
        if (message.includes('**')) {
            return 'bold';
        } 
        if (message.match(/^\d+\.\s/)) {
            return 'numbered-list';
        } 
        if (message.includes('```')) {
            return 'code-block';
        } 
        if (message.includes('`')) {
            return 'inline-code';
        }
        // Añadir más condiciones para otros formatos si es necesario
        return 'plain';
    }

    _formatMessage(message, format) {
        switch (format) {
            case 'bold':
                return message.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            case 'numbered-list':
                return `<ol>${message.split('\n').map(line => `<li>${line.replace(/^\d+\.\s/, '')}</li>`).join('')}</ol>`;
            case 'code-block':
                return message.replace(/```(.*?)```/gs, '<pre><code>$1</code></pre>');
            case 'inline-code':
                return message.replace(/`(.*?)`/g, '<code>$1</code>');
            // Añadir más formatos si es necesario
            default:
                return message;
        }
    }

    _applyFormats(message) {
        // Aplicar negritas
        message = message.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Aplicar bloques de código
        message = message.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
        // Aplicar código en línea
        message = message.replace(/`([^`]+)`/g, '<code>$1</code>');
        // Aplicar listas numeradas
        
        if (message.match(/^\d+\.\s/)) {
            message = `<ol>${message.split('\n').map(line => `<li>${line.replace(/^\d+\.\s/, '')}</li>`).join('')}</ol>`;
        }
        // Preservar saltos de línea
        message = message.replace(/\n/g, '<br>');

        return message;
    }
}

function deactivate() {
    console.log('Extension deactivated');
}

module.exports = {
    activate,
    deactivate
};
