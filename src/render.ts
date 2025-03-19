// 定义消息类型
interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
    image?: string;  // base64格式的图片数据
}

// 定义API响应类型
interface ApiResponse {
    choices: {
        message: {
            content: string;
        };
    }[];
}

// 定义坐标类型
interface Coordinates {
    x: number;
    y: number;
}

// 存储对话历史
let messageHistory: Message[] = [];

// 存储系统提示词
let systemPrompt: string = `你是一个通过图像分析进行自动化操作的AI助手。你的主要任务是：

1. 分析用户上传的截图内容：
   - 识别界面元素的位置和类型（按钮、文本框、链接等）
   - 理解界面布局和结构
   - 定位用户指定的目标元素

2. 根据用户的指令和截图，生成精确的操作命令：
   - 如果用户说"点击xxx"，你需要在截图中定位该元素，并输出 click(x,y) 命令
   - 如果用户说"双击xxx"，输出 left_double(x,y) 命令
   - 如果用户说"右键xxx"，输出 right_single(x,y) 命令
   - 如果用户要求拖拽操作，输出 drag((x1,y1),(x2,y2)) 命令
   - 如果需要输入文本，输出 type(content='文本内容') 命令
   - 如果需要滚动，输出 scroll((x,y), direction='up/down/left/right') 命令
   - 如果需要快捷键，输出 hotkey(key='组合键') 命令

3. 响应规范：
   - 首先描述你在截图中看到的内容
   - 然后解释你将如何执行用户的指令
   - 最后输出准确的命令格式
   - 确保命令格式完全符合规范，这样才能被系统正确识别和执行

4. 命令示例：
   - 点击：click(100,200)
   - 双击：left_double(100,200)
   - 右键：right_single(100,200)
   - 拖拽：drag((100,200),(300,400))
   - 输入：type(content='要输入的文本')
   - 滚动：scroll((100,200), direction='up')
   - 热键：hotkey(key='command+c')

请记住：你的主要目标是通过分析截图和理解用户指令，生成准确的操作命令。命令必须严格遵循上述格式，这样才能被系统识别和执行。`;

// 添加延时函数
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 添加平滑移动函数
async function smoothMove(start: Coordinates, end: Coordinates, steps: number = 20): Promise<void> {
    const { mouse } = require('@nut-tree/nut-js');
    for (let i = 0; i <= steps; i++) {
        const x = Math.round(start.x + (end.x - start.x) * (i / steps));
        const y = Math.round(start.y + (end.y - start.y) * (i / steps));
        await mouse.setPosition({x, y});
        await sleep(10); // 每步延时10ms
    }
}

// 添加平滑滚动函数
async function smoothScroll(direction: string, totalAmount: number, steps: number = 20): Promise<void> {
    const { mouse } = require('@nut-tree/nut-js');
    const amountPerStep = Math.round(totalAmount / steps);
    
    for (let i = 0; i < steps; i++) {
        switch (direction) {
            case 'up':
                await mouse.scrollUp(amountPerStep);
                break;
            case 'down':
                await mouse.scrollDown(amountPerStep);
                break;
            case 'left':
                await mouse.scrollLeft(amountPerStep);
                break;
            case 'right':
                await mouse.scrollRight(amountPerStep);
                break;
        }
        await sleep(20); // 每步之间添加短暂延迟
    }
}

// 添加系统命令执行函数
async function executeSystemCommand(command: string): Promise<void> {
    const { exec } = require('child_process');
    return new Promise((resolve, reject) => {
        exec(command, (error: any) => {
            if (error) {
                console.error(`执行命令失败: ${error}`);
                reject(error);
            }
            resolve();
        });
    });
}

