// 页面模板：图标、布局、导航、页脚、组件
// 所有图标为手写内联 SVG 线条图标（stroke 1.6），无 emoji、无外部资源。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const TEMPLATE_ROOT = path.resolve(import.meta.dirname, '..');

// 静态资源内容指纹：资源被服务器长缓存（7d），HTML 引用带 ?v= 指纹才能让
// 改动立即生效（HTML 本身是 must-revalidate，改完刷新即见新版本）。
function assetVer(rel) {
  try {
    return crypto.createHash('sha1').update(fs.readFileSync(path.join(TEMPLATE_ROOT, rel))).digest('hex').slice(0, 8);
  } catch {
    return '';
  }
}

const CSS_V = assetVer('assets/css/style.css');
const JS_V = assetVer('assets/js/main.js');

const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';

export const ICONS = {
  // 品牌标（实心；忠于各家 logo 的轮廓，单色 currentColor 随主题反色）
  github: '<path fill="currentColor" stroke="none" d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.09.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.57 2.34 1.12 2.91.85.09-.66.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.4 9.4 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.59.69.49A10.03 10.03 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z"/>',
  // QQ：官方彩色企鹅（zh.wikipedia 的 Tencent QQ.svg 矢量：黑身/白肚/红围巾/黄脚）
  qq: '<g fill="#101014" stroke="none" transform="matrix(.35277779 0 0 .35277779 -44.0002378 -32.999882)"><path d="m296.23047 496.73437c-35.52735 0-68.14063-11.89062-89.13672-29.65234-10.66406 3.1875-24.30469 8.3125-32.91016 14.67188-7.36718 5.4375-6.44922 10.98046-5.12109 13.21875 5.82812 9.83593 99.98437 6.28125 127.16797 3.21875zm0 0" fill="#faab07"/><path d="m296.23047 496.73437c35.53125 0 68.14062-11.89062 89.14062-29.65234 10.66016 3.1875 24.30078 8.3125 32.91016 14.67188 7.36328 5.4375 6.44531 10.98046 5.11719 13.21875-5.82813 9.83593-99.98438 6.28125-127.16797 3.21875zm0 0" fill="#faab07"/><path d="m296.4375 283.80078c58.67187-.39844 105.69141-11.75391 121.625-16.10937 3.79687-1.03907 5.82812-2.90235 5.82812-2.90235.0156-.53515.24219-9.55078.24219-14.20312 0-78.32813-36.97656-157.039065-127.91406-157.042971-90.93359.0039-127.91016 78.714841-127.91016 157.042971 0 4.65234.22657 13.66797.24219 14.20312 0 0 1.65234 1.74219 4.67969 2.58594 14.71094 4.09375 62.61719 16.01562 122.77344 16.42578zm0 0"/><path d="m455.87109 349.05469c-3.63672-11.70313-8.60156-25.35157-13.6289-38.46094 0 0-2.89063-.35547-4.35547.0664-45.10938 13.10546-99.78516 21.45703-141.44922 20.95312h-.43359c-41.4336.49609-95.73829-7.75781-140.69532-20.73437-1.71875-.4961-5.10937-.28516-5.10937-.28516-5.02735 13.10937-9.99219 26.75781-13.62891 38.46094-17.34375 55.8125-11.72265 78.91015-7.44531 79.42968 9.17969 1.10938 35.73437-42.01562 35.73437-42.01562 0 43.82031 39.5625 111.10547 130.16016 111.72266.40234-.004 2-.004 2.40234 0 90.59766-.61719 130.16016-67.90235 130.16016-111.72266 0 0 26.55469 43.125 35.73438 42.01562 4.27734-.51953 9.89843-23.61718-7.44532-79.42968"/><path d="m263.86328 209.26562c-12.33594.5586-22.875-13.49609-23.53906-31.35937-.66797-17.875 8.78125-32.81641 21.11719-33.375 12.32421-.55078 22.85937 13.49609 23.52734 31.36719.67578 17.875-8.77734 32.8164-21.10547 33.36718" fill="#fff"/><path d="m352.11328 177.90625c-.66016 17.86328-11.19922 31.91797-23.53516 31.35937-12.32812-.55468-21.78125-15.49218-21.10546-33.36718.66796-17.8711 11.20312-31.91797 23.52734-31.36719 12.33594.55859 21.78516 15.5 21.11328 33.375" fill="#fff"/><path d="m374.03906 234.49609c-3.29687-7.30078-36.49609-15.4375-77.59765-15.4375h-.44141c-41.10156 0-74.30078 8.13672-77.59766 15.4375-.14843.31641-.24218.66797-.24218 1.03907 0 .52734.17968 1 .45312 1.40625 2.78125 4.04687 39.64453 24.05859 77.38672 24.05859h.44141c37.74218 0 74.60546-20.00781 77.38281-24.05859.27734-.40235.45312-.88282.45312-1.41016 0-.37109-.0898-.71875-.23828-1.03516" fill="#faab07"/><path d="m279.02734 178.16797c.5625 7.05859-3.30859 13.32812-8.63672 14.01172-5.33593.6875-10.11328-4.47657-10.67968-11.53907-.5586-7.0625 3.30859-13.33203 8.625-14.01171 5.34765-.69141 10.13281 4.48046 10.6914 11.53906"/><path d="m312.91797 180.52734c1.08984-1.95312 8.51562-12.22265 23.88672-8.48437 4.03906.98437 5.90625 2.42969 6.30078 2.99609.58203.83985.74219 2.03516.15234 3.64453-1.16797 3.19141-3.58203 3.10547-4.91797 2.48047-.86328-.40234-11.57031-7.53906-21.43359 3.10938-.67969.73047-1.89453.98047-3.04297.11328-1.15234-.8711-1.625-2.63281-.94531-3.85938"/><path d="m296.4375 329.04297h-.43359c-28.33594.34375-62.69141-3.41016-95.96485-9.96875-2.84765 16.49219-4.5664 37.22265-3.08984 61.94531 3.73047 62.48438 40.83984 101.76172 98.11719 102.33203h2.32812c57.28125-.57031 94.38672-39.84765 98.12109-102.33203 1.47657-24.72656-.24609-45.45312-3.09375-61.94922-33.27734 6.5625-67.64062 10.31641-95.98437 9.97266" fill="#fff"/><path d="m215.72266 323.81641v61.49218s28.16796 5.67969 56.39062 1.7461v-56.71875c-17.87891-1.01172-37.16016-3.26563-56.39062-6.51953" fill="#eb1923"/><path d="m423.89062 264.78906s-54.79296 17.29688-127.45312 17.78906h-.43359c-72.54297-.48828-127.26563-17.73046-127.45313-17.78906l-18.35156 45.80469c45.90234 13.83984 102.78906 22.75781 145.80469 22.23828h.43359c43.01562.51953 99.89844-8.39844 145.80469-22.23828zm0 0" fill="#eb1923"/></g>',
  // Gmail：官方四色 M 信封（Wikimedia "Gmail icon (2020).svg"，自带 viewBox 52 42 88 66）
  gmail: '<g stroke="none"><path fill="#4285f4" d="M58 108h14V74L52 59v43c0 3.32 2.69 6 6 6"/><path fill="#34a853" d="M120 108h14c3.32 0 6-2.69 6-6V59l-20 15"/><path fill="#fbbc04" d="M120 48v26l20-15v-8c0-7.42-8.47-11.65-14.4-7.2"/><path fill="#ea4335" d="M72 74V48l24 18 24-18v26L96 92"/><path fill="#c5221f" d="M52 51v8l20 15V48l-5.6-4.2c-5.94-4.45-14.4-.22-14.4 7.2"/></g>',
  // 洛谷：官方彩色标志描摹（logo.png 三色聚类：浅蓝 #9dc3e6 / 蓝 #5b9bd5 / 绿 #70ad47）
  luogu: '<g stroke="none"><path fill="#9dc3e6" d="M12.65 2L11.55 2.2L10.42 3.23L8.13 6.32L6.14 8.21L5.64 9.31L5.64 10.21L6.04 11L9.06 13.83L10.65 13.93L11.68 13.1L11.29 11.7L10.65 10.97L9.19 10.11L9.09 9.41L11.78 7.02L13.28 4.72L13.58 2.83L13.15 2.2Z"/><path fill="#70ad47" d="M12.42 16.39L12.32 16.98L12.61 17.58L16.04 21.8L18.33 22L18.86 21.67L18.66 20.67L15.54 16.55L14.14 15.95L13.35 15.95Z"/><path fill="#5b9bd5" d="M16.53 8.38L15.34 7.78L11.85 7.68L11.42 8.01L11.52 9.11L13.94 10.74L14.11 11.1L12.51 13L6.34 19.18L5.14 20.94L5.14 21.5L5.47 21.8L6.27 22L8.16 21.8L8.99 20.57L12.28 17.08L12.38 16.39L13.25 16.02L17.47 11.8L17.96 11L17.96 10.31Z"/></g>',
  // linux.do：官方三横带徽标原色（乳白盘 + 墨黑上带 + 琥珀下带 #ffb003）
  linuxdo: '<g stroke="none"><circle cx="12" cy="12" r="10" fill="#f0f0f0"/><defs><clipPath id="ldoClip"><circle cx="12" cy="12" r="9.4"/></clipPath></defs><g clip-path="url(#ldoClip)"><rect x="2" y="2" width="20" height="6" fill="#1c1c1e"/><rect x="2" y="16" width="20" height="6" fill="#ffb003"/></g></g>',
  // LD士多：官方金色（浅色 #E5A11B / 深色 #F3BE49，由 .ic-gold 类随主题切换）
  ldcstore: '<g stroke="none"><path fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" d="M12 3A9 9 0 1 1 5.64 18.36"/><path fill="currentColor" d="M9.38 8.25h5.25l1.87 2.25H7.5Z"/><path fill="currentColor" d="M7.5 11.63h9L12 16.5Z"/></g>',
  mail: `<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>`,
  sun: `<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>`,
  moon: `<path d="M20.5 13.3A8.5 8.5 0 1 1 10.7 3.5a7 7 0 0 0 9.8 9.8Z"/>`,
  arrowUpRight: `<path d="M7 17 17 7M9.5 7H17v7.5"/>`,
  external: `<path d="M15 3h6v6M20.5 3.5 12 12M18 13.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5.5"/>`,
  folder: `<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.6l2 2.2h7.4A2.5 2.5 0 0 1 21 9.7v7.3a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17Z"/>`,
  file: `<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/>`,
  code: `<path d="m9 18-6-6 6-6M15 6l6 6-6 6"/>`,
  layers: `<path d="m12 3.5 9 4.75-9 4.75-9-4.75Z"/><path d="m3.6 12.9 8.4 4.4 8.4-4.4"/>`,
  monitor: `<rect x="2.5" y="3.5" width="19" height="13" rx="2.5"/><path d="M8.5 20.5h7M12 16.5v4"/>`,
  sparkles: `<path d="M11 3.5l1.7 4.4 4.4 1.7-4.4 1.7L11 15.7l-1.7-4.4L4.9 9.6l4.4-1.7Z"/><path d="M18.5 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z"/>`,
  gitBranch: `<path d="M6 3.5v11"/><circle cx="18" cy="6.5" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M18 9a7.5 7.5 0 0 1-7.5 7.5H8.5"/>`,
  chevronRight: `<path d="m9.5 6 6 6-6 6"/>`,
  copy: `<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M6 15h-.5A2.5 2.5 0 0 1 3 12.5v-8A2.5 2.5 0 0 1 5.5 2h8A2.5 2.5 0 0 1 16 4.5V5"/>`,
  check: `<path d="m4.5 12.5 5 5L20 6.5"/>`,
  arrowLeft: `<path d="M19.5 12h-15m6-7-7 7 7 7"/>`,
  arrowUp: `<path d="M12 19.5v-14m0 0-5.5 5.5M12 5.5l5.5 5.5"/>`,
  home: `<path d="m3 10.5 9-7 9 7V20a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H4.5A1.5 1.5 0 0 1 3 20Z"/>`,
  briefcase: `<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5.5A2 2 0 0 1 11 3.5h2a2 2 0 0 1 2 2V7M3 12.5h18"/>`,
  graduation: `<path d="m2.5 8.5 9.5-4.5 9.5 4.5-9.5 4.5Z"/><path d="M6.5 11v4.8c0 1.5 2.5 2.7 5.5 2.7s5.5-1.2 5.5-2.7V11"/>`,
  lock: `<rect x="4.5" y="10" width="15" height="10.5" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>`,
  globe: `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.4 2.4 3.7 5.5 3.7 9s-1.3 6.6-3.7 9c-2.4-2.4-3.7-5.5-3.7-9S9.6 5.4 12 3Z"/>`,
  download: `<path d="M12 3.5v11m0 0 4-4m-4 4-4-4M4.5 20.5h15"/>`,
  menu: `<path d="M4 7h16M4 12h16M4 17h16"/>`,
  close: `<path d="M6 6l12 12M18 6 6 18"/>`,
  terminal: `<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="m6.5 9 3 3-3 3M13 15.5h4.5"/>`,
  database: `<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/>`,
  cpu: `<rect x="6" y="6" width="12" height="12" rx="2.5"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9.5 2.5v3.5M14.5 2.5v3.5M9.5 18v3.5M14.5 18v3.5M2.5 9.5H6M2.5 14.5H6M18 9.5h3.5M18 14.5h3.5"/>`,
  zap: `<path d="M13.5 2.5 4.5 14H11l-.5 7.5L19.5 10H13Z"/>`,
  server: `<rect x="3" y="4" width="18" height="7" rx="2.5"/><rect x="3" y="13" width="18" height="7" rx="2.5"/><path d="M7 7.5h.01M7 16.5h.01"/>`,
  box: `<path d="m12 2.5 9 4.75v9.5L12 21.5l-9-4.75v-9.5Z"/><path d="m3 7.25 9 4.75 9-4.75M12 12v9.5"/>`,
  user: `<circle cx="12" cy="8" r="4"/><path d="M4.5 21c0-3.9 3.4-6 7.5-6s7.5 2.1 7.5 6"/>`,
  clock: `<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>`,
  at: `<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>`,
  pen: `<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>`,
  rocket: `<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2"/><path d="M9 15l-3-3c0-4.5 3-9 9-10.5 1.5 6-3 9-6 13.5"/>` ,
  grid: `<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>`,
  search: `<circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4.2-4.2"/>`,
  branch: `<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M6 8.5v7M8.5 6h5A4.5 4.5 0 0 1 18 10.5V12"/>`,
  chat: `<path d="M4.5 5.5h15a1.5 1.5 0 0 1 1.5 1.5v7.5a1.5 1.5 0 0 1-1.5 1.5H12.5l-5 4v-4H4.5A1.5 1.5 0 0 1 3 14.5V7a1.5 1.5 0 0 1 1.5-1.5Z"/><path d="M7.5 9.5h9M7.5 12.5h5.5"/>`,
  bag: `<path d="M5.6 8.2h12.8l.9 10.6a2 2 0 0 1-2 2.2H6.7a2 2 0 0 1-2-2.2Z"/><path d="M9 10V6.6a3 3 0 0 1 6 0V10"/>`,
  infinity: `<path d="M8 12s-2.5-3-5-3a3 3 0 0 0 0 6c2.5 0 5-3 5-3s2.5 3 5 3a3 3 0 0 0 0-6c-2.5 0-5 3-5 3Z"/>`
};

