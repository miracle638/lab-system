export type RuleCategory = {
  name: string;
  isHardware: boolean;
  keywords: string[];
};

export type AnalysisResult = {
  category: string;
  confidence: number;
  isHardware: boolean;
  matchedKeywords: string[];
};

const ruleCategories: RuleCategory[] = [
  {
    name: "蓝屏/系统崩溃",
    isHardware: false,
    keywords: ["蓝屏", "bsod", "system crash", "系统崩溃", "崩溃", "死机"],
  },
  {
    name: "黑屏/无法启动",
    isHardware: false,
    keywords: ["黑屏", "无法启动", "开不了机", "无法开机", "卡logo", "load error", "不能开机"],
  },
  {
    name: "无法进入系统",
    isHardware: false,
    keywords: ["无法进入系统", "进不去系统", "登录失败", "系统无法加载", "启动失败"],
  },
  {
    name: "硬件电源/主板故障",
    isHardware: true,
    keywords: ["开关键", "红灯", "电源", "主板", "供电", "短路", "无法通电"],
  },
  {
    name: "风扇散热故障",
    isHardware: true,
    keywords: ["风扇", "异响", "散热", "过热", "噪音"],
  },
  {
    name: "存储/内存硬件故障",
    isHardware: true,
    keywords: ["硬盘", "ssd", "内存", "坏道", "读写错误", "存储故障"],
  },
  {
    name: "外设故障",
    isHardware: true,
    keywords: ["话筒", "麦克风", "键盘", "鼠标", "显示器", "摄像头"],
  },
  {
    name: "系统配置/驱动异常",
    isHardware: false,
    keywords: ["驱动", "报错", "兼容", "软件冲突", "更新失败", "授权失败"],
  },
];

function normalizeText(text: string): string {
  return text.toLowerCase().trim();
}

export function classifyIssue(issue: string): AnalysisResult {
  const normalized = normalizeText(issue);

  if (!normalized) {
    return {
      category: "其他/待确认",
      confidence: 0.3,
      isHardware: false,
      matchedKeywords: [],
    };
  }

  let best: AnalysisResult | null = null;

  for (const category of ruleCategories) {
    const matched = category.keywords.filter((keyword) => normalized.includes(keyword.toLowerCase()));
    if (matched.length === 0) continue;

    const score = Math.min(0.55 + (matched.length - 1) * 0.12, 0.95);
    const candidate: AnalysisResult = {
      category: category.name,
      confidence: Number(score.toFixed(4)),
      isHardware: category.isHardware,
      matchedKeywords: matched,
    };

    if (!best || candidate.confidence > best.confidence) {
      best = candidate;
    }
  }

  if (!best) {
    return {
      category: "其他/待确认",
      confidence: 0.35,
      isHardware: false,
      matchedKeywords: [],
    };
  }

  return best;
}

export function buildDeviceKey(roomCode: string, computerPosition: string): string {
  const room = roomCode.trim();
  const position = computerPosition.trim();
  if (!room && !position) return "unknown#unknown";
  return `${room || "unknown"}#${position || "unknown"}`;
}

export function calculateDayGap(previousDate: string, currentDate: string): number {
  const prev = new Date(previousDate).getTime();
  const curr = new Date(currentDate).getTime();
  if (Number.isNaN(prev) || Number.isNaN(curr)) return Number.MAX_SAFE_INTEGER;
  const diff = Math.floor((curr - prev) / (1000 * 60 * 60 * 24));
  return diff;
}

export const AI_VERSION = "v2.0-rule-1";