// 鼠标操作函数
async function performMouseOperations(message: string): Promise<boolean> {
    const { mouse, Button, keyboard, Key } = require('@nut-tree/nut-js');

    // 匹配点击操作
    const clickMatch = message.match(/click\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (clickMatch) {
        const x = parseInt(clickMatch[1]);
        const y = parseInt(clickMatch[2]);
        await mouse.setPosition({x, y});
        await mouse.leftClick();
        addMessage(`已执行左键单击：(${x}, ${y})`, true);
        return true;
    }

    // 匹配双击操作
    const doubleClickMatch = message.match(/left_double\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (doubleClickMatch) {
        const x = parseInt(doubleClickMatch[1]);
        const y = parseInt(doubleClickMatch[2]);
        await mouse.setPosition({x, y});
        await mouse.doubleClick(Button.LEFT);
        addMessage(`已执行左键双击：(${x}, ${y})`, true);
        return true;
    }

    // 匹配右键单击操作
    const rightClickMatch = message.match(/right_single\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (rightClickMatch) {
        const x = parseInt(rightClickMatch[1]);
        const y = parseInt(rightClickMatch[2]);
        await mouse.setPosition({x, y});
        await mouse.rightClick();
        addMessage(`已执行右键单击：(${x}, ${y})`, true);
        return true;
    }

    // 匹配拖拽操作 - 方括号格式
    const dragMatchBrackets = message.match(/drag\[\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)\s*,\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)\s*\]/);
    // 匹配拖拽操作 - 圆括号格式
    const dragMatchParens = message.match(/drag\(\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)\s*,\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)\s*\)/);
    
    const dragMatch = dragMatchBrackets || dragMatchParens;
    if (dragMatch) {
        const x1 = parseInt(dragMatch[1]);
        const y1 = parseInt(dragMatch[2]);
        const x2 = parseInt(dragMatch[3]);
        const y2 = parseInt(dragMatch[4]);
        
        try {
            // 1. 移动到起始位置
            await mouse.setPosition({x: x1, y: y1});
            await sleep(100); // 等待100ms确保位置正确
            
            // 2. 按下左键
            await mouse.pressButton(Button.LEFT);
            await sleep(100); // 等待100ms确保按键被识别
            
            // 3. 平滑移动到目标位置
            await smoothMove({x: x1, y: y1}, {x: x2, y: y2});
            
            // 4. 在目标位置稍作停留
            await sleep(100);
            
            // 5. 释放左键
            await mouse.releaseButton(Button.LEFT);
            
            addMessage(`已执行拖拽：从 (${x1}, ${y1}) 到 (${x2}, ${y2})`, true);
            return true;
        } catch (error) {
            console.error('拖拽操作失败:', error);
            addMessage(`拖拽操作失败：从 (${x1}, ${y1}) 到 (${x2}, ${y2})`, true);
            return true;
        }
    }

    // 匹配热键操作
    const hotkeyMatch = message.match(/hotkey\(key='([^']+)'\)/);
    if (hotkeyMatch) {
        const keyCombo = hotkeyMatch[1];
        const keys = keyCombo.split('+').map(k => k.trim().toLowerCase());
        
        try {
            // 处理特殊的系统热键
            if (keyCombo === 'command+shift+3') {
                // 全屏截图
                await executeSystemCommand('screencapture ~/Desktop/screenshot.png');
                addMessage(`已执行全屏截图，保存至桌面`, true);
                return true;
            }
            if (keyCombo === 'command+shift+4') {
                // 区域截图
                await executeSystemCommand('screencapture -i ~/Desktop/screenshot.png');
                addMessage(`已执行区域截图，保存至桌面`, true);
                return true;
            }

            // 处理普通热键
            const modifiers = [];
            if (keys.includes('command')) modifiers.push(Key.LeftCmd);
            if (keys.includes('alt')) modifiers.push(Key.Alt);
            if (keys.includes('control')) modifiers.push(Key.LeftControl);
            if (keys.includes('shift')) modifiers.push(Key.LeftShift);
            
            // 获取主键（最后一个键）
            const mainKey = keys[keys.length - 1];
            const keyToPress = Key[mainKey.charAt(0).toUpperCase() + mainKey.slice(1)] || mainKey;

            // 按下所有修饰键
            for (const modifier of modifiers) {
                await keyboard.pressKey(modifier);
            }
            
            // 按下并释放主键
            await keyboard.pressKey(keyToPress);
            await keyboard.releaseKey(keyToPress);
            
            // 释放所有修饰键（反序）
            for (const modifier of modifiers.reverse()) {
                await keyboard.releaseKey(modifier);
            }
            
            addMessage(`已执行热键操作：${keyCombo}`, true);
            return true;
        } catch (error) {
            console.error('热键操作失败:', error);
            addMessage(`热键操作失败：${keyCombo}`, true);
            return true;
        }
    }

    // 匹配文本输入操作
    const typeMatch = message.match(/type\(content='([^']+)'\)/);
    if (typeMatch) {
        const text = typeMatch[1];
        try {
            await keyboard.type(text);
            addMessage(`已输入文本：${text}`, true);
            return true;
        } catch (error) {
            console.error('文本输入失败:', error);
            addMessage(`文本输入失败：${text}`, true);
            return true;
        }
    }

    // 匹配滚动操作
    const scrollMatch = message.match(/scroll\(\((\d+)\s*,\s*(\d+)\)\s*,\s*direction='(up|down|left|right)'\)/);
    if (scrollMatch) {
        const x = parseInt(scrollMatch[1]);
        const y = parseInt(scrollMatch[2]);
        const direction = scrollMatch[3];
        
        try {
            // 先移动到指定位置
            await mouse.setPosition({x, y});
            await sleep(200); // 等待鼠标到位

            // 执行平滑滚动
            const totalScrollAmount = 500; // 减少总滚动量
            const scrollSteps = 20; // 减少步数以加快速度
            
            // 执行2次平滑滚动（减少次数）
            for (let i = 0; i < 2; i++) {
                await smoothScroll(direction, totalScrollAmount, scrollSteps);
                await sleep(30); // 减少滚动间隔
            }
            
            addMessage(`已在位置(${x}, ${y})执行${direction}方向平滑滚动`, true);
            return true;
        } catch (error) {
            console.error('滚动操作失败:', error);
            addMessage(`滚动操作失败：在位置(${x}, ${y})`, true);
            return true;
        }
    }

    return false;
}

