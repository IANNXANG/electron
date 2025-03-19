// 定义消息类型
interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

// 定义API响应类型
interface ApiResponse {
    choices: {
        message: {
            content: string;
        };
    }[];
}

// 存储对话历史
let messageHistory: Message[] = [];

// 存储系统提示词
let systemPrompt: string = "你是一个专门处理鼠标点击操作的助手。当用户需要点击某个位置时，你可以使用 click(x,y) 格式来执行点击操作。请确保给出准确的坐标位置。";

// 获取DOM元素
const messageInput = document.getElementById('messageInput') as HTMLInputElement;
const sendButton = document.getElementById('sendButton') as HTMLButtonElement;
const mousePositionButton = document.createElement('button');
mousePositionButton.id = 'mousePositionButton';
mousePositionButton.textContent = '显示鼠标位置';

// 创建清除上下文按钮
const clearContextButton = document.createElement('button');
clearContextButton.id = 'clearContextButton';
clearContextButton.textContent = '清除上下文';
clearContextButton.style.marginRight = '10px';

const inputContainer = document.querySelector('.input-container');
if (inputContainer) {
    inputContainer.insertBefore(clearContextButton, inputContainer.firstChild);
    inputContainer.insertBefore(mousePositionButton, inputContainer.firstChild);
}
const chatMessages = document.getElementById('chatMessages') as HTMLDivElement;

async function sendMessage(): Promise<void> {
    const message = messageInput.value.trim();
    if (!message) return;

    // 检查是否为点击指令
    const clickMatch = message.match(/click\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (clickMatch) {
        const x = parseInt(clickMatch[1]);
        const y = parseInt(clickMatch[2]);
        const { mouse } = require('@nut-tree/nut-js');
        await mouse.setPosition({x, y});
        await mouse.leftClick();
        addMessage(`已点击位置 (${x}, ${y})`, true);
        return;
    }

    // 添加用户消息到历史记录
    messageHistory.push({ role: 'user', content: message });
    
    // 添加用户消息到界面
    addMessage(message, true);
    messageInput.value = '';

    try {
        // 发送请求到本地模型
        const response = await fetch('http://localhost:8001/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messages: [
                    { 
                        role: 'system', 
                        content: systemPrompt,
                        name: 'system'
                    },
                    ...messageHistory.map(msg => ({
                        ...msg,
                        name: msg.role === 'user' ? 'user' : 'assistant'
                    }))
                ],
                model: 'ui-tars',
                temperature: 0.7,
                max_tokens: 2000,
                stream: false
            })
        });

        const data: ApiResponse = await response.json();
        const botResponse = data.choices[0].message.content;
        
        // 将AI回复添加到对话历史
        messageHistory.push({ role: 'assistant', content: botResponse });
        
        // 添加机器人响应到界面
        addMessage(botResponse, false);

        // 检查AI回复中是否包含点击指令
        const aiClickMatch = botResponse.match(/click\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
        if (aiClickMatch) {
            const x = parseInt(aiClickMatch[1]);
            const y = parseInt(aiClickMatch[2]);
            const { mouse } = require('@nut-tree/nut-js');
            await mouse.setPosition({x, y});
            await mouse.leftClick();
            addMessage(`AI触发点击位置 (${x}, ${y})`, false);
        }
    } catch (error) {
        console.error('Error:', error);
        addMessage('抱歉，发生了一些错误，请稍后再试。', false);
    }
}

function addMessage(text: string, isUser: boolean): void {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;
    messageDiv.textContent = text;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 添加清除上下文的功能
function clearContext(): void {
    messageHistory = [];
    chatMessages.innerHTML = '';
    addMessage('上下文已清除。', false);
}

// 添加事件监听器
sendButton.addEventListener('click', sendMessage);
mousePositionButton.addEventListener('click', async () => {
    const { mouse } = require('@nut-tree/nut-js');
    const { ipcRenderer } = require('electron');
    ipcRenderer.send('open-mouse-position-window');
    setInterval(async () => {
        const position = await mouse.getPosition();
        ipcRenderer.send('update-mouse-position', position);
    }, 100);
});
clearContextButton.addEventListener('click', clearContext);
messageInput.addEventListener('keypress', (e: KeyboardEvent) => {
    if (e.key === 'Enter') sendMessage();
});