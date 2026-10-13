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

Dados de demonstração: 3 lojas + 1 depósito em Maceió/AL, 39 produtos, 45 dias de vendas e 12 clientes. Para testar a carteira, use o CPF **111.222.333-96** e o PIN **1234**. O cliente Pedro Henrique Melo é menor de idade, e Camila Gusmão está com a verificação pendente: use esses dois para ver os bloqueios.

## Funcionalidades

**Autoatendimento (totem e celular)**
- Leitura de código de barras pela câmera (BarcodeDetector nativo, com a biblioteca html5-qrcode como alternativa) ou por leitor USB/Bluetooth.
- Catálogo por categoria e busca, para produtos sem código (ex.: bolo em fatia).
- Cupons de desconto.
- Pagamento com **cartão na maquininha** (crédito/débito) ou com **saldo da carteira** (CPF/celular + PIN).
- Celular → totem: o cliente monta o carrinho no celular, recebe um código de 6 dígitos e paga no cartão no totem.
- Totem com teclado numérico na tela, relógio e volta automática ao início após 2 minutos parado.

**Geladeira com trava e venda 18+**
- Botão **Abrir geladeira** no totem e no celular. O cliente se identifica (CPF/celular + PIN). Se a geladeira for só para maiores, o sistema confere a maioridade antes de destravar a trava magnética, que é acionada pelo eWeLink.
- Produtos marcados como **18+** (bebida alcoólica) só são vendidos a clientes identificados e com maioridade verificada, em qualquer forma de pagamento. Se a pessoa for barrada, o totem oferece remover esses itens e seguir com o resto da compra.
- **Regra fixa:** a geladeira só destrava para maior de 18 anos com maioridade confirmada. Menores e cadastros não verificados são sempre barrados, e essa regra não pode ser desligada no painel.
- Duas formas de confirmar a idade:
  - **manual:** o operador confere o documento com foto e aprova;
  - **automática:** consulta do CPF pela [ponte](ponte/README.md).

  A data digitada pelo próprio cliente nunca vale como prova.
- Validação dos dígitos do CPF e autorização LGPD no cadastro.
- Histórico de todas as tentativas de abertura (abertas e negadas, com o motivo).
- Na produção, a ponte segura (`ponte/`, Cloudflare Worker) guarda as chaves do provedor de CPF e do eWeLink. Ela confere a idade no servidor antes de destravar.

**Gestão (painel administrativo)**
- **Painel:** faturamento de hoje comparado com ontem, 30 dias, ticket médio, lucro bruto, alertas e comparativo entre lojas.
- **Vendas e relatórios:** filtro por período e loja; faturamento por dia e por hora (horários de pico); recortes por forma de pagamento, canal e categoria; top 10 produtos com margem; lista de vendas com estorno; exportação CSV (abre no Excel).
- **Produtos:** cadastro com código de barras (ou código interno gerado), preço, custo, margem e estoque mínimo.
- **Estoque por loja e por lote:** entrada com validade, baixa por perda (vencido, avaria, furto), contagem de inventário e histórico de movimentações.
- **Validade:** lotes vencidos ou a vencer, valor em risco e perdas dos últimos 30 dias. As vendas consomem primeiro o lote que vence antes (FEFO).
- **Reposição:** sugestão por loja baseada no estoque mínimo e na venda média dos últimos 14 dias; transferência em lote a partir do depósito; lista impressa para o repositor; lista de compras para o fornecedor (CSV).
- **Clientes e carteira:** cadastro, recarga no balcão (dinheiro, Pix, cartão, cortesia), bônus automático na recarga, extrato, ajuste manual e saldo total em carteiras.
- **Geladeiras:** cadastro por loja, modo da trava (simulada, webhook direto para teste ou ponte), botão de teste e histórico de aberturas.
- **NFC-e nas vendas:**
  - cada venda do totem ou do celular emite a NFC-e pela ponte, com QR Code e chave de acesso no comprovante;
  - **ICMS-ST por produto:** a marcação define CSOSN 500/CFOP 5405 ou CSOSN 102/CFOP 5102, e o desconto do cupom é rateado entre os itens;
  - se a internet cair, a nota entra numa fila e é reenviada sozinha, sem duplicar;
  - produto sem NCM é bloqueado antes de chegar à SEFAZ, e o botão "Reenviar" emite depois da correção;
  - o estorno da venda cancela a nota;
  - os XMLs ficam arquivados na ponte (a base fiscal compartilhada por todas as lojas), e os do emissor anterior podem ser importados.
- **Notas de entrada:**
  - importa os XMLs das NF-e de compra (.xml ou .zip), ou baixa a nota **pela chave de acesso**: digitada ou lida do código de barras do DANFE, via ponte;
  - guarda todos os XMLs no aparelho;
  - lança no estoque ligando cada item a um produto, com **fator de conversão** (caixa → unidades), validade, custo médio ou último custo, e cria produtos novos a partir da nota;
  - lembra a ligação por fornecedor;
  - trata nota cancelada pelo fornecedor e estorno de lançamento;
  - exporta os XMLs do mês em .zip para o contador.
- **Fiscal e SPED:** gera a **EFD ICMS/IPI (SPED Fiscal, leiaute 020)** do mês para empresas do Simples Nacional. Os dados vêm de três lugares:
  - os XMLs das NFC-e de venda, cancelamentos e inutilizações, e das NF-e de compra (arquivos .xml ou .zip);
  - o cadastro fiscal dos produtos: NCM, CEST, unidade e origem;
  - o inventário registrado no app (Bloco H).

  O cadastro de estabelecimentos (CNPJ/IE) e do contador fica na mesma tela. O arquivo sai em ISO-8859-1, pronto para o contador validar no PVA. Detalhes em [docs/SPED.md](docs/SPED.md).
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
js/geladeira.js       trava da geladeira e verificação de idade
js/sped.js            geração da EFD ICMS/IPI (SPED Fiscal) a partir dos XMLs
js/arquivo.js         arquivo de XMLs (IndexedDB) e geração de .zip
js/ponte.js           chamadas à ponte
js/nfce.js            emissão, fila, cancelamento e consulta das NFC-e
js/vendor/            qrcode-generator 1.4.4 (MIT, Kazuhiko Arase)
ponte/                servidor da ponte (Cloudflare Worker) + instruções
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
4. **Identidade na geladeira:** verificação facial (ex.: Serpro Datavalid), para garantir que quem abre é o dono do CPF.
5. **Segurança/perdas:**
   - controle de acesso por QR ou facial;
   - integração com câmeras;
   - relatório de divergência de inventário por loja.
6. **Operação:**
   - notificações (WhatsApp/push) de estoque baixo e de validade;
   - app do repositor com rota entre lojas;
   - previsão de demanda.
