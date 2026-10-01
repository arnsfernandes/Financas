# Finanças (Receipt Scanner) — Documentação Geral

Sistema inteligente de gestão financeira pessoal e familiar com escaneamento de comprovantes via IA (Visão Computacional), integração completa com Telegram Bot, controle de cartões de crédito, parcelamentos, despesas recorrentes, metas de reservas e persistência em Supabase (PostgreSQL).

---

## 📚 Documentação Essencial do Projeto

A documentação do sistema está organizada em 4 guias especializados:

1. 🏛️ **[Arquitetura do Sistema (ARCHITECTURE.md)](./ARCHITECTURE.md)**
   - Visão geral da arquitetura Next.js 14 App Router;
   - Pipeline de processamento de comprovantes e IA (Gemini / Claude);
   - Integração com Telegram Bot (Webhook & Polling);
   - Camada de autenticação e proteção de rotas;
   - Organização e modularização de pastas e responsabilidades.

2. 💼 **[Regras de Negócio Financeiras (BUSINESS_RULES.md)](./BUSINESS_RULES.md)**
   - Comportamento de transações, receitas, despesas e transferências;
   - Regras de parcelamento (divisão de centavos e avanço de meses);
   - Ciclos de cartão de crédito, datas de corte (`closing_day`) e vencimento (`due_day`);
   - Cálculo de faturas, reservas financeiras e detecção de duplicidade;
   - Comparativo detalhado entre o fluxo Web e Telegram.

3. 🗄️ **[Modelo de Dados (DATA_MODEL.md)](./DATA_MODEL.md)**
   - Mapeamento completo das tabelas no Supabase (PostgreSQL);
   - Relacionamentos, chaves primárias, chaves estrangeiras e índices;
   - Dicionário de campos e contratos de validação Zod.

4. 🛠️ **[Guia de Operações e Deploy (OPERATIONS.md)](./OPERATIONS.md)**
   - Configuração de ambiente local (`localhost`);
   - Variáveis de ambiente necessárias;
   - Gestão de Migrations com Supabase CLI;
   - Execução de testes (Vitest), linter e build de produção;
   - Configuração do Telegram Bot e cuidados operacionais em produção.

---

## 🚀 Como Iniciar em Desenvolvimento Local

```bash
# 1. Instalar dependências
pnpm install # ou npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env.local

# 3. Rodar servidor local
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000) no seu navegador.

---

## 🧪 Validação da Qualidade

```bash
# Rodar linter
npm run lint

# Executar suíte de testes unitários e de integração (397+ testes)
npm test

# Gerar build de produção
npm run build
```
