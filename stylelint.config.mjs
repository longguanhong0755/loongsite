/* loongsite 源码级设计门禁：数值只许来自 design.tokens.json 的白名单。
   运行：npm run check（= node scripts/check-design.mjs && stylelint assets/css/style.css） */
import { TOKENS } from './design.tokens.mjs';

export default {
  rules: {
    'declaration-property-value-allowed-list': {
      'border-radius': TOKENS.radiusAllowed,
      'font-size': TOKENS.fontSizeAllowed,
      'font-weight': TOKENS.fontWeightAllowed,
      gap: TOKENS.gapAllowed.map((v) => (typeof v === 'number' ? `${v}px` : v))
    }
  }
};