// 获取DOM元素
const messageInput = document.getElementById('messageInput') as HTMLInputElement;
const sendButton = document.getElementById('sendButton') as HTMLButtonElement;
const imageInput = document.getElementById('imageInput') as HTMLInputElement;

// 创建工具栏容器
const toolbarDiv = document.createElement('div');
toolbarDiv.className = 'toolbar';

// 创建上传图片按钮
const uploadButton = document.createElement('button');
uploadButton.id = 'uploadButton';
uploadButton.className = 'tool-button';
uploadButton.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="12" cy="12" r="3"/>
        <path d="M8 8h.01"/>
    </svg>
`;
uploadButton.title = '上传图片';

// 创建鼠标位置按钮
const mousePositionButton = document.createElement('button');
mousePositionButton.id = 'mousePositionButton';
mousePositionButton.className = 'tool-button';
mousePositionButton.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
        <path d="M13 13l6 6"/>
    </svg>
`;
mousePositionButton.title = '显示鼠标位置';

// 创建截图按钮
const screenshotButton = document.createElement('button');
screenshotButton.id = 'screenshotButton';
screenshotButton.className = 'tool-button';
screenshotButton.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 19H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2.5l2-2h7l2 2H21a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2z"/>
        <circle cx="12" cy="13" r="3"/>
    </svg>
`;
screenshotButton.title = '截图';

// 创建清除上下文按钮
const clearContextButton = document.createElement('button');
clearContextButton.id = 'clearContextButton';
clearContextButton.className = 'tool-button';
clearContextButton.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 6h18"/>
        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
        <line x1="10" y1="11" x2="10" y2="17"/>
        <line x1="14" y1="11" x2="14" y2="17"/>
    </svg>
`;
clearContextButton.title = '清除上下文';

// 添加按钮到工具栏
toolbarDiv.appendChild(clearContextButton);
toolbarDiv.appendChild(mousePositionButton);
toolbarDiv.appendChild(screenshotButton);
toolbarDiv.appendChild(uploadButton);

const inputContainer = document.querySelector('.input-container');
if (inputContainer) {
    inputContainer.insertBefore(toolbarDiv, inputContainer.firstChild);
}
const chatMessages = document.getElementById('chatMessages') as HTMLDivElement;

// 当前上传的图片
let currentImage: string | null = null;

async function sendMessage(): Promise<void> {
    const message = messageInput.value.trim();
    if (!message && !currentImage) return;

    // 检查是否为鼠标操作指令
    if (message && await performMouseOperations(message)) {
        messageInput.value = '';
        return;
    }

    // 添加用户消息到历史记录
    const userMessage: Message = {
        role: 'user',
        content: message || '请分析这张图片',
    };
    
    if (currentImage) {
        userMessage.image = currentImage;
    }
    
    messageHistory.push(userMessage);
    
    // 添加用户消息到界面
    addMessage(message, true, currentImage);
    messageInput.value = '';
    currentImage = null;

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
                    ...messageHistory.map(msg => {
                        // 构建消息对象
                        const msgObj: any = {
                            role: msg.role,
                            name: msg.role === 'user' ? 'user' : 'assistant',
                            content: msg.content
                        };
                        
                        // 如果有图片，添加到content中
                        if (msg.image) {
                            msgObj.content = [
                                {
                                    type: "text",
                                    text: msg.content || "请分析这张图片"
                                },
                                {
                                    type: "image_url",
                                    image_url: {
                                        url: msg.image
                                    }
                                }
                            ];
                        }
                        
                        return msgObj;
                    })
                ],
                model: 'ui-tars',
                temperature: 0,
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

        // 检查AI回复中是否包含鼠标操作指令
        await performMouseOperations(botResponse);
    } catch (error) {
        console.error('Error:', error);
        addMessage('抱歉，发生了一些错误，请稍后再试。', false);
    }
}