/** 内联 SVG 图标 */
// 品牌彩色标需要各自的 viewBox（Gmail 88:66、QQ 121:144）；个别需要视觉补偿尺寸与主题色类名
const ICON_VB = { gmail: '52 42 88 66', qq: '0 0 121 144' };
const ICON_SCALE = { gmail: 1.12, qq: 1.06 };
const ICON_CLASS = { ldcstore: 'ic-gold' };

/* 真实折射滤镜（移植自 glassfx，MIT：github.com/SquareMediaGroup/glassfx）
   —— feDisplacementMap 链把背景真正弯折；三个位移强度 44/48/52 轻微错开 = 细色散。 */
const REFRACT_SVG = `<svg class="gx-svg" aria-hidden="true" focusable="false" width="0" height="0" style="position:absolute;overflow:hidden">
<filter id="gx-refract" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
<feGaussianBlur in="SourceAlpha" stdDeviation="16" result="soft"/>
<feOffset in="soft" dx="8" dy="0" result="sxp"/>
<feOffset in="soft" dx="-8" dy="0" result="sxn"/>
<feComposite in="sxp" in2="sxn" operator="arithmetic" k1="0" k2="-2.5" k3="2.5" k4="0.5" result="gx"/>
<feOffset in="soft" dx="0" dy="8" result="syp"/>
<feOffset in="soft" dx="0" dy="-8" result="syn"/>
<feComposite in="syp" in2="syn" operator="arithmetic" k1="0" k2="-2.5" k3="2.5" k4="0.5" result="gy"/>
<feColorMatrix in="gx" type="matrix" values="0 0 0 1 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0 1" result="mx"/>
<feColorMatrix in="gy" type="matrix" values="0 0 0 0 0  0 0 0 1 0  0 0 0 0 0  0 0 0 0 1" result="my"/>
<feComposite in="mx" in2="my" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="base_map"/>
<feComponentTransfer in="base_map" result="map">
<feFuncR type="linear" slope="1.05" intercept="-0.025"/>
<feFuncG type="linear" slope="1.05" intercept="-0.025"/>
</feComponentTransfer>
<feDisplacementMap in="SourceGraphic" in2="map" scale="44" xChannelSelector="R" yChannelSelector="G" result="dispR"/>
<feColorMatrix in="dispR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="onlyR"/>
<feDisplacementMap in="SourceGraphic" in2="map" scale="48" xChannelSelector="R" yChannelSelector="G" result="dispG"/>
<feColorMatrix in="dispG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="onlyG"/>
<feDisplacementMap in="SourceGraphic" in2="map" scale="52" xChannelSelector="R" yChannelSelector="G" result="dispB"/>
<feColorMatrix in="dispB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="onlyB"/>
<feBlend in="onlyR" in2="onlyG" mode="screen" result="rg"/>
<feBlend in="rg" in2="onlyB" mode="screen"/>
</filter>
<filter id="gx-refract-s" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
<feGaussianBlur in="SourceAlpha" stdDeviation="16" result="soft"/>
<feOffset in="soft" dx="8" dy="0" result="sxp"/>
<feOffset in="soft" dx="-8" dy="0" result="sxn"/>
<feComposite in="sxp" in2="sxn" operator="arithmetic" k1="0" k2="-2.5" k3="2.5" k4="0.5" result="gx"/>
<feOffset in="soft" dx="0" dy="8" result="syp"/>
<feOffset in="soft" dx="0" dy="-8" result="syn"/>
<feComposite in="syp" in2="syn" operator="arithmetic" k1="0" k2="-2.5" k3="2.5" k4="0.5" result="gy"/>
<feColorMatrix in="gx" type="matrix" values="0 0 0 1 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0 1" result="mx"/>
<feColorMatrix in="gy" type="matrix" values="0 0 0 0 0  0 0 0 1 0  0 0 0 0 0  0 0 0 0 1" result="my"/>
<feComposite in="mx" in2="my" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="map"/>
<feDisplacementMap in="SourceGraphic" in2="map" scale="48" xChannelSelector="R" yChannelSelector="G"/>
</filter>
</svg>`;

