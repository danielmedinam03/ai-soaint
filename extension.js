const vscode = require('vscode');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

// Lista de carpetas y archivos a excluir
const excludedDirs = [
    'node_modules',
    'dist',
    'build',
    'out',
    'target',
    '.git',
    '.vscode',
    '.env',
    'venv',
    '__pycache__',
    'coverage',
    'tmp',
    'temp',
    'logs',
    'obj',
    'bin',
    'Debug'
];

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

function getWorkspaceFolder() {
    if (vscode.workspace.workspaceFolders) {
        const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
        return workspaceFolder;
    }
    return null;
}

function getProjectFiles(directory) {
    let results = [];
    const list = fs.readdirSync(directory);

    list.forEach((file) => {
        // Ignorar archivos o carpetas que comiencen con un punto o estén en la lista de exclusión
        if (file.startsWith('.') || excludedDirs.includes(file)) {
            return;
        }

        file = path.resolve(directory, file);
        const stat = fs.statSync(file);

        if (stat && stat.isDirectory()) {
            // Recursivamente obtener archivos de subdirectorios
            results = results.concat(getProjectFiles(file));
        } else {
            results.push(file);
        }
    });

    return results;
}

async function activate(context) {
    console.log('Activating extension');

    // Resetear la conversación al activar la extensión
    await resetConversation();

    // Obtener la ruta del proyecto abierto
    const workspaceFolder = getWorkspaceFolder();
    if (workspaceFolder) {
        console.log('Proyecto abierto en:', workspaceFolder);

        // Obtener los archivos del proyecto excluyendo carpetas no deseadas y enviar el contenido por lotes de 10
        await sendProjectFilesInBatches();

    } else {
        console.log('No hay ningún proyecto abierto.');
    }

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

async function sendProjectFilesInBatches() {
    const workspaceFolder = getWorkspaceFolder();
    if (!workspaceFolder) {
        return;
    }

    const files = getProjectFiles(workspaceFolder);

    let batchContent = '';
    let batchCount = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        try {
            const content = fs.readFileSync(file, 'utf8');
            batchContent += `\n\n---\n\n${path.basename(file)}:\n\n${content}`;
        } catch (error) {
            console.error(`Failed to read file ${file}:`, error.message);
        }

        // Incrementa el contador de archivos en el lote
        batchCount++;

        // Si el lote tiene 10 archivos o si es el último archivo, envía el lote
        if (batchCount === 10 || i === files.length - 1) {
            const payload = {
                text: `Aprende acerca del contexto del proyecto`,
                context: batchContent
            };
            try {
                const response = await axios.post('http://127.0.0.1:5000/chat', payload);
                console.log('Batch sent:', response.data.response || JSON.stringify(response.data, null, 2));
            } catch (error) {
                console.error('Failed to send batch:', error.message);
            }

            // Reinicia el contenido del lote y el contador de archivos
            batchContent = '';
            batchCount = 0;
        }
    }
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
    
            // Obtener los archivos relacionados
            const relatedFilesList = await this._sendRelatedFilesRequest(currentFileContent);
    
            // Obtener el contexto combinado de los archivos actuales y relacionados
            const combinedContext = await this._getCombinedContextWithRelatedFiles(currentFileContent, relatedFilesList);
    
            const payload = {
                text: input,
                context: combinedContext
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
        const formattedMessage = this._applyFormats(message.value);
        const messageWithFormat = { ...message, value: formattedMessage };
        this._messages.push(messageWithFormat);
        this._view.webview.postMessage(messageWithFormat);
    }

    async _getCombinedContextWithRelatedFiles(currentFileContent, relatedFilesList) {
        // Asegurarte de que relatedFilesList es un array y obtener el primer elemento
        const relatedFilesString = Array.isArray(relatedFilesList) ? relatedFilesList[0] : relatedFilesList;

        let relatedFilesContent = '';
        
        // Convertir la cadena de archivos relacionados en una lista
        const relatedFilesArray = relatedFilesString.split(',').map(file => file.trim());
        
        const workspaceFolder = getWorkspaceFolder();
        if (workspaceFolder) {
            const projectFiles = getProjectFiles(workspaceFolder);
            
            relatedFilesArray.forEach((relatedFile) => {
                const relatedFilePath = projectFiles.find(filePath => filePath.endsWith(relatedFile));
                if (relatedFilePath) {
                    try {
                        const content = fs.readFileSync(relatedFilePath, 'utf8');
                        relatedFilesContent += `\n\n[Inicio del archivo "${relatedFile}"]\n${content}\n[Fin del archivo "${relatedFile}"]`;
                    } catch (error) {
                        console.error(`Failed to read related file ${relatedFile}:`, error.message);
                    }
                }
            });
        }
    
        const combinedContext = `[Inicio del archivo "${currentFileContent.file}"]\n${currentFileContent.content}\n[Fin del archivo "${currentFileContent.file}"]\n\nArchivos relacionados:\n${relatedFilesContent}`;
        return combinedContext;
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

    async _sendRelatedFilesRequest(fileContent) {
        try {
            const payload = { file_content: fileContent.content };
            const response = await axios.post('http://127.0.0.1:5000/related-files', payload);
            return response.data.related_files || [];
        } catch (error) {
            console.error('Failed to get related files:', error.message);
            return [];
        }
    }

    _getHtmlForWebview(webview) {
        const htmlPath = path.join(this._extensionUri.fsPath, 'media', 'index.html');
        let html = fs.readFileSync(htmlPath, 'utf8');
        
        return html;
    }    

    _applyFormats(message) {
        // Escapar caracteres especiales de HTML
        message = message.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        // Aplicar negritas
        message = message.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Aplicar bloques de código y añadir botón "Copiar"
        message = message.replace(/```([\s\S]*?)```/g, '<div class="code-block"><pre><code>$1</code></pre><button>Copiar</button></div>');
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
