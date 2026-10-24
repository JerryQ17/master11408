import { ref } from 'vue';

export type CatppuccinFlavor = 'latte' | 'frappe' | 'macchiato' | 'mocha';

export interface ThemeOption {
  id: CatppuccinFlavor;
  name: string;
  flavor: string;
  badge: string;
  isDark: boolean;
  accentHex: string;
  bgHex: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'latte',
    name: 'Latte',
    flavor: 'Latte 浅色',
    badge: '☀️ 浅色明亮',
    isDark: false,
    accentHex: '#8839ef',
    bgHex: '#eff1f5',
  },
  {
    id: 'frappe',
    name: 'Frappé',
    flavor: 'Frappé 柔暗',
    badge: '☕ 低对比度',
    isDark: true,
    accentHex: '#ca9ee6',
    bgHex: '#303446',
  },
  {
    id: 'macchiato',
    name: 'Macchiato',
    flavor: 'Macchiato 经典',
    badge: '🌙 舒适夜间',
    isDark: true,
    accentHex: '#c6a0f6',
    bgHex: '#24273a',
  },
  {
    id: 'mocha',
    name: 'Mocha',
    flavor: 'Mocha 纯黑',
    badge: '🌌 深度沉浸',
    isDark: true,
    accentHex: '#cba6f7',
    bgHex: '#1e1e2e',
  },
];

const STORAGE_KEY = 'catppuccin-flavor';

function getSavedFlavor(): CatppuccinFlavor {
  if (typeof window === 'undefined') return 'mocha';
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as CatppuccinFlavor | null;
    if (saved && (['latte', 'frappe', 'macchiato', 'mocha'] as const).includes(saved)) {
      return saved;
    }
  } catch {
    // 忽略 localStorage 读取异常
  }
  // 默认根据用户系统明暗偏好选用 latte 或 mocha
  if (
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: light)').matches
  ) {
    return 'latte';
  }
  return 'mocha';
}

export const currentFlavor = ref<CatppuccinFlavor>(getSavedFlavor());

export function setCatppuccinTheme(flavor: CatppuccinFlavor) {
  currentFlavor.value = flavor;
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', flavor);
    if (flavor === 'latte') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  }
  try {
    localStorage.setItem(STORAGE_KEY, flavor);
  } catch {
    // 忽略 localStorage 写入异常
  }
}

// 首次执行同步
if (typeof document !== 'undefined') {
  setCatppuccinTheme(currentFlavor.value);
}