export function icon(name, size = 20, cls = 'ic') {
  const body = ICONS[name] || '';
  const vb = ICON_VB[name] || '0 0 24 24';
  const extra = ICON_CLASS[name] ? ' ' + ICON_CLASS[name] : '';
  const px = Math.round(size * (ICON_SCALE[name] || 1));
  return `<svg class="${cls}${extra}" width="${px}" height="${px}" viewBox="${vb}" ${STROKE} aria-hidden="true" focusable="false">${body}</svg>`;
}

export const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NAV = [
  { href: '/', label: '首页', icon: 'home' },
  { href: '/projects/', label: '项目', icon: 'grid' },
  { href: '/sites/', label: '网站', icon: 'globe' },
  { href: '/blog/', label: '博客', icon: 'pen' }
];

const NO_FLASH = `(function(){var d=document.documentElement;d.classList.add('js');try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}d.setAttribute('data-theme',t);}catch(e){d.setAttribute('data-theme','light');}})();`;

/* 动效分级必须在首绘前定档：CSS 的 --m-* 令牌按 html[data-motion] 取值，
   晚一步首屏就会用错一档（看到完整动效再突然变轻）。
   light 不是关掉效果：时长更短、位移更小、视差关掉，签名效果照样在。
   判据只取"明确的约束"，不拿普通笔记本的 4 核 / 4GB 当理由降级：
     系统减动效 → light；省流量或 2G-慢网 → light；核心数 ≤2 或内存 ≤2GB → light；
   ?motion=full|light 人工覆盖并记住（localStorage）。 */
