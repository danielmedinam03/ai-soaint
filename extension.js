const vscode = require("vscode");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

function activate(context) {
  const provider = new ChatViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewType,
      provider
    )
  );

  let analyzeProject = vscode.commands.registerCommand(
    "extension.analyzeProject",
    async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders[0];
      if (workspaceFolder) {
        vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Analizando el proyecto",
            cancellable: false,
          },
          async (progress) => {
            const projectContent = await getProjectContent(
              workspaceFolder.uri.fsPath,
              progress
            );
            provider.setProjectContent(projectContent);
            vscode.window.showInformationMessage(
              "Análisis del proyecto completado."
            );
          }
        );
      } else {
        vscode.window.showInformationMessage(
          "No hay una carpeta de trabajo abierta."
        );
      }
    }
  );

  context.subscriptions.push(analyzeProject);
}

async function getProjectContent(dir, progress) {
  let result = "";
  const list = await fs.promises.readdir(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = await fs.promises.stat(fullPath);
    if (stat.isDirectory()) {
      result += `Directory: ${fullPath}\n`;
      result += await getProjectContent(fullPath, progress);
    } else {
      result += `File: ${fullPath}\n`;
      try {
        const content = await fs.promises.readFile(fullPath, "utf8");
        result += `Content:\n${content}\n\n`;
      } catch (error) {
        result += `Error reading file: ${error.message}\n\n`;
      }
    }
    progress.report({
      increment: 100 / list.length,
      message: `Analizando: ${fullPath}`,
    });
  }
  return result;
}

async function findContentInProject(projectContent, query) {
  const lines = projectContent.split("\n");
  let currentFile = "";
  let content = "";
  let found = false;

  for (const line of lines) {
    if (line.startsWith("File: ")) {
      if (found) break;
      currentFile = line.substring(6);
      content = "";
    } else if (line.startsWith("Content:")) {
      continue;
    } else {
      content += line + "\n";
    }

    if (content.includes(query)) {
      found = true;
    }
  }

  if (found) {
    return { file: currentFile, content: content.trim() };
  }
  return null;
}

class ChatViewProvider {
  static viewType = "tuExtensionInputView";

  constructor(extensionUri) {
    this._extensionUri = extensionUri;
    this._view = undefined;
    this._projectContent = "";
    this._conversationHistory = [];
  }

  async resolveWebviewView(webviewView, context, _token) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = await this._getHtmlForWebview(
      webviewView.webview
    );

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "userInput":
          this._view.webview.postMessage({
            type: "addMessage",
            value: data.value,
            sender: "user",
          });
          this._conversationHistory.push({
            sender: "user",
            message: data.value,
          });
          this._view.webview.postMessage({ type: "setLoading", value: true });
          try {
            const contextContent = await this.findRelevantContent(data.value);
            const payload = {
              text: data.value,
              context: contextContent,
            };
            const response = await axios.post(
              "http://127.0.0.1:5000/chat",
              payload,
              {
                headers: {
                  "Content-Type": "application/json",
                },
              }
            );
            const botMessage =
              response.data.response || JSON.stringify(response.data, null, 2);
            this._view.webview.postMessage({
              type: "addMessage",
              value: botMessage,
              sender: "bot",
            });
            this._conversationHistory.push({
              sender: "bot",
              message: botMessage,
            });
          } catch (error) {
            const errorMessage = `Error: ${error.message}`;
            this._view.webview.postMessage({
              type: "addMessage",
              value: errorMessage,
              sender: "bot",
            });
            this._conversationHistory.push({
              sender: "bot",
              message: errorMessage,
            });
          } finally {
            this._view.webview.postMessage({
              type: "setLoading",
              value: false,
            });
          }
          break;
        case "getHistory":
          this._view.webview.postMessage({
            type: "loadHistory",
            history: this._conversationHistory,
          });
          break;
      }
    });
  }

  async findRelevantContent(userMessage) {
    const fileMatch = userMessage.match(/archivo\s+(\S+)/i);
    const classMatch = userMessage.match(/clase\s+(\S+)/i);
    const functionMatch = userMessage.match(/función\s+(\S+)/i);

    if (fileMatch) {
      const result = await findContentInProject(
        this._projectContent,
        fileMatch[1]
      );
      return result
        ? `Contenido del archivo ${fileMatch[1]}:\n${result.content}`
        : "";
    } else if (classMatch) {
      const result = await findContentInProject(
        this._projectContent,
        `class ${classMatch[1]}`
      );
      return result
        ? `Definición de la clase ${classMatch[1]}:\n${result.content}`
        : "";
    } else if (functionMatch) {
      const result = await findContentInProject(
        this._projectContent,
        `def ${functionMatch[1]}`
      );
      return result
        ? `Definición de la función ${functionMatch[1]}:\n${result.content}`
        : "";
    }

    return "";
  }

  setProjectContent(content) {
    this._projectContent = content;
    if (this._view) {
      this._view.webview.postMessage({ type: "projectAnalyzed" });
    }
  }

  async _getHtmlForWebview(webview) {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Chat con Gemini</title>
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
            <div id="statusMessage">Proyecto analizado. Puedes comenzar a chatear.</div>
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
                const statusMessage = document.getElementById('statusMessage');

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

                function addMessageToUI(message, sender) {
                    const messageElement = document.createElement('div');
                    messageElement.classList.add('message', sender);
                    messageElement.innerHTML = formatCode(message);
                    chatContainer.appendChild(messageElement);
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }

                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'addMessage':
                            addMessageToUI(message.value, message.sender);
                            break;
                        case 'projectAnalyzed':
                            statusMessage.textContent = 'Proyecto analizado. Puedes comenzar a chatear.';
                            userInput.disabled = false;
                            sendButton.disabled = false;
                            break;
                        case 'loadHistory':
                            chatContainer.innerHTML = '';
                            message.history.forEach(item => {
                                addMessageToUI(item.message, item.sender);
                            });
                            break;
                    }
                });

                vscode.postMessage({ type: 'getHistory' });
            </script>
        </body>
        </html>
        `;
  }

  _getNonce() {
    let text = "";
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
