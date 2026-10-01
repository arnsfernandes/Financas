# Guia de Operações e Manutenção (Runbook)

Este documento orienta desenvolvedores e operadores sobre execução local, variáveis de ambiente, gestão de banco de dados, deploy, rotinas de testes e segurança.

---

## 1. Ambiente Local (Localhost)

### Pré-requisitos:
- **Node.js**: $\ge 18.17.0$ (recomendado Node 20 LTS);
- **Gerenciador de Pacotes**: `pnpm` ou `npm`;
- **Supabase CLI** (opcional, para migrations remotas via CLI).

### Inicialização Rápida:
```bash
# 1. Clonar e instalar dependências
git clone <repo-url>
cd receipt-scanner
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env.local

# 3. Executar o servidor de desenvolvimento
npm run dev
```

O servidor iniciará em `http://localhost:3000`.

---

## 2. Variáveis de Ambiente Necessárias (`.env.local`)

| Variável | Obrigatória | Finalidade | Exemplo Seguro (Sem Segredos) |
| :--- | :---: | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Sim | URL da API REST do projeto Supabase | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sim | Chave anônima pública do Supabase | `eyJhbGciOi...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Chave de serviço interna (backend-only) | `eyJhbGciOi...` |
| `GEMINI_API_KEY` ou `ANTHROPIC_API_KEY` | Sim | Chave de IA para extração de OCR de comprovantes | `AIzaSy...` |
| `FINANCIAL_PASSWORD` | Sim | Senha mestra de acesso ao painel Web | `sua-senha-forte` |
| `AUTH_SECRET` | Sim | Chave de assinatura dos cookies de sessão | `random-32-chars-string` |
| `TELEGRAM_BOT_TOKEN` | Opcional | Token do bot criado no @BotFather | `123456789:ABC...` |
| `TELEGRAM_ALLOWED_USER_ID` | Opcional | ID numérico do usuário autorizado no bot | `997305354` |
| `TELEGRAM_WEBHOOK_SECRET` | Opcional | Token secreto para validação do webhook | `webhook-secret-key` |
| `R2_ACCOUNT_ID` | Opcional | ID da conta Cloudflare para guardar imagens | `r2-account-id` |
| `R2_ACCESS_KEY_ID` | Opcional | Chave de acesso S3 R2 | `access-key-id` |
| `R2_SECRET_ACCESS_KEY` | Opcional | Segredo S3 R2 | `secret-key` |
| `R2_BUCKET` | Opcional | Nome do bucket de comprovantes | `comprovantes` |

---

## 3. Gestão de Migrations no Supabase

Todas as alterações no schema do banco são versionadas em `supabase/migrations/*.sql`.

### Como aplicar novas migrations no Supabase:
```bash
# Testar alterações sem aplicar (Dry-run)
npx supabase db push --dry-run

# Aplicar todas as migrations pendentes no banco remoto
npx supabase db push --include-all
```

---

## 4. Testes, Qualidade e Build

Antes de enviar código ou realizar deploy, execute as 3 etapas de validação:

```bash
# 1. Verificação estática de tipos e lint
npm run lint

# 2. Executar toda a suíte de testes unitários e E2E (Vitest)
npm test

# 3. Validar compilação de produção do Next.js
npm run build
```

---

## 5. Cuidados Operacionais e Boas Práticas

1. **Proteção do Banco Real:**
   - **Nunca** execute scripts destrutivos (`TRUNCATE`, `DROP TABLE`) em produção.
   - Em caso de exclusão de contas, prefira desativar (`active = false`) para não quebrar a rastreabilidade contábil de transações históricas.
2. **Segurança do Telegram Bot:**
   - O bot só processa mensagens originadas do `TELEGRAM_ALLOWED_USER_ID`. Mensagens de terceiros são silenciosamente descartadas.
3. **Ambiente Serverless (Vercel / AWS Lambda):**
   - **Nunca** salve arquivos locais em disco efêmero (`/tmp` ou diretórios locais) esperando persistência entre requisições. Todos os dados de estado devem residir no Supabase ou no Cloudflare R2.