const MOTION = `(function(){var d=document.documentElement,t='full';try{var q=(location.search.match(/[?&]motion=(full|light)/)||[])[1];if(q){t=q;try{localStorage.setItem('motion',q);}catch(e){}}else{var s=null;try{s=localStorage.getItem('motion');}catch(e){}if(s==='full'||s==='light'){t=s;}else if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches){t='light';}else{var n=navigator,c=n.connection||{};var weak=!!c.saveData||/^(slow-2g|2g)$/.test(c.effectiveType||'')||!!(n.hardwareConcurrency&&n.hardwareConcurrency<=2)||!!(n.deviceMemory&&n.deviceMemory<=2);if(weak){t='light';}}}}catch(e){t='full';}d.setAttribute('data-motion',t);})();`;

/* 到达编排必须在内联脚本里注册：defer 的 main.js 可能晚于跨页快照执行，
   那样 pagereveal 里的首屏标记会错过首帧，快照就是空白。这里只做首屏块的
   就位/错峰和落位后的上浮，其余交互仍由 main.js 接管。
   只写序号 --rise-i，错峰步长交给令牌（--m-stagger）。 */
const ARRIVAL = `(function(){var d=document.documentElement;window.addEventListener('pagereveal',function(e){if(!e||!e.viewTransition)return;d.classList.add('vt-active','vt-arrive');var vh=window.innerHeight*0.94,list=document.querySelectorAll('.reveal'),n=0;for(var i=0;i<list.length;i++){var el=list[i],r=el.getBoundingClientRect();if(r.height&&(Math.min(r.bottom,vh)-Math.max(r.top,0))/r.height>=0.04){el.classList.add('is-in','no-rise');el.style.setProperty('--rise-i',String(n));n++;}}var settle=function(){d.classList.add('vt-settle');};var vt=e.viewTransition;if(vt.finished&&vt.finished.then){vt.finished.then(settle,settle);}else{setTimeout(settle,500);}},{once:true});})();`;

