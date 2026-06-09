import { operators, combinableOps, FUNC_CONFIG } from './config.js';
import { createBlock, setupSlotEvents, removeBlock } from './block.js';
import { State, DOM } from './state.js';

export function getOperatorType(token) {
    // 1. 既存の operators リストから検索 (優先)
    for (const group of operators) {
        if (group.list.includes(token) || group.list.includes(token.toLowerCase())) {
            return group.type;
        }
    }

    // 2. combinableOps から型を取得
    const firstChar = token.charAt(0);
    const config = combinableOps[firstChar];

    if (config) {
        // 特例(overrides)のチェック (例: >> や <<)
        if (config.overrides && config.overrides[token]) {
            return config.overrides[token];
        }
        // 基本の型を返す (例: >=, == は condition)
        if (config.type) {
            return config.type;
        }
    }

    return null;
}

export function tokenize(expression) {
    const regex = /\s*('[\s\S]*?'|=>|>=|<=|==|!=|\w+\.\w+|\d+(?:\.\d+)?|[a-zA-Z_]\w*|[+\-*/%^&|~()<>=,])\s*/g;
    let tokens = [];
    let match;
    while ((match = regex.exec(expression)) !== null) {
        if (match[0].trim()) {
            tokens.push(match[0].trim());
        }
    }
    return tokens;
}

// ★ ヘルパー関数: トークン列から関数の引数の数を数える
function countFunctionArgs(tokens, startIndex) {
    if (tokens[startIndex] !== '(') return 0;
    
    let depth = 0;
    let commaCount = 0;
    let index = startIndex;
    let isEmpty = true; // () の中身が空かどうか

    while (index < tokens.length) {
        const t = tokens[index];
        if (t === '(') {
            depth++;
            if (depth === 1 && index > startIndex) isEmpty = false; 
        } else if (t === ')') {
            depth--;
            if (depth === 0) break;
        } else if (t === ',' && depth === 1) {
            commaCount++;
        } else {
            // カンマや括弧以外のトークンがあれば空ではない
            if (depth === 1) isEmpty = false;
        }
        index++;
    }

    if (isEmpty) return 0;
    return commaCount + 1;
}

