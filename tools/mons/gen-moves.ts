/**
 * 生成技能库初稿：data/mons/packs/open/moves.json
 *   npx tsx tools/mons/gen-moves.ts
 * 每个属性 6 个通用招式（稳定A / 稳定B / 爆发 / 高风险 / 控制 / 辅助），
 * 外加初始三只的专属招式。生成后可以手工调整名字 / 数值 / 说明。
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

type Cat = 'physical' | 'special';
interface MoveDef {
  id: string; name: string; type: string; cat: Cat; power: number; acc: number; pp: number;
  desc: string;
  status?: { s: string; chance: number };
  stat?: { k: string; d: number; target: 'self' | 'foe'; chance?: number };
  heal?: { ratio: number; selfSleep?: number };
  guard?: true;
  drain?: number;
  recoil?: number;
}

/** 每个属性的状态 / 能力强项 / 稳定输出偏物理还是特殊 / 名字前缀 */
const EL: Record<string, { status?: string; stat: string; phys: boolean; n: [string, string, string, string, string, string] }> = {
  一般: { stat: 'atk', phys: true, n: ['抓挠', '撞击', '猛撞', '舍身冲撞', '瞪眼', '聚气'] },
  火: { status: 'burn', stat: 'spa', phys: false, n: ['火花', '火焰牙', '喷射火焰', '烈焰冲锋', '鬼火', '冥想'] },
  水: { stat: 'spd', phys: false, n: ['水枪', '水流喷射', '冲浪', '水炮', '浸水', '求雨'] },
  电: { status: 'paralysis', stat: 'spe', phys: false, n: ['电击', '电光', '十万伏特', '疯狂伏特', '电磁波', '充电'] },
  草: { status: 'sleep', stat: 'def', phys: false, n: ['吸取', '藤鞭', '飞叶风暴', '木槌', '催眠粉', '光合作用'] },
  冰: { status: 'freeze', stat: 'def', phys: false, n: ['细雪', '冰冻光束', '暴风雪', '冰锥', '冰冻之风', '极光幕'] },
  格斗: { stat: 'atk', phys: true, n: ['空手劈', '连环巴掌', '近身战', '蛮力', '看穿', '健美'] },
  毒: { status: 'poison', stat: 'spa', phys: false, n: ['毒针', '毒液冲击', '污泥炸弹', '垃圾射击', '毒粉', '溶化'] },
  地面: { stat: 'def', phys: true, n: ['踢沙', '大地之力', '地震', '地裂', '撒沙', '铁壁'] },
  飞行: { stat: 'spe', phys: true, n: ['啄', '翅膀攻击', '空气斩', '勇鸟猛攻', '起风', '羽栖'] },
  超能力: { stat: 'spa', phys: false, n: ['念力', '精神冲击', '精神强念', '预知未来', '催眠术', '冥想'] },
  虫: { stat: 'atk', phys: true, n: ['虫咬', '连斩', '十字剪', '超级角击', '吐丝', '蝶舞'] },
  岩石: { stat: 'def', phys: true, n: ['落石', '岩石封锁', '岩崩', '双刃头槌', '沙暴', '铁壁'] },
  幽灵: { status: 'sleep', stat: 'spa', phys: false, n: ['舌舔', '暗影拳', '暗影球', '潜灵奇袭', '催眠术', '同命'] },
  龙: { stat: 'atk', phys: true, n: ['龙息', '龙爪', '逆鳞', '龙之俯冲', '龙之舞', '龙声鼓舞'] },
  恶: { stat: 'atk', phys: true, n: ['追打', '咬碎', '恶之波动', '欺诈', '挑衅', '磨牙'] },
  钢: { stat: 'def', phys: true, n: ['金属爪', '铁头', '加农光炮', '铁蹄光线', '金属音', '铁壁'] },
  妖精: { stat: 'spd', phys: false, n: ['妖精之风', '吸取之吻', '魔法闪耀', '嬉闹', '魅惑之声', '薄雾场地'] },
};

/** 英文 slug（招式 id 用） */
const SLUG: Record<string, string> = {
  一般: 'normal', 火: 'fire', 水: 'water', 电: 'electric', 草: 'grass', 冰: 'ice', 格斗: 'fighting', 毒: 'poison', 地面: 'ground',
  飞行: 'flying', 超能力: 'psychic', 虫: 'bug', 岩石: 'rock', 幽灵: 'ghost', 龙: 'dragon', 恶: 'dark', 钢: 'steel', 妖精: 'fairy',
};

