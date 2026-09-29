import React from 'react'
import {
  Utensils,
  ShoppingCart,
  Car,
  Home,
  HeartPulse,
  GraduationCap,
  Gamepad2,
  ShoppingBag,
  Wrench,
  Tv,
  Receipt,
  MoreHorizontal,
  Briefcase,
  Laptop,
  TrendingUp,
  LineChart,
  RotateCcw,
  PlusCircle,
  Tag,
  Coffee,
  Plane,
  Gift,
  Film,
  Music,
  Dumbbell,
  Shield,
  Smartphone,
  CreditCard,
  Building,
  Fuel,
  Sparkles,
  DollarSign,
  type LucideIcon,
} from 'lucide-react'

export const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  Utensils,
  ShoppingCart,
  Car,
  Home,
  HeartPulse,
  GraduationCap,
  Gamepad2,
  ShoppingBag,
  Wrench,
  Tv,
  Receipt,
  MoreHorizontal,
  Briefcase,
  Laptop,
  TrendingUp,
  LineChart,
  RotateCcw,
  PlusCircle,
  Tag,
  Coffee,
  Plane,
  Gift,
  Film,
  Music,
  Dumbbell,
  Shield,
  Smartphone,
  CreditCard,
  Building,
  Fuel,
  Sparkles,
  DollarSign,
}

export const AVAILABLE_CATEGORY_ICONS = Object.keys(CATEGORY_ICON_MAP)

export function getCategoryLucideIcon(iconName?: string | null): LucideIcon {
  if (!iconName) return Tag
  return CATEGORY_ICON_MAP[iconName] || Tag
}

export const CATEGORY_COLORS = [
  '#2F68FE', // Azul Copilot
  '#10B981', // Verde esmeralda
  '#EF4444', // Vermelho
  '#F59E0B', // Âmbar
  '#F97316', // Laranja
  '#EC4899', // Rosa
  '#8B5CF6', // Roxo
  '#06B6D4', // Ciano
  '#6366F1', // Índigo
  '#14B8A6', // Teal
  '#6B7280', // Cinza neutro
  '#78716C', // Stone
]
