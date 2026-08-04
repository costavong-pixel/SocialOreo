import { fallbackChain, normalizeLocale } from "./locales";

export type TranslationKey =
  | "nav.dashboard"
  | "nav.posts"
  | "nav.watch"
  | "onboarding.welcome"
  | "onboarding.firstPost"
  | "onboarding.sevenDayPlan"
  | "post.requiresConfirmation"
  | "watch.optIn"
  | "credits.balance"
  | "common.save"
  | "common.cancel";

type Dictionary = Record<string, string>;

const EN: Dictionary = {
  "nav.dashboard": "Dashboard",
  "nav.posts": "Posts",
  "nav.watch": "Watch",
  "onboarding.welcome": "Welcome",
  "onboarding.firstPost": "First post",
  "onboarding.sevenDayPlan": "7-day plan",
  "post.requiresConfirmation": "Publishing requires your confirmation",
  "watch.optIn": "Watch competitors explicitly",
  "credits.balance": "Credits",
  "common.save": "Save",
  "common.cancel": "Cancel",
};

const TRANSLATIONS: Record<string, Dictionary> = {
  "en-US": EN,
  "es-MX": {
    "nav.dashboard": "Panel",
    "nav.posts": "Publicaciones",
    "nav.watch": "Seguimiento",
    "onboarding.welcome": "Bienvenido",
    "onboarding.firstPost": "Primera publicación",
    "onboarding.sevenDayPlan": "Plan de 7 días",
    "post.requiresConfirmation": "Publicar requiere tu confirmación",
    "watch.optIn": "Seguir competidores explícitamente",
    "credits.balance": "Créditos",
    "common.save": "Guardar",
    "common.cancel": "Cancelar",
  },
  "zh-CN": {
    "nav.dashboard": "仪表盘",
    "nav.posts": "帖子",
    "nav.watch": "关注",
    "onboarding.welcome": "欢迎",
    "onboarding.firstPost": "第一条帖子",
    "onboarding.sevenDayPlan": "七天计划",
    "post.requiresConfirmation": "发布需要您的确认",
    "watch.optIn": "明确关注竞争对手",
    "credits.balance": "积分",
    "common.save": "保存",
    "common.cancel": "取消",
  },
  "ar-SA": {
    "nav.dashboard": "لوحة التحكم",
    "nav.posts": "المنشورات",
    "nav.watch": "المتابعة",
    "onboarding.welcome": "مرحباً",
    "onboarding.firstPost": "أول منشور",
    "onboarding.sevenDayPlan": "خطة ٧ أيام",
    "post.requiresConfirmation": "النشر يتطلب تأكيدك",
    "watch.optIn": "متابعة المنافسين بوضوح",
    "credits.balance": "الرصيد",
    "common.save": "حفظ",
    "common.cancel": "إلغاء",
  },
  "fr-FR": {
    "nav.dashboard": "Tableau de bord",
    "nav.posts": "Publications",
    "nav.watch": "Veille",
    "onboarding.welcome": "Bienvenue",
    "onboarding.firstPost": "Première publication",
    "onboarding.sevenDayPlan": "Plan sur 7 jours",
    "post.requiresConfirmation": "La publication nécessite votre confirmation",
    "watch.optIn": "Suivre les concurrents explicitement",
    "credits.balance": "Crédits",
    "common.save": "Enregistrer",
    "common.cancel": "Annuler",
  },
  "pt-BR": {
    "nav.dashboard": "Painel",
    "nav.posts": "Publicações",
    "nav.watch": "Acompanhamento",
    "onboarding.welcome": "Bem-vindo",
    "onboarding.firstPost": "Primeira publicação",
    "onboarding.sevenDayPlan": "Plano de 7 dias",
    "post.requiresConfirmation": "Publicar exige sua confirmação",
    "watch.optIn": "Acompanhar concorrentes explicitamente",
    "credits.balance": "Créditos",
    "common.save": "Salvar",
    "common.cancel": "Cancelar",
  },
};

/**
 * Translation lookup with locale fallback. Keys are independent of the
 * interface locale so the assistant language and profile language can differ.
 */
export function translate(locale: string, key: TranslationKey): string {
  const chain = fallbackChain(normalizeLocale(locale));
  for (const candidate of chain) {
    const value = TRANSLATIONS[candidate]?.[key];
    if (value) return value;
  }
  return EN[key] ?? key;
}

export function availableTranslationLocales(): string[] {
  return Object.keys(TRANSLATIONS);
}