const STATUS_CN: Record<string, string> = { burn: '灼伤', paralysis: '麻痹', sleep: '睡眠', freeze: '冰冻', poison: '中毒' };
const STAT_CN: Record<string, string> = { atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度', acc: '命中', eva: '闪避' };

const out: MoveDef[] = [];
for (const [el, cfg] of Object.entries(EL)) {
  const s = SLUG[el];
  const phys: Cat = cfg.phys ? 'physical' : 'special';
  const spec: Cat = cfg.phys ? 'special' : 'physical';
  const sn = cfg.status ? STATUS_CN[cfg.status] : '';
  out.push(
    // 1 稳定 A：威力 40，命中 100，PP 25
    { id: `mv:${s}:1`, name: cfg.n[0], type: el, cat: phys, power: 40, acc: 100, pp: 25, desc: '稳定输出' },
    // 2 稳定 B：威力 65，命中 95，PP 20，10% 状态或能力
    {
      id: `mv:${s}:2`, name: cfg.n[1], type: el, cat: phys, power: 65, acc: 95, pp: 20,
      ...(cfg.status ? { status: { s: cfg.status, chance: 10 } } : { stat: { k: cfg.stat, d: -1, target: 'foe', chance: 10 } }),
      desc: cfg.status ? `10% 让对手${sn}` : `10% 降低对手${STAT_CN[cfg.stat]}`,
    },
    // 3 爆发：威力 90，命中 100，PP 15，10% 状态或能力
    {
      id: `mv:${s}:3`, name: cfg.n[2], type: el, cat: phys, power: 90, acc: 100, pp: 15,
      ...(cfg.status ? { status: { s: cfg.status, chance: 10 } } : { stat: { k: cfg.stat, d: -1, target: 'foe', chance: 10 } }),
      desc: cfg.status ? `10% 让对手${sn}` : `10% 降低对手${STAT_CN[cfg.stat]}`,
    },
    // 4 高风险：威力 120，命中 85，PP 5，反伤 1/3
    { id: `mv:${s}:4`, name: cfg.n[3], type: el, cat: phys, power: 120, acc: 85, pp: 5, recoil: 1 / 3, desc: '高威力，自身受到 1/3 反伤' },
    // 5 控制：威力 0，命中 90，PP 10，100% 状态（没有状态的属性用降能力）
    cfg.status
      ? { id: `mv:${s}:5`, name: cfg.n[4], type: el, cat: spec, power: 0, acc: 90, pp: 10, status: { s: cfg.status, chance: 100 }, desc: `让对手${sn}` }
      : { id: `mv:${s}:5`, name: cfg.n[4], type: el, cat: spec, power: 0, acc: 90, pp: 10, stat: { k: cfg.stat, d: -1, target: 'foe' }, desc: `降低对手${STAT_CN[cfg.stat]}` },
    // 6 辅助：自身能力 +1
    { id: `mv:${s}:6`, name: cfg.n[5], type: el, cat: spec, power: 0, acc: 100, pp: 15, stat: { k: cfg.stat, d: 1, target: 'self' }, desc: `自身${STAT_CN[cfg.stat]} +1` },
  );
}

// 初始三只的专属招式
out.push(
  { id: 'sig:o01', name: '尾焰回旋', type: '火', cat: 'physical', power: 70, acc: 100, pp: 15, status: { s: 'burn', chance: 20 }, desc: '20% 让对手灼伤' },
  { id: 'sig:o02', name: '潮汐咏唱', type: '水', cat: 'special', power: 0, acc: 100, pp: 10, heal: { ratio: 0.25 }, stat: { k: 'spd', d: 1, target: 'self' }, desc: '回复 1/4 生命，自身特防 +1' },
  { id: 'sig:o04', name: '葱油喷溅', type: '毒', cat: 'special', power: 75, acc: 95, pp: 10, status: { s: 'poison', chance: 30 }, desc: '30% 让对手中毒' },
);

const file = fileURLToPath(new URL('../../data/mons/packs/open/moves.json', import.meta.url));
writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
console.log(`写入 ${out.length} 个招式 → ${file}`);
