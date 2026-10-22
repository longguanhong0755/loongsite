/* loongsite 设计契约的 JS 入口。
   唯一事实源是 design.tokens.json；所有 JS 脚本统一从这里读，避免各自解析。 */
import { readFileSync } from 'node:fs';

export const TOKENS = JSON.parse(readFileSync(new URL('./design.tokens.json', import.meta.url), 'utf8'));
