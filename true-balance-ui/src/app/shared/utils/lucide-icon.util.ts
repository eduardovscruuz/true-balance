import { icons } from 'lucide-angular';

// Ícone usado quando o nome digitado não corresponde a nenhum ícone real do Lucide.
// Sem essa validação prévia, o <lucide-icon> lança uma exceção em runtime e quebra
// a renderização de toda a linha/tela que o contém (não só o ícone).
const FALLBACK_ICON_NAME = 'Tag';

// Mesma conversão que o lucide-angular usa internamente (kebab/snake/espaço -> PascalCase),
// replicada aqui pra podermos validar o nome ANTES de passar pro componente.
function toPascalCase(value: string): string {
  return value.replace(/(\w)([a-z0-9]*)(_|-|\s*)/g, (_match, first: string, rest: string) => {
    return first.toUpperCase() + rest.toLowerCase();
  });
}

function pascalToKebabCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

export function resolveLucideIconName(rawName: string): string {
  const pascalCase = toPascalCase(rawName.trim());
  return pascalCase in icons ? pascalCase : FALLBACK_ICON_NAME;
}

export function isValidLucideIconName(rawName: string): boolean {
  return toPascalCase(rawName.trim()) in icons;
}

// Todos os nomes de ícone do dataset principal do Lucide (não inclui aliases como
// "home"/"train", só os nomes canônicos), em kebab-case, ordenados alfabeticamente.
// Gerado uma vez a partir do próprio pacote instalado, não hardcoded manualmente.
export const ALL_LUCIDE_ICON_NAMES: string[] = Object.keys(icons).map(pascalToKebabCase).sort();

// Ícones comuns o suficiente pra aparecerem por padrão no seletor, antes do usuário
// digitar qualquer busca. Todos conferidos contra o dataset real do pacote instalado.
export const CURATED_ICON_NAMES: string[] = [
  'utensils',
  'shopping-cart',
  'shopping-bag',
  'car',
  'house',
  'banknote',
  'credit-card',
  'wallet',
  'piggy-bank',
  'coins',
  'hand-coins',
  'circle-dollar-sign',
  'receipt',
  'gift',
  'plane',
  'bus',
  'train-front',
  'fuel',
  'heart-pulse',
  'stethoscope',
  'graduation-cap',
  'book-open',
  'gamepad-2',
  'film',
  'music',
  'coffee',
  'pizza',
  'shirt',
  'dumbbell',
  'wifi',
  'phone',
  'zap',
  'droplet',
  'trash-2',
  'wrench',
  'briefcase',
  'building-2',
  'landmark',
  'tv',
  'smartphone',
  'laptop',
  'baby',
  'paw-print',
  'dog',
  'cat',
  'scissors',
  'palette',
  'camera',
  'map-pin',
  'tag',
  'star',
  'sun',
  'moon',
  'umbrella',
  'bike',
  'shield',
  'heart',
  'activity',
  'pencil',
];
