# Manual de Regras de Negócio Financeiras

> **Documento Fonte de Verdade:** Este documento consolida o comportamento do sistema para lançamentos, cálculos contábeis, cartões, parcelamentos, reservas, categorias, autenticação e integrações (Web e Telegram).

---

## 1. Lançamentos Financeiros (Transactions)

### Comportamento:
- Todo lançamento financeiro representa uma movimentação de valor (`total`) associada a uma data (`date`), uma categoria (`category_id` / `category`), uma forma de pagamento (`payment_method`) e, opcionalmente ou obrigatoriamente, uma conta de liquidação (`account_id`).
- Lançamentos podem ter origem em:
  - **Upload/Scan de Imagem** (`source_type = 'image'`);
  - **Texto Livre no Bot/Web** (`source_type = 'text'`);
  - **Lançamento Manual** (`origin_type = 'manual'`).

### Regras de Integridade e Validação:
- O valor (`total` ou `installment_amount`) deve ser estritamente maior que zero (`> 0`).
- Datas sem horário são tratadas no fuso horário brasileiro (`America/Sao_Paulo`).

**Fonte de Verdade:** [`lib/schema.ts`](file:///Users/arnaldofernandes/Desktop/receipt-scanner/lib/schema.ts), [`lib/persist.ts`](file:///Users/arnaldofernandes/Desktop/receipt-scanner/lib/persist.ts), [`lib/textRouter.ts`](file:///Users/arnaldofernandes/Desktop/receipt-scanner/lib/textRouter.ts).

---

## 2. Receitas, Despesas e Transferências

### Comportamento:
- **Despesas (`type = 'expense'`):**
  - Reduzem o saldo de caixa/banco ou aumentam a fatura do cartão de crédito.
  - Exigem seleção de forma de pagamento (`payment_method`).
- **Receitas (`type = 'income'`):**
  - Incrementam o saldo contábil da conta destino.
  - Não geram parcelamento nem vinculação com ciclo de fatura de cartão de crédito.
- **Transferências entre contas:** *(A confirmar no roadmap)*
  - Atualmente, movimentações entre contas são registradas como par de lançamentos ou através do módulo de reservas.

**Fonte de Verdade:** [`lib/schema.ts`](file:///Users/arnaldofernandes/Desktop/receipt-scanner/lib/schema.ts), [`lib/queries/dashboardQueries.ts`](file:///Users/arnaldofernandes/Desktop/receipt-scanner/lib/queries/dashboardQueries.ts).

---

## 3. Parcelamentos (Installments)

### Comportamento:
- Quando uma despesa possui $N > 1$ parcelas (`installment_total > 1`):
  - É gerado um identificador único de grupo: `installment_group_id` (UUID).
  - O sistema gera $N$ registros individuais na tabela `transactions`.
  - Cada registro recebe:
    - `installment_current`: Número da parcela de $1$ a $N$;
    - `installment_total`: Total de parcelas $N$;
    - `installment_amount`: Valor exato daquela parcela;
    - `date`: Data calculada sequencialmente mês a mês.
- **Divisão de Centavos:**
  - O valor total é dividido pelo número de parcelas truncado a 2 casas decimais.
  - A diferença de centavos (resto) é adicionada integralmente na **1ª parcela** para evitar divergência de arredondamento.
  - *Exemplo:* $R\$\;100,00$ em 3x $\rightarrow$ Parcela 1: $R\$\;33,34$; Parcelas 2 e 3: $R\$\;33,33$.
- **Datas Subsequentes:**
  - Se a compra foi feita no dia 31 de janeiro, as parcelas seguintes ajustam para o último dia válido de cada mês (28/29 de fevereiro, 31 de março, 30 de abril).

**Fonte de Verdade:** [`lib/installments.ts`](file:///Users/arnaldofernandes/Desktop/receipt-scanner/lib/installments.ts) (`generateInstallmentPlan`, `resolveInstallmentPlan`, `buildFutureInstallmentRows`).

---

## 4. Cartões de Crédito, Fechamento, Vencimento e Faturas

### Comportamento:
- Toda conta do tipo `credit_card` possui dois parâmetros chave:
  - `closing_day` (Dia de Fechamento / Melhor dia de compra): Padrão `5` se não informado.
  - `due_day` (Dia de Vencimento da Fatura): Padrão `15` se não informado.

### Regra de Atribuição de Fatura:
1. **Compras antes ou no dia do fechamento (`tx.day <= closing_day`):**
   - Entram na fatura com vencimento no **mês corrente** (`due_day` do mesmo ciclo).
2. **Compras após o dia do fechamento (`tx.day > closing_day`):**
   - Entram na fatura com vencimento no **mês seguinte**.
3. **Casos Especiais (`due_day <= closing_day`):**
   - Quando o vencimento ocorre numericamente antes do dia de fechamento (ex.: fecha dia 25, vence dia 5 do mês seguinte), o sistema avança o mês de vencimento de forma consistente.

### Cálculo do Total da Fatura:
- $\text{Total da Fatura} = \sum (\text{installment\_amount} \lor \text{total})$ de todas as despesas pertencentes ao ciclo.

**Fonte de Verdade:** [`lib/billingCycles.ts`](file:///Users/arnaldofernandes/Desktop/receipt-scanner/lib/billingCycles.ts) (`getCardInvoiceDates`, `groupTransactionsIntoInvoices`), [`lib/queries/dashboardQueries.ts`](file:///Users/arnaldofernandes/Desktop/receipt-scanner/lib/queries/dashboardQueries.ts).

---

## 5. Contas e Saldo

### Comportamento:
- Tipos de Contas Suportados:
  - `bank_account` (Conta Corrente / Bancária);
  - `credit_card` (Cartão de Crédito);
  - `cash` (Carteira / Dinheiro);
  - `debit_card` (Cartão de Débito);
  - `digital_wallet` (Carteira Digital);
  - `other`.
- **Saldo e Estatísticas:**
  - Contas bancárias e dinheiro exibem contagem de transações e movimentações.
  - Cartões de crédito exibem:
    - `currentMonthExpenses`: Total da fatura aberta/atual;
    - `futureInstallmentsTotal`: Soma de todas as parcelas que vencerão em faturas futuras;
    - `futureInstallmentsCount`: Quantidade de parcelas futuras pendentes.

**Fonte de Verdade:** [`lib/queries/accountQueries.ts`](file:///Users/arnaldofernandes/Desktop/receipt-scanner/lib/queries/accountQueries.ts) (`listAccountsWithStats`, `getAccountDetailsWithStats`).

---

## 6. PIX e Formas de Pagamento

### Comportamento:
- Formas de pagamento aceitas:
  - `Pix`, `Cartão de Crédito`, `Cartão de Débito`, `Dinheiro`, `Boleto`, `Transferência`.
- **Tratamento de Liquidação:**
  - `isImmediatePayment()`: Retorna verdadeiro para `Pix`, `Débito`, `Dinheiro`. O valor afeta a conta imediatamente no dia da transação.
  - Pagamentos em `Cartão de Crédito` são acumulados para pagamento na data de vencimento da fatura (`due_day`).
- **Tratamento de Contas Legadas "PIX":**
  - Contas nomeadas como "PIX" criadas antigamente como contas bancárias são tratadas como pseudo-contas e filtradas pelo helper `isPaymentMethodAccount()` para não duplicar com bancos reais.

**Fonte de Verdade:** [`lib/billingCycles.ts`](file:///Users/arnaldofernandes/Desktop/receipt-scanner/lib/billingCycles.ts) (`isImmediatePayment`), [`lib/queries/accountQueries.ts`](file:///Users/arnaldofernandes/Desktop/receipt-scanner/lib/queries/accountQueries.ts) (`isPaymentMethodAccount`).

---

## 7. Recorrências (Despesas Fixas e Assinaturas)

### Comportamento:
- Lançamentos marcados com `is_recurring = true` possuem:
  - `recurrence_interval`: `'monthly'`, `'weekly'`, `'yearly'`, etc.
  - `recurrence_status`: `'active'` ou `'paused'`.
  - `recurrence_next_date`: Próxima data de vencimento prevista.
- **Projeção de Gastos:**
  - O Dashboard projeta automaticamente despesas recorrentes ativas para os próximos 30 dias na seção de "Compromissos Futuros".
- **Avanço de Ciclo:**
  - Ao registrar o pagamento do mês atual, o campo `recurrence_next_date` é atualizado para o próximo mês correspondente.

**Fonte de Verdade:** [`lib/recurrence.ts`](file:///Users/arnaldofernandes/Desktop/receipt-scanner/lib/recurrence.ts) (`calculateNextRecurrenceDate`, `projectRecurringTransactions`), [`lib/queries/dashboardQueries.ts`](file:///Users/arnaldofernandes/Desktop/receipt-scanner/lib/queries/dashboardQueries.ts).

---

## 8. Reservas Financeiras (Metas e Guardados)

### Comportamento:
- As reservas permitem guardar dinheiro para metas específicas sem misturar com o fluxo diário de receitas e despesas.
- **Estrutura:**
  - `reserves`: Armazena `name`, `target_amount` (meta opcional), `current_amount` (saldo atual), `color`, `icon`, `deadline`, `account_id`.
  - `reserve_movements`: Histórico de depósitos (`deposit`) e resgates (`withdraw`).
- **Regras de Negócio Estritas:**
  1. **Aporte (`deposit`):** Incrementa `current_amount` da reserva.
  2. **Resgate (`withdraw`):** Decrementa `current_amount`. **Bloqueado** caso `amount > current_amount` (erro: *"Saldo insuficiente"*).
  3. Toda movimentação atualiza o `updated_at` da reserva de forma atômica.

**Fonte de Verdade:** [`lib/reserves.ts`](file:///Users/arnaldofernandes/Desktop/receipt-scanner/lib/reserves.ts) (`addReserveMovement`, `createReserve`, `updateReserve`, `deleteReserve`).

---

## 9. Detecção de Duplicidade

### Comportamento:
- Antes de persistir um lançamento, o sistema executa um preflight de duplicidade comparando com transações existentes nos últimos dias.
- **Critérios de Detecção de Duplicata:**
  - Mesmo valor com tolerância de centavos: $|total_1 - total_2| \le 0.01$;
  - Mesma data ou janela próxima de $\pm 2$ dias;
  - Mesmo estabelecimento/vendor ou mesma categoria.
- **Comportamento no Sistema:**
  - **Web:** Exibe modal de alerta permitindo ao usuário cancelar ou forçar o salvamento (`allowDuplicate = true`).
  - **Telegram Bot:** Informa que um lançamento idêntico já foi registrado na mesma data e solicita confirmação.

**Fonte de Verdade:** [`lib/duplicate.ts`](file:///Users/arnaldofernandes/Desktop/receipt-scanner/lib/duplicate.ts) (`detectDuplicateTransaction`, `isPotentialDuplicate`).

---

## 10. Edição e Exclusão de Lançamentos

### Comportamento:
- **Exclusão de Lançamento Simples:**
  - Remove o registro da tabela `transactions` e seus itens filhos em cascata (`transaction_items`).
- **Exclusão de Compra Parcelada:**
  - Se `delete_group = true`: Exclui **todas as $N$ parcelas** vinculadas ao `installment_group_id`.
  - Se `delete_group = false`: Exclui apenas a parcela selecionada, mantendo as demais intactas.
- **Exclusão de Contas:**
  - É **bloqueada** se existirem transações vinculadas à conta (exige desativação em vez de exclusão física para preservar histórico).

**Fonte de Verdade:** [`lib/queries/transactionQueries.ts`](file:///Users/arnaldofernandes/Desktop/receipt-scanner/lib/queries/transactionQueries.ts) (`deleteTransaction`, `deleteInstallmentGroup`), [`lib/queries/accountQueries.ts`](file:///Users/arnaldofernandes/Desktop/receipt-scanner/lib/queries/accountQueries.ts) (`deleteAccount`).

---

## 11. Categorias

### Comportamento:
- Toda transação é vinculada a uma categoria primária (`category_id` $\rightarrow$ `categories.id`).
- As categorias possuem:
  - `name`: Nome legível (ex.: *"Alimentação"*, *"Transporte"*);
  - `normalized_name`: Chave sem acentos/minúscula (ex.: `alimentacao`) para buscas e reconciliação rápida;
  - `type`: `'expense'` ou `'income'`;
  - `icon` e `color`: Metadados visuais para gráficos e badges;
  - `is_system`: Categorias padrão do sistema protegidas contra exclusão acidental.

**Fonte de Verdade:** [`lib/queries/categoryQueries.ts`](file:///Users/arnaldofernandes/Desktop/receipt-scanner/lib/queries/categoryQueries.ts) (`normalizeCategoryName`, `listCategories`, `createCategory`).

---

## 12. Normalização de Estabelecimentos e Produtos Canônicos

### Comportamento:
- **Estabelecimentos Canônicos (`canonical_vendors`):**
  - O sistema resolve nomes de estabelecimentos extraídos de comprovantes para entidades canônicas limpas.
  - *Exemplo:* `"SUPERMERCADOS BH LOJA 42"` $\rightarrow$ `normalized_key = "supermercados bh"` $\rightarrow$ Nome Canônico: `"Supermercados BH"`.
- **Itens de Linha e Produtos Canônicos (`transaction_items` e `canonical_products`):**
  - Cupons com itens detalhados gravam cada produto individualmente com quantidade, preço unitário e total.
  - Cada item de comprovante é associado a um produto canônico normalizado por nome e marca.

**Fonte de Verdade:** [`lib/canonicalVendor.ts`](file:///Users/arnaldofernandes/Desktop/receipt-scanner/lib/canonicalVendor.ts), [`lib/persist.ts`](file:///Users/arnaldofernandes/Desktop/receipt-scanner/lib/persist.ts).

---

## 13. Skins e Temas Visuais de Cartões

### Comportamento:
- As contas do tipo `credit_card` podem ter uma `skin` visual atribuída (ex.: `nubank`, `inter`, `c6`, `itau`, `black`, `gold`, `platinum`, `light`, `dark`).
- Cada skin define gradientes, sombras e cores de texto CSS exibidos nos cartões da interface.

**Fonte de Verdade:** [`lib/creditCardSkins.ts`](file:///Users/arnaldofernandes/Desktop/receipt-scanner/lib/creditCardSkins.ts).

---

## 14. Lembretes e Descarte de Alertas Obsoletos (> 24h)

### Comportamento:
- O motor de lembretes do bot envia alertas às 09:00 (ou no horário configurado pelo usuário):
  - Faturas que vencem em 3 dias;
  - Faturas que vencem hoje;
  - Despesas recorrentes previstas para amanhã;
  - Resumo financeiro semanal nas segundas-feiras.
- **Proteção contra Atrasos (> 24h):**
  - Caso o bot fique desligado e reinicie dias depois, alertas com mais de 24 horas de defasagem são marcados como `stale_discarded` e **não são disparados** para não poluir o chat do usuário.

**Fonte de Verdade:** [`lib/reminders.ts`](file:///Users/arnaldofernandes/Desktop/receipt-scanner/lib/reminders.ts).

---

## 15. Diferenças Relevantes: Web vs Telegram Bot

| Aspecto | Interface Web | Telegram Bot |
| :--- | :--- | :--- |
| **Entrada de Dados** | Formulário guiado com selects, OCR de imagem de cupom, upload de comprovante e importação CSV. | Mensagem de texto livre (ex.: *"almoço 45 debito inter"*) ou foto de cupom via Telegram Vision. |
| **Parsing de Texto** | Pré-preenchimento com validação em tempo real antes de salvar. | Parser heurístico local com fallback para IA (`lib/textRouter.ts`) gerando botões de confirmação direta. |
| **Notificações Ativas** | Notificações passivas no painel Dashboard. | Disparos automáticos diários com deduplicação nativa na tabela `reminder_logs`. |
| **Autenticação** | Sessão via Cookie seguro `fin_session`. | Validação de `TELEGRAM_ALLOWED_USER_ID` e secret token de webhook. |

---

*Documento atualizado como referência oficial de regras de negócio do sistema.*
