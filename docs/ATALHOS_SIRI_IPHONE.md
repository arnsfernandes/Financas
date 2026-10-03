# 📱 Integração Finanças com Atalhos & Siri do iPhone

Este guia ensina como configurar o aplicativo **Atalhos (Shortcuts)** do iOS para registrar gastos e receitas no sistema **Finanças** diretamente por comando de voz com a **Siri**.

---

## 🎯 Como funciona

Ao dizer para o iPhone:
> *"E aí Siri, Novo Gasto"*

A Siri pergunta *"O que você gastou?"*, você responde naturalmente:
> *"Gastei 45 reais de gasolina no Inter"*

A Siri processa a frase, cria o lançamento com categoria, forma de pagamento e conta no **Finanças**, e responde por voz:
> 🔊 *"Despesa de R$ 45,00 em Gasolina registrada no Inter."*

---

## 🔑 Passo 1: Obter seu Token de Atalhos

1. Acesse o **Finanças** no navegador.
2. Na barra lateral, clique no menu **Atalhos & Siri** (ícone de smartphone).
3. Clique em **"Gerar Token de Acesso"**.
4. Copie o token gerado (formato `fnc_st_...`).

> ⚠️ **Segurança:** O token Bearer é pessoal e intransferível. Caso precise revogá-lo ou substituí-lo, basta clicar em *Gerar Novo Token* ou *Revogar Token*.

---

## 🛠️ Passo 2: Montar o Atalho no iPhone

Abra o aplicativo nativo **Atalhos (Shortcuts)** no seu iPhone e siga as 5 ações abaixo:

```
[ + Criar Novo Atalho ]
Nome do Atalho: "Novo Gasto" (ou "Lançar no Finanças")
Ícone: Cor Azul / Símbolo de Cartão ou Cifrão
```

### Ação 1: Pedir Entrada de Voz
- Busque a ação: **"Pedir Entrada"** (Ask for Input)
- **Tipo de Entrada:** `Texto`
- **Pergunta / Mensagem:** `O que você gastou?`

---

### Ação 2: Obter Conteúdo da URL (Requisição HTTP)
- Busque a ação: **"Obter Conteúdo da URL"** (Get Contents of URL)
- Configure os campos:
  - **URL:** `https://SEU-DOMINIO.vercel.app/api/shortcuts/transaction` *(substitua pela URL do seu sistema)*
  - **Método:** `POST`
  - **Cabeçalhos (Headers):**
    - `Authorization` : `Bearer fnc_st_SEU_TOKEN_AQUI`
    - `Content-Type` : `application/json`
  - **Corpo da Solicitação (Request Body):** `JSON`
    - Toque em **Adicionar Novo Campo** -> Tipo `Texto`
    - **Chave (Key):** `text`
    - **Valor (Value):** Toque e selecione a variável **Entrada Fornecida** (da Ação 1)

---

### Ação 3: Obter Resumo da Resposta
- Busque a ação: **"Obter Valor do Dicionário"** (Get Dictionary Value)
- **Obter:** `Valor`
- **Para Chave:** `message`
- **Em:** Selecione **Conteúdo da URL** (resultado da Ação 2)

---

### Ação 4: Falar o Resultado com a Siri
- Busque a ação: **"Falar Texto"** (Speak Text)
- **Texto:** Selecione a variável **Valor do Dicionário** (da Ação 3)
- **Voz / Idioma:** `Português (Brasil)`

---

## 🗣️ Exemplos de Frases Suportadas

O parser do Finanças interpreta linguagem natural com suporte a valores, estabelecimentos, contas, parcelas e formas de pagamento:

- ⛽ **Transporte / Gasolina:** *"Gastei 45 de gasolina no Inter"*
- 🍔 **Alimentação:** *"Almoço de 38 reais no débito"*
- 🛒 **Mercado com Parcelas:** *"Comprei 180 no mercado no cartão Inter em 3 vezes"*
- ☕ **PIX:** *"Café 12 reais no Pix"*
- 💊 **Farmácia:** *"Remédio 65 na Drogasil no Nubank"*
- 💰 **Receitas / Entradas:** *"Recebi 500 reais de freela na conta Inter"*

---

## ❓ Resolução de Dúvidas e Erros

- **"Não consegui identificar o valor financeiro"**: Certifique-se de falar o número do valor (ex: *"45 reais"* ou *"45"*).
- **"Você possui mais de um cartão... Especifique qual"**: Se você tem múltiplos cartões (ex: Inter e Nubank), diga o nome do banco para desambiguação precisa.
- **"Token inválido ou revogado"**: Verifique se o cabeçalho no Atalho está exatamente `Bearer <seu_token>` sem espaços extras.
