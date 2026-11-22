/*
 * 布局、尺寸、番茄钟、字体与自动动作的边界常量。
 */

const PET = { x0: 76, y0: 144, x1: 224, y1: 312, cx: 150, cy: 228 };
const LEAN_MAX = 5;
const SIZE_MIN = 0.6;
const SIZE_MAX = 1.6;
const SIZE_STEP = 0.05;
const POMO_MIN = 5;
const POMO_MAX = 120;
const POMO_STEP = 5;
const POMO_ANIM_MIN = 5;
const POMO_ANIM_MAX = 120;
const POMO_ANIM_STEP = 5;
const API_LABEL = {
  deepseek: 'DeepSeek',
  moonshot: 'Kimi',
  siliconflow: 'SiliconFlow',
  doubao: '豆包',
  openai: 'OpenAI',
  claude: 'Claude',
};
const API_SOURCES = Object.keys(API_LABEL);
const AUTO_MIN = 5;
const AUTO_MAX = 300;
const AUTO_STEP = 5;
const FONT_MIN = 0.8;
const FONT_MAX = 1.4;
const FONT_STEP = 0.05;
const PINS_MAX = 10;
const DEFAULT_SCALE = 0.85;