function addMessage(text: string, isUser: boolean, image?: string | null): void {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;
    
    if (text) {
        const textDiv = document.createElement('div');
        textDiv.textContent = text;
        messageDiv.appendChild(textDiv);
    }
    
    if (image) {
        const img = document.createElement('img');
        img.src = image;
        img.style.maxWidth = '200px';
        img.style.borderRadius = '8px';
        img.style.marginTop = text ? '10px' : '0';
        messageDiv.appendChild(img);
    }
    
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
let mousePositionInterval: NodeJS.Timeout | null = null;

mousePositionButton.addEventListener('click', async () => {
    const { mouse } = require('@nut-tree/nut-js');
    const { ipcRenderer } = require('electron');

    try {
        // 如果已经在运行，则停止并返回
        if (mousePositionInterval) {
            clearInterval(mousePositionInterval);
            mousePositionInterval = null;
            ipcRenderer.send('close-mouse-position-window');
            return;
        }

        // 打开新窗口
        ipcRenderer.send('open-mouse-position-window');

        // 设置定时器获取鼠标位置
        mousePositionInterval = setInterval(async () => {
            try {
                const position = await mouse.getPosition();
                ipcRenderer.send('update-mouse-position', position);
            } catch (error) {
                console.error('获取鼠标位置失败:', error);
                // 如果发生错误，清理并关闭窗口
                if (mousePositionInterval) {
                    clearInterval(mousePositionInterval);
                    mousePositionInterval = null;
                }
                ipcRenderer.send('close-mouse-position-window');
            }
        }, 100);

        // 监听窗口关闭事件
        ipcRenderer.on('mouse-position-window-closed', () => {
            if (mousePositionInterval) {
                clearInterval(mousePositionInterval);
                mousePositionInterval = null;
            }
        });
    } catch (error) {
        console.error('初始化鼠标位置监听失败:', error);
    }
});
clearContextButton.addEventListener('click', clearContext);
messageInput.addEventListener('keypress', (e: KeyboardEvent) => {
    if (e.key === 'Enter') sendMessage();
});

// 添加截图按钮事件监听
screenshotButton.addEventListener('click', captureScreenshot);

// 添加图片处理函数
async function handleImageUpload(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64String = reader.result as string;
            resolve(base64String);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

// 创建图片预览元素
function createImagePreview(base64Image: string): HTMLElement {
    const container = document.createElement('div');
    container.style.position = 'relative';
    container.style.display = 'inline-block';
    container.style.maxWidth = '200px';
    container.style.margin = '10px 0';

    const img = document.createElement('img');
    img.src = base64Image;
    img.style.maxWidth = '100%';
    img.style.borderRadius = '8px';

    const removeButton = document.createElement('button');
    removeButton.innerHTML = '×';
    removeButton.style.position = 'absolute';
    removeButton.style.top = '5px';
    removeButton.style.right = '5px';
    removeButton.style.background = 'rgba(0,0,0,0.5)';
    removeButton.style.color = 'white';
    removeButton.style.border = 'none';
    removeButton.style.borderRadius = '50%';
    removeButton.style.width = '20px';
    removeButton.style.height = '20px';
    removeButton.style.cursor = 'pointer';
    removeButton.onclick = () => container.remove();

    container.appendChild(img);
    container.appendChild(removeButton);
    return container;
}

// 添加图片上传事件处理
uploadButton.addEventListener('click', () => {
    imageInput.click();
});

imageInput.addEventListener('change', async (event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    
    if (file) {
        try {
            const base64Image = await handleImageUpload(file);
            currentImage = base64Image;
            
            // 创建预览
            const previewContainer = createImagePreview(base64Image);
            messageInput.parentElement?.insertBefore(previewContainer, messageInput);
            
            // 清除文件输入
            target.value = '';
        } catch (error) {
            console.error('Error handling image upload:', error);
            addMessage('图片上传失败，请重试。', false);
        }
    }
});

// 添加截图功能
async function captureScreenshot(): Promise<void> {
    const { ipcRenderer } = require('electron');
    
    try {
        // 通知主进程开始截图
        const result = await ipcRenderer.invoke('capture-screenshot');
        
        if (result) {
            const { screenshot, resolution } = result;
            currentImage = screenshot;
            
            // 创建预览
            const previewContainer = createImagePreview(screenshot);
            
            // 添加分辨率提示
            const resolutionText = `屏幕分辨率: (${resolution.width}, ${resolution.height})`;
            addMessage(resolutionText, false);
            
            messageInput.parentElement?.insertBefore(previewContainer, messageInput);
        }
    } catch (error) {
        console.error('Screenshot failed:', error);
        addMessage('截图失败，请重试。', false);
    }
}