export function layout({ profile, title, description, current = '/', path = '/', content, bodyClass = '' }) {
  const fullTitle = title ? `${title} · ${profile.name}` : `${profile.name} · ${profile.title}`;
  const desc = description || profile.description;
  const navLinks = NAV.map((n) => {
    const active = n.href === current ? ' is-active' : '';
    return `<a class="nav-link${active}" href="${n.href}">${icon(n.icon, 17)}<span>${n.label}</span></a>`;
  }).join('');
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="color-scheme" content="light dark">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(profile.siteUrl)}${esc(path)}">
<link rel="canonical" href="${esc(profile.siteUrl)}${esc(path)}">
<meta property="og:image" content="${esc(profile.siteUrl)}/assets/img/avatar-512.jpg">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/img/avatar-256.jpg">
<link rel="stylesheet" href="/assets/css/style.css?v=${CSS_V}">
<script>${NO_FLASH}</script>
<script>${MOTION}</script>
<script>${ARRIVAL}</script>
<script type="speculationrules">{"prefetch":[{"where":{"and":[{"href_matches":"/*"},{"not":{"href_matches":"/sub/*"}}]},"eagerness":"moderate"}]}</script>
</head>
<body class="${bodyClass}">
${REFRACT_SVG}
<a class="skip-link" href="#main">跳到主要内容</a>
<div class="bg-deco" aria-hidden="true"></div>
<div class="progress" aria-hidden="true" data-progress><i></i></div>
<header class="nav-wrap">
  <nav class="nav glass" aria-label="主导航">
    <a class="brand" href="/">
      <span class="brand-dot" aria-hidden="true"></span>
      <span class="brand-name">${esc(profile.name)}</span>
    </a>
    <div class="nav-links">${navLinks}</div>
    <div class="nav-actions">
      <a class="icon-btn" href="https://github.com/longguanhong0755" target="_blank" rel="me noopener" aria-label="GitHub">${icon('github', 18)}</a>
      <button class="icon-btn theme-toggle" type="button" aria-label="切换深浅色主题" data-theme-toggle>
        <span class="theme-ic theme-ic-sun">${icon('sun', 18)}</span>
        <span class="theme-ic theme-ic-moon">${icon('moon', 18)}</span>
      </button>
    </div>
  </nav>
