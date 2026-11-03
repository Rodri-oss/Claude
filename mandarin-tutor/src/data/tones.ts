import type { Tone } from "@/lib/pinyin";

/**
 * Tone-identification items. `text` is what the speech engine reads aloud;
 * `pinyinNum` drives the fallback pitch contour and the answer key. For the
 * neutral tone, which only exists inside words, the learner identifies the
 * tone of syllable `target` (0-based) of a two-syllable word.
 */
export interface ToneItem {
  id: string;
  text: string;
  pinyinNum: string;
  target: number;
  tone: Tone;
}

const SINGLES: Record<1 | 2 | 3 | 4, string> = {
  1: "媽ma1 八ba1 湯tang1 衣yi1 書shu1 煙yan1 天tian1 他ta1 吃chi1 喝he1 花hua1 飛fei1 開kai1 高gao1 家jia1 心xin1 山shan1 風feng1 聽ting1 七qi1",
  2: "麻ma2 拔ba2 糖tang2 姨yi2 熟shu2 鹽yan2 田tian2 茶cha2 來lai2 人ren2 學xue2 錢qian2 房fang2 十shi2 魚yu2 紅hong2 讀du2 年nian2 頭tou2 回hui2",
  3: "馬ma3 把ba3 躺tang3 椅yi3 鼠shu3 眼yan3 我wo3 你ni3 水shui3 小xiao3 買mai3 走zou3 酒jiu3 早zao3 狗gou3 冷leng3 寫xie3 草cao3 手shou3 五wu3",
  4: "罵ma4 爸ba4 燙tang4 意yi4 樹shu4 燕yan4 看kan4 去qu4 大da4 是shi4 賣mai4 菜cai4 熱re4 路lu4 字zi4 謝xie4 用yong4 四si4 飯fan4 爛lan4",
};

const NEUTRAL_WORDS =
  "媽媽ma1ma5 爸爸ba4ba5 謝謝xie4xie5 我們wo3men5 桌子zhuo1zi5 椅子yi3zi5 哥哥ge1ge5 妹妹mei4mei5 什麼shen2me5 筷子kuai4zi5 孩子hai2zi5 弟弟di4di5 姊姊jie3jie5 你們ni3men5 他們ta1men5 餃子jiao3zi5";

function parseItems(list: string): { text: string; pinyinNum: string }[] {
  return list
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const m = tok.match(/^(\p{Script=Han}+)(.+)$/u);
      if (!m) throw new Error(`Bad tone item: ${tok}`);
      return { text: m[1], pinyinNum: m[2] };
    });
}

export const TONE_ITEMS: ToneItem[] = [
  ...([1, 2, 3, 4] as const).flatMap((tone) =>
    parseItems(SINGLES[tone]).map((it) => ({ id: `s-${it.pinyinNum}`, ...it, target: 0, tone: tone as Tone })),
  ),
  ...parseItems(NEUTRAL_WORDS).map((it) => ({ id: `n-${it.pinyinNum}`, ...it, target: 1, tone: 5 as Tone })),
];

/** Minimal-pair sets: same syllable(s), different tones. */
export interface PairOption {
  text: string;
  pinyinNum: string;
  english: string;
}
export interface PairSet {
  id: string;
  /** index of the syllable whose tone differs between options */
  diffSyllable: number;
  options: PairOption[];
}

function set(id: string, spec: string, diffSyllable = 0): PairSet {
  return {
    id,
    diffSyllable,
    options: spec.split(";").map((o) => {
      const [text, pinyinNum, english] = o.split(",").map((s) => s.trim());
      return { text, pinyinNum, english };
    }),
  };
}

export const PAIR_SETS: PairSet[] = [
  set("ma", "媽,ma1,mom; 麻,ma2,numb / hemp; 馬,ma3,horse; 罵,ma4,to scold"),
  set("ba", "八,ba1,eight; 拔,ba2,to pull out; 把,ba3,to hold; 爸,ba4,dad"),
  set("tang", "湯,tang1,soup; 糖,tang2,sugar; 躺,tang3,to lie down; 燙,tang4,scalding hot"),
  set("yi", "衣,yi1,clothes; 姨,yi2,aunt; 椅,yi3,chair; 意,yi4,meaning"),
  set("shu", "書,shu1,book; 熟,shu2,ripe / familiar; 鼠,shu3,mouse; 樹,shu4,tree"),
  set("yan", "煙,yan1,smoke; 鹽,yan2,salt; 眼,yan3,eye; 燕,yan4,swallow (bird)"),
  set("tong", "通,tong1,to go through; 同,tong2,same; 桶,tong3,bucket; 痛,tong4,painful"),
  set("fang", "方,fang1,square; 房,fang2,house / room; 訪,fang3,to visit; 放,fang4,to put"),
  set("hui", "灰,hui1,gray / ash; 回,hui2,to return; 毀,hui3,to destroy; 會,hui4,can / meeting"),
  set("shi", "詩,shi1,poem; 十,shi2,ten; 使,shi3,to cause; 是,shi4,to be"),
  set("qi", "七,qi1,seven; 騎,qi2,to ride; 起,qi3,to rise; 氣,qi4,air / angry"),
  set("wu", "屋,wu1,house; 無,wu2,without; 五,wu3,five; 霧,wu4,fog"),
  set("mai", "買,mai3,to buy; 賣,mai4,to sell"),
  set("yu", "魚,yu2,fish; 雨,yu3,rain"),
  set("shuijiao", "睡覺,shui4jiao4,to sleep; 水餃,shui3jiao3,dumplings"),
  set("jiaoshi", "教室,jiao4shi4,classroom; 教師,jiao4shi1,teacher", 1),
  set("zhuren", "主任,zhu3ren4,director; 主人,zhu3ren2,host / owner", 1),
  set("lianxi", "練習,lian4xi2,to practice; 聯繫,lian2xi4,to contact"),
  set("daxue", "大學,da4xue2,university; 大雪,da4xue3,heavy snow", 1),
  set("tongshi", "同事,tong2shi4,colleague; 同時,tong2shi2,at the same time", 1),
];
