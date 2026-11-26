/*
 * 角色台词翻译（英/日）。按中文原文精确匹配，未命中的条目回退中文。
 * 与 i18n.js 分开，避免配置文件被大量文案撑大；新增台词只需在这里补键。
 */
(function (root) {
  'use strict';

  const EN = {
    '谢谢款待～': 'Thanks for the meal~',
    '吃饱了，谢谢你！': "I'm full—thank you!",
    '这一口很及时。': 'That bite came at the right time.',
    '味道不错，继续加油吧。': 'Tastes good—keep it up.',
    '有点饿了…': "I'm a little hungry...",
    '能来点吃的吗？': 'Could I get something to eat?',
    '肚子在抗议了。': 'My stomach is protesting.',
    '我眯一会儿。': "I'll nap for a bit.",
    '休息一下，待会儿见。': 'Taking a break—see you soon.',
    '稍微歇一会儿～': 'Just a short rest~',
  };

  const JA = {
    '谢谢款待～': 'ごちそうさま～',
    '吃饱了，谢谢你！': 'お腹いっぱい、ありがとう！',
    '这一口很及时。': 'この一口、ちょうど良かった。',
    '味道不错，继续加油吧。': '美味しいね。これからも頑張って。',
    '有点饿了…': 'ちょっとお腹空いた…',
    '能来点吃的吗？': '何か食べるものもらえる？',
    '肚子在抗议了。': 'お腹が抗議してる。',
    '我眯一会儿。': '少し眠るね。',
    '休息一下，待会儿见。': '少し休むね。また後で。',
    '稍微歇一会儿～': 'ちょっとだけ休憩～',
  };

  const EN2 = {
    '今天状态不错哦～': 'Feeling good today~',
    '白饭没吃饱，喂喂我嘛…': "I'm not full of rice yet. Feed me…",
    '有点饿了…': "I'm a little hungry…",
    '我心情超好的！': "I'm in a great mood!",
    '有点提不起劲…': "I can't quite get motivated…",
    '今天还没吃到白饭，快让我干活': "No rice today yet. Let me work!",
    '暂无数据': 'No data',
    '浏览器预览没有账本接口': 'The ledger API is unavailable in browser preview',
    '安装版才会读取本机账本': 'Only the installed app can read the local ledger',
    '预览模式没有诊断导出接口': 'Diagnostics export is unavailable in preview mode',
    '形象包读取失败，已切回大肥鱼～': 'Failed to load the character pack. Switched back to the big fish~',
  };
  const JA2 = {
    '今天状态不错哦～': '今日はいい調子だよ～',
    '白饭没吃饱，喂喂我嘛…': 'ご飯まだ足りないよ…食べさせて…',
    '有点饿了…': 'ちょっとお腹すいた…',
    '我心情超好的！': 'すごく機嫌がいいよ！',
    '有点提不起劲…': 'ちょっとやる気が出ない…',
    '今天还没吃到白饭，快让我干活': '今日はまだご飯を食べてないよ。働かせて！',
    '暂无数据': 'データなし',
    '浏览器预览没有账本接口': 'ブラウザプレビューでは帳簿APIを利用できません',
    '安装版才会读取本机账本': 'インストール版のみローカル帳簿を読めます',
    '预览模式没有诊断导出接口': 'プレビューでは診断を書き出せません',
    '形象包读取失败，已切回大肥鱼～': 'キャラクターパックの読み込みに失敗しました。大肥魚に戻したよ～',
  };

  root.PetLib.i18n.extend(EN, JA);
  root.PetLib.i18n.extend(EN2, JA2);
})(typeof window !== 'undefined' ? window : globalThis);