export function spawnBlocksFromExpression(expression, x, y) {
    const tokens = tokenize(expression);
    let cursor = 0;

    function peek() { return tokens[cursor]; }
    
    function consume(expected) {
        if (tokens[cursor] === expected) { cursor++; return true; }
        return false;
    }

    function isOperator(t) {
        return ['>', '<', '>=', '<=', '==', '!=', '+', '-', '*', '/', '%', 'and', 'or', '&', '|', '^', '~'].includes(t)
                || (t.length === 1 && combinableOps[t] !== undefined);
    }

    function finalizeArg(slot, blocksList) {
        if (!slot || blocksList.length === 0) return;
        blocksList = blocksList.filter(b => {
            if (b.dataset.type === 'string' && b.dataset.value === '_') {
                if (b.parentNode) b.parentNode.removeChild(b);
                State.blocks = State.blocks.filter(x => x !== b);
                return false;
            }
            return true;
        });
        if (blocksList.length === 0) return;
        blocksList.forEach(b => {
            slot.appendChild(b);
            b.style.position = 'static'; 
            b.style.marginRight = '4px';
            b.style.verticalAlign = 'middle';
            b.style.display = 'inline-flex';
            b.style.justifyContent = 'center';
            b.style.alignItems = 'center';
            State.blocks = State.blocks.filter(x => x !== b);
        });
    }

    function parseArgList(slotArray) {
        let slotIndex = 0;
        let argBlocks = []; 

        while (peek() !== ')' && cursor < tokens.length) {
            let t = peek();
            
            if (t === ',') { 
                consume(','); 
                if (slotArray[slotIndex]) finalizeArg(slotArray[slotIndex], argBlocks);
                argBlocks = [];
                slotIndex++; 
                continue; 
            }
            
            let processedAsCombined = false;
            
            if (combinableOps[t] && combinableOps[t].next && cursor + 1 < tokens.length) {
                const nextToken = tokens[cursor + 1];
                if (combinableOps[t].next.includes(nextToken)) {
                    const combinedOp = t + nextToken;
                    const opType = getOperatorType(combinedOp); 
                    
                    if (opType) {
                        const opBlock = createBlock(opType, combinedOp, false, combinedOp);
                        argBlocks.push(opBlock);
                        cursor += 2;
                        processedAsCombined = true;
                    }
                }
            }

            if (processedAsCombined) continue;

            if (isOperator(t)) {
                const opType = getOperatorType(t);
                if (opType) {
                    consume(t);
                    const opBlock = createBlock(opType, t, false, t);
                    argBlocks.push(opBlock);
                } else {
                    const blk = parseBlock(); 
                    if (blk) argBlocks.push(blk);
                }
            } else {
                const blk = parseBlock(); 
                if (blk) argBlocks.push(blk);
            }
        }
        if (slotArray[slotIndex]) finalizeArg(slotArray[slotIndex], argBlocks);
    }

    // ---------------------------------------------------------
    // parseBlock
    // ---------------------------------------------------------
    function parseBlock() {
        if (cursor >= tokens.length) return null;
        
        const token = tokens[cursor];

        // 0. Input / End ブロック
        if (token === 'Input') {
            cursor++;
            return createBlock('input', 'Input', false);
        }
        // --- 追加部分 (Start) ---
        if (token === 'End') {
            cursor++;
            return createBlock('end', 'End', false);
        }
        // --- 追加部分 (End) ---

        // 1. 数値
        if (!isNaN(parseFloat(token)) && !token.startsWith("'")) {
            cursor++;
            return createBlock('number', token, false);
        }
        // 2. 文字列
        if (token.startsWith("'")) {
            cursor++;
            return createBlock('string', token.slice(1, -1), false);
        }
        // 3. Telemetry
        if (token.includes('.') && isNaN(parseFloat(token))) {
            cursor++;
            const b = createBlock('Telemetry', token, false);
            const p = token.split('.');
            b.dataset.message = p[0]; b.dataset.field = p[1]; b.dataset.configured = 'true';
            return b;
        }

        // 4. 関数 (ロジックを共通化)
        if (cursor + 1 < tokens.length && tokens[cursor + 1] === '(') {
            const funcName = tokens[cursor];

            // ★A: 引数がない "Name()" の場合 → Getブロック
            if (cursor + 2 < tokens.length && tokens[cursor + 2] === ')') {
                cursor += 3; // Name, (, ) を消費
                let category = 'calc_func';
                if (FUNC_CONFIG[funcName]) {
                    category = FUNC_CONFIG[funcName].category;
                }
                const getBlock = createBlock(category, funcName, false);
                getBlock.dataset.mode = 'get';
                getBlock.classList.add('block-get');
                getBlock.innerHTML = '';
                const prefix = document.createElement('span');
                prefix.textContent = funcName;
                getBlock.appendChild(prefix);
                return getBlock;
            }

            // ★B: 引数がある場合 "Name(...)" → 通常のSetブロック
            // 引数の数を計算
            const argCount = countFunctionArgs(tokens, cursor + 1);

            let category = 'calc_func'; 
            if (FUNC_CONFIG[funcName]) {
                category = FUNC_CONFIG[funcName].category;
            }

            cursor += 2; // "Name", "(" を消費
            
            // ★ createBlock に argCount を渡して、DOM生成を任せる
            const funcBlock = createBlock(category, funcName, false, '', '', { argCount });

            // スロットへの埋め込み処理
            const finalSlots = Array.from(funcBlock.querySelectorAll('.slot')).filter(s => s.closest('.block') === funcBlock);
            parseArgList(finalSlots);
            
            if(!consume(')')) throw new Error(`Missing ')' for ${funcName}`);
            return funcBlock;
        }

        // 5. 演算子単体
        const opType = getOperatorType(token);
        if (opType) {
            cursor++;
            return createBlock(opType, token, false, token);
        }

        // 6. 変数名
        cursor++;
        return createBlock('string', token, false);
    }

    const rootBlock = parseBlock();
    
    if (rootBlock) {
        DOM.field.appendChild(rootBlock);
        State.blocks.push(rootBlock);

        rootBlock.style.position = 'absolute';
        rootBlock.style.opacity = '0';

        setTimeout(() => {
            rootBlock.style.left = `${x}px`;
            rootBlock.style.top = `${y}px`;
            rootBlock.style.opacity = '1';
            State.blockGroups.set(rootBlock, [rootBlock]);
        }, 10);

        return rootBlock;
    }
    return null;
}