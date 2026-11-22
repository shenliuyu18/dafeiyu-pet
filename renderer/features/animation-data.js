/*
 * 形象静态数据：内置形象、图集切分与动作行映射。
 * 顶层 const 由经典脚本共享，pet.js 直接引用。
 */

const CODE_CHAR_DEFS = {};
// gpt：GPT娘v1 图集（素材来自可下载的 gptv1 包）
// 包没安装时 refreshCodeChars 会把 gpt 从 CHARS 里删掉并回落 v1
const CHARS = {
  v1: { label: '大肥鱼', kind: 'video' },
  gpt: {
    label: 'GPT娘v1',
    kind: 'sprite',
    dsh: false,
    dir: '../assets/gpt/',
    actions: [
      ['idle', '待机眨眼'],
      ['waving', '挥手打招呼'],
      ['jumping', '悬停招手'],
      ['work', '敲键盘'],
      ['review', '拍手庆祝'],
      ['waiting', '歪头等待'],
      ['failed', '低头鼓劲'],
      ['runRight', '向右奔跑'],
      ['runLeft', '向左奔跑'],
    ],
  },
};
const charOf = (id) => CHARS[id] || CHARS.v1;
const charNow = () => charOf(S.character);
// 是否有 DeepSeek 味（白饭梗/表情包）；GPT 娘没有
const isDsh = () => charNow().dsh !== false;

const SPRITE = {
  sheet: '../assets/gpt/spritesheet.webp',
  cellW: 192,
  cellH: 208,
  cols: 8,
  rows: 11,
  sequences: {
    idle: { row: 0, count: 6, times: [1680, 660, 660, 840, 840, 1920] },
    runRight: { row: 1, count: 8, times: [120, 120, 120, 120, 120, 120, 120, 220] },
    runLeft: { row: 2, count: 8, times: [120, 120, 120, 120, 120, 120, 120, 220] },
    waving: { row: 3, count: 4, times: [140, 140, 140, 280] },
    jumping: { row: 4, count: 5, times: [140, 140, 140, 140, 280] },
    failed: { row: 5, count: 8, times: [140, 140, 140, 140, 140, 140, 140, 240] },
    waiting: { row: 6, count: 6, times: [150, 150, 150, 150, 150, 260] },
    work: { row: 7, count: 6, times: [120, 120, 120, 120, 120, 220] },
    review: { row: 8, count: 6, times: [150, 150, 150, 150, 150, 280] },
    sleep: { row: 0, count: 1, times: [1200], frame: 2 },
  },
};
const SPRITE_MAP = {
  '待机呼吸休闲': 'idle',
  '原地漂浮踏步': 'run',
  '螃蟹走路': 'run',
  '原地左转奔跑': 'run',
  '被鼠标拖拽悬空反馈': 'jumping',
  '原地小憩沉眠': 'sleep',
  '工作状态-垂头叹气冒汗': 'failed',
  '工作状态-雀跃庆祝': 'review',
  写代码: 'work',
  '工作状态-思考冒泡': 'waiting',
  '工作状态-忙碌点按': 'work',
  '工作状态-清点归档': 'work',
  吃白饭: 'review',
  吃Token: 'review',
  大口吃零食: 'review',
  '点击回应-开心跃动': 'review',
  '点击回应-害羞惊讶': 'jumping',
  '点击回应-傲娇生气': 'failed',
  '点击回应-挠痒咯咯笑': 'waving',
  '点击回应-元气挥手': 'waving',
  '余额-数金皱眉': 'waiting',
  '余额-钱袋满溢': 'review',
  '是啊，吃什么': 'waiting',
  '深度思考碎碎念': 'waiting',
};

const ACTIONS_BUILTIN = [
  { weight: 20, id: 'small', pool: ['悠闲哼歌','超大伸懒腰','原地敲击桌面互动','原地重力下蹲压缩','哈欠连天','女仆屈膝礼仪','被吓一跳','小幅度原地360度旋转展示','偷吃零食被抓住','用鲸鱼尾巴拍打地面','打瞌睡被惊醒','照镜子','整体换装试色','轻快记录','摇扇纳凉','晨间刷牙','东张西望','工作状态-原地踱步张望'] },
  { weight: 20, id: 'play', pool: ['原地专心玩魔方','原地蹲下玩玩具汽车','鲸鱼吐泡泡特效','原地跳跃抓碎头顶物品','玩游戏气急败坏','玩水枪','小提琴演奏','蓝鲸现世','优雅女仆舞','轻快摇摆舞','可爱宅舞','吹气球','动物环绕','放风筝','拆礼物','变鸽子','扑克魔术','抽陀螺','吹笛子','蝴蝶蜜蜂环绕头顶开花','撸猫','凭空生花','骑木马','三球抛接','踢毽子','下五子棋','荡秋千'] },
  { weight: 16, id: 'eat', pool: ['吃早餐','吃午餐','吃晚餐','吃冰淇淋融化','吃大闸蟹','吃糖葫芦','吃长寿面','吃西瓜','涮火锅'] },
  { weight: 14, id: 'season', pool: ['被落叶淹没','中秋赏月吃月饼','堆雪人','放烟花','吃粽子','吃年糕','吃青团','吃腊八粥','吃重阳糕','收红包','写福字','穿针乞巧','舞狮头','讨糖南瓜灯','插茱萸赏菊','放河灯','萌化小幽灵','装点圣诞树','放孔明灯','吃汤圆','吃饺子'] },
  { weight: 10, id: 'text', pool: ['是啊，吃什么','深度思考碎碎念'] },
];
const WHISPERS_BUILTIN = ['碎碎念-擦桌碎碎念','碎碎念-发呆碎碎念', '碎碎念-对屏碎碎念'];
// 带文字的动画不能镜像（照抄 dsh-pet 的 noMirror 约定）
const NO_MIRROR = new Set(['是啊，吃什么', '深度思考碎碎念']);
// 余额账本按已用百分比分档播动画
const BALANCE_BUILTIN = ['余额-钱袋满溢', '余额-金袋叮当', '余额-钱袋如常', '余额-数金皱眉', '余额-袋空如洗', '余额-分文不剩'];

// 当前形象的动作表；内置形象用上面几份常量，形象包会整份换掉
let HAS = new Set(window.PET_ANIMS || []);
let ACTIONS = ACTIONS_BUILTIN;
let WHISPERS = WHISPERS_BUILTIN;
let BALANCE_TIERS = BALANCE_BUILTIN;

const usable = (list) => {
  if (charNow().kind === 'sprite') return list.filter((n) => Boolean(SPRITE_MAP[n]));
  return list.filter((n) => HAS.has(n));
};

// ── 形象包 ────────────────────────────────────────────────────────────────
// 下载来的角色包动作命名自成一套（「中国功夫」「冰箱翻吃的」），没有内置那套
// 「待机/点击回应/工作状态」前缀。所以用上游给的 category + 关键字兜底，
// 把包里的动作映射到固定的行为槽位上；映射不到就退化到待机动作，保证永远有东西播。
const PACK_CAT_WEIGHT = {
  日常起居: 18, 娱乐休闲: 20, 运动健身: 12, 才艺表演: 14,
  吃喝: 14, 手工节日: 10, 工作职业: 10, 情绪反应: 12, 换装造型: 8, 未分类: 6,
};