</header>
<main id="main">
${content}
</main>
<footer class="footer">
  <div class="container footer-inner">
    <div class="footer-left">
      <span class="brand-dot" aria-hidden="true"></span>
      <span>${esc(profile.name)} · ${esc(profile.title)}</span>
    </div>
    <div class="footer-right">
      <span class="muted footer-time" data-clock-wrap hidden>本地时间 <span data-clock>--:--:--</span></span>
      <span class="footer-sep" aria-hidden="true"></span>
      <span class="muted">© ${new Date().getFullYear()}</span>
    </div>
  </div>
</footer>
<button class="to-top" type="button" data-to-top aria-label="回到顶部">${icon('arrowUp', 16)}</button>
<div class="toast" role="status" aria-live="polite" data-toast>${icon('check', 15)}<span data-toast-text></span></div>
<script src="/assets/js/main.js?v=${JS_V}" defer></script>
</body>
</html>`;
}

export function badge(text, kind = 'default') {
  return `<span class="badge badge-${kind}">${esc(text)}</span>`;
}

export function tag(text) {
  return `<span class="tag">${esc(text)}</span>`;
}

export function sectionHead(iconName, eyebrow, title, lead = '', num = '') {
  return `<div class="section-head">
    <div class="section-eyebrow">${num ? `<span class="section-num">${esc(num)}</span>` : ''}${icon(iconName, 16)}<span>${esc(eyebrow)}</span></div>
    <h2 class="section-title">${esc(title)}</h2>
    ${lead ? `<p class="section-lead">${esc(lead)}</p>` : ''}
  </div>`;
}

/** 项目卡片（首页 / 项目列表共用） */
export function projectCard(p, idx = 0, total = 0) {
  const isPublic = p.visibility === 'public';
  const nn = (v) => String(v).padStart(2, '0');
  const meta = [
    idx ? `<span class="card-index">${nn(idx)}${total ? ` / ${nn(total)}` : ''}</span>` : '',
    isPublic ? badge('公开', 'public') : badge('私有', 'private'),
    `<span class="card-year">${esc(p.year)}</span>`
  ].join('');
  const tags = p.tags.slice(0, 4).map(tag).join('');
  const actions = isPublic
    ? `<div class="card-actions">
        <a class="btn btn-sm btn-primary" href="/projects/${p.slug}">查看详情${icon('chevronRight', 15)}</a>
        ${p.demo ? `<a class="btn btn-sm btn-ghost" href="${esc(p.demo)}" target="_blank" rel="noopener">${icon('globe', 15)}演示站</a>` : ''}
      </div>`
    : `<div class="card-actions">
        <a class="btn btn-sm btn-ghost" href="/projects/${p.slug}">查看简介${icon('chevronRight', 15)}</a>
      </div>`;
  return `<article class="project-card glass corners reveal" data-visibility="${esc(p.visibility)}">
    <div class="card-top">
      <div class="card-icon">${icon(p.icon || 'box', 22)}</div>
      <div class="card-meta">${meta}</div>
    </div>
    <h3 class="card-title vt-name" style="--vt-name:proj-${esc(p.slug)}"><a href="/projects/${p.slug}">${esc(p.name)}</a></h3>
    <p class="card-subtitle">${esc(p.subtitle)}</p>
    <p class="card-summary">${esc(p.summary)}</p>
    <div class="card-tags">${tags}</div>
    ${actions}
  </article>`;
}
