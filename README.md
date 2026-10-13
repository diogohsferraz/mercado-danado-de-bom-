# 🛒 Mercado Danado de Bom

Sistema web para rede de **mercados autônomos**: totem de autoatendimento na loja, compra pelo celular do cliente, carteira digital com bônus e painel de gestão multi-loja.

> **Versão de demonstração (protótipo funcional).** Roda 100% no navegador, sem servidor. Os dados ficam salvos no próprio aparelho (localStorage) e os pagamentos no cartão são simulados. Veja o [roteiro para produção](#roteiro-para-produção).

## Acessos

| Tela | Endereço | Para quem |
|---|---|---|
| Início | `/` | Escolha do modo |
| Totem da loja | `#/totem/<id-da-loja>` | Tablet/monitor touch na loja, com leitor de código de barras |
| Compra pelo celular | `#/celular/<id-da-loja>` | Cliente (via QR Code colado na loja) |
| Minha carteira | `#/cliente` | Cliente: conta, recarga, extrato, cupons |
| Administração | `#/admin` | Dono/operador (PIN inicial **1234**) |

Dados de demonstração: 3 lojas + 1 depósito em Maceió/AL, 39 produtos, 45 dias de vendas e 12 clientes. Para testar a carteira, use o CPF **111.222.333-44** e o PIN **1234**.

## Funcionalidades

**Autoatendimento (totem e celular)**
- Leitura de código de barras pela câmera (BarcodeDetector nativo, com a biblioteca html5-qrcode como alternativa) ou por leitor USB/Bluetooth.
- Catálogo por categoria e busca, para produtos sem código (ex.: bolo em fatia).
- Cupons de desconto.
- Pagamento com **cartão na maquininha** (crédito/débito) ou com **saldo da carteira** (CPF/celular + PIN).
- Celular → totem: o cliente monta o carrinho no celular, recebe um código de 6 dígitos e paga no cartão no totem.
- Totem com teclado numérico na tela, relógio e volta automática ao início após 2 minutos parado.

**Gestão (painel administrativo)**
- **Painel:** faturamento de hoje comparado com ontem, 30 dias, ticket médio, lucro bruto, alertas e comparativo entre lojas.
- **Vendas e relatórios:** filtro por período e loja; faturamento por dia e por hora (horários de pico); recortes por forma de pagamento, canal e categoria; top 10 produtos com margem; lista de vendas com estorno; exportação CSV (abre no Excel).
- **Produtos:** cadastro com código de barras (ou código interno gerado), preço, custo, margem e estoque mínimo.
- **Estoque por loja e por lote:** entrada com validade, baixa por perda (vencido, avaria, furto), contagem de inventário e histórico de movimentações.
- **Validade:** lotes vencidos ou a vencer, valor em risco e perdas dos últimos 30 dias. As vendas consomem primeiro o lote que vence antes (FEFO).
- **Reposição:** sugestão por loja baseada no estoque mínimo e na venda média dos últimos 14 dias; transferência em lote a partir do depósito; lista impressa para o repositor; lista de compras para o fornecedor (CSV).
- **Clientes e carteira:** cadastro, recarga no balcão (dinheiro, Pix, cartão, cortesia), bônus automático na recarga, extrato, ajuste manual e saldo total em carteiras.
- **Cupons:** percentual ou valor fixo, com compra mínima, validade e contagem de usos.
- **Lojas e totens:** lojas e depósitos, link do totem e cartaz com QR Code para impressão.
- **Configurações:** nome, mensagem, PIN, regras de bônus e de alerta; backup/importação em JSON.

O sistema funciona como app instalável (PWA) e continua abrindo se a internet cair.

## Como rodar

Não precisa instalar nada: é um site estático.

```bash
python3 -m http.server 8080
# abra http://localhost:8080
```

A publicação no **GitHub Pages** é automática a cada push na `main` (`.github/workflows/pages.yml`). A câmera só funciona em HTTPS ou em localhost.

## Estrutura

```
index.html            página única
css/app.css           visual (laranja, preto e verde-limão)
js/app.js             rotas e tela inicial
js/db.js              dados e regras de negócio (estoque, vendas, carteira…)
js/checkout.js        totem e celular
js/cliente.js         área do cliente
js/admin.js           painel administrativo
js/scanner.js         câmera e leitor de código de barras
js/ui.js              componentes de interface
sw.js                 funcionamento offline
docs/PESQUISA.md      pesquisa de mercado
```

Todas as regras de negócio ficam em `js/db.js`. Para ligar um backend, basta trocar esse módulo, sem mexer nas telas.

## Roteiro para produção

Prioridades, com base na [pesquisa de mercado](docs/PESQUISA.md):

1. **Backend e sincronização** (ex.: Supabase/Firebase): dados compartilhados entre totens, celulares e painel; login de operadores; backup automático.
2. **Pagamentos reais:**
   - Integração TEF/POS (Stone, PagSeguro PlugPag, Cielo LIO ou SiTef), para o totem mandar o valor à maquininha e só concluir após a aprovação.
   - Recarga da carteira por gateway (Mercado Pago, Asaas, Pagar.me).
   - **Pix com QR dinâmico**. Recomendo fortemente: é o meio mais usado no Brasil e tem a menor taxa.
3. **Fiscal:** emissão de NFC-e com certificado A1 e contingência (obrigatória em vários estados; ver Portaria RN 754/2026 e as regras de SP de 2026).
4. **Segurança/perdas:**
   - controle de acesso por QR ou facial;
   - integração com câmeras;
   - relatório de divergência de inventário por loja.
5. **Operação:**
   - notificações (WhatsApp/push) de estoque baixo e de validade;
   - app do repositor com rota entre lojas;
   - previsão de demanda.
