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

// 定义坐标类型
interface Coordinates {
    x: number;
    y: number;
}

// 存储对话历史
let messageHistory: Message[] = [];

// 存储系统提示词
let systemPrompt: string = `你是一个专门处理鼠标和键盘操作的助手。你可以执行以下操作：
1. 左键单击：click(x,y)
2. 左键双击：left_double(x,y)
3. 右键单击：right_single(x,y)
4. 拖拽操作：drag((x1,y1),(x2,y2))
5. 热键操作：hotkey(key='command+c') 
   支持的修饰键包括 command,alt,control,shift
   Mac 常用热键示例：
   - 复制：hotkey(key='command+c')
   - 粘贴：hotkey(key='command+v')
   - 剪切：hotkey(key='command+x')
   - 全选：hotkey(key='command+a')
   - 撤销：hotkey(key='command+z')
   - 重做：hotkey(key='command+shift+z')
   - 保存：hotkey(key='command+s')
   - 新建：hotkey(key='command+n')
   - 查找：hotkey(key='command+f')
   - 关闭窗口：hotkey(key='command+w')
   - 切换应用：hotkey(key='command+tab')
   - 截图：hotkey(key='command+shift+3')
   - 区域截图：hotkey(key='command+shift+4')
6. 文本输入：type(content='要输入的文本')
7. 滚动操作：scroll((x,y), direction='up/down/left/right')
当用户给出操作指令时，你只需要给出对应的执行命令即可，且只能给出一次。`;

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
            await sleep(200); // 增加等待时间确保鼠标到位

            // 执行多次滚动
            const scrollAmount = 500; // 增加滚动量
            const scrollTimes = 3; // 执行次数
            
            for (let i = 0; i < scrollTimes; i++) {
                switch (direction) {
                    case 'up':
                        await mouse.scrollUp(scrollAmount);
                        break;
                    case 'down':
                        await mouse.scrollDown(scrollAmount);
                        break;
                    case 'left':
                        await mouse.scrollLeft(scrollAmount);
                        break;
                    case 'right':
                        await mouse.scrollRight(scrollAmount);
                        break;
                }
                await sleep(100);
            }
            
            addMessage(`已在位置(${x}, ${y})执行${direction}方向滚动`, true);
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

    // 检查是否为鼠标操作指令
    if (await performMouseOperations(message)) {
        messageInput.value = '';
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