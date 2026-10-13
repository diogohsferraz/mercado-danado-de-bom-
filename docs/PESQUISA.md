# Pesquisa: softwares para mercado autônomo (outubro/2026)

Levantamento feito a partir de notícias, materiais comerciais e páginas dos fornecedores. Preços são indicativos e precisam ser confirmados diretamente com cada empresa.

## Brasil

| Plataforma | Modelo | Destaques | Preço público |
|---|---|---|---|
| **Market4u** | Franquia (tecnologia própria) | App + totem com reconhecimento facial (2026), 24/7, ~2.700 lojas | a partir de R$ 80 mil (até 5 lojas) + 6% royalties |
| **Honest Market** | Franquia + software *white label* | Totem/app com leitura de código de barras, 550+ unidades | ~R$ 35 mil (2022) |
| **Minha Quitandinha** | Franquia | Foco em condomínios | a partir de R$ 50 mil + 6% royalties |
| **Smart Break** | Operadora + franquia | 900+ itens, meta de 1.500 lojas | n/d |
| **Onii** | Operadora | App para entrar, escanear e pagar; geladeiras e lojas em Kombi | n/d |
| **Zaitt + Buybye** | Tecnologia vendida a terceiros (2024) | Loja 100% autônoma | n/d |
| **TouchPay Market / Guild** | SaaS + hardware | Reconhecimento facial com autocadastro e checagem de antecedentes, abertura de porta, alerta de ruptura | n/d |
| **AMLabs** | SaaS + pagamentos | ~11 mil pontos de *honest market*; estoque, mix, totem, app do operador | n/d |
| **VMpay (Nayax)** | SaaS de telemetria | Vending + micro market, vendas e estoque em tempo real | n/d |
| **NoxMob, Megasul, DotCompany, PDV Smart** | ERP/PDV com modo autoatendimento | PDV Android, NFC-e, Pix, TEF, validade/lote | DotCompany ~R$ 249/mês; PDV Smart a partir de R$ 130/mês |

## Mundo

| Plataforma | Modelo | Destaques |
|---|---|---|
| **365 Retail Markets** (comprou a Cantaloupe, 2025) | Hardware + SaaS | Kiosks MM6 (~US$ 5.450) e PicoMarket (~US$ 1.565), câmera, app 365Pay com carteira, fidelidade, promoções e anúncios |
| **Cantaloupe Seed / Smart Store** | SaaS + kiosk | Rotas, *pre-pick* de depósito, preço remoto, geladeira com trava |
| **Nayax Nova Market / MoMa** | Kiosk + SaaS | Painel único vending + market, camada de IA de gestão |
| **Parlevel** | Kiosk + SaaS | Market Max / Mini |
| **Amazon Just Walk Out, AiFi, Zippin, Trigo** | Licença de visão computacional | "Pegue e saia" sem checkout; caro, foco em estádios e aeroportos |

## Funcionalidades padrão de mercado

- Autoatendimento por totem/tablet e pelo celular do cliente, com leitura de código de barras (câmera ou leitor).
- Pagamento por cartão (crédito/débito/aproximação), Pix e carteira digital própria.
- Baixa automática de estoque, alerta de ruptura, estoque mínimo e lista de reposição.
- Controle de validade e lote, relatório de perdas.
- Controle de acesso e câmeras.
- Relatórios em tempo real, gestão de várias lojas, app do operador com alertas.
- Preços e promoções alterados remotamente.

## Diferenciais observados

- Reconhecimento facial para entrar e pagar (Guild/TouchPay, Market4u, Mercadex 24h).
- Carteira com bônus/fidelidade e mídia no totem (365Pay).
- Logística de rotas e app do repositor (Cantaloupe Seed).
- Geladeira inteligente com trava liberada após o pagamento.
- IA para previsão de demanda (Nayax MoMa).
- Rede social do condomínio no app (Market4u "É Daqui").

## Pontos específicos do Brasil

- **Pix** é praticamente obrigatório no varejo. Use QR dinâmico com conciliação automática: QR estático colado na loja é inseguro, porque ninguém confere o pagamento.
- **NFC-e (modelo 65):** em SP passou a ser obrigatória em todo o varejo a partir de 01/01/2026. Exige certificado A1, CSC da SEFAZ e contingência offline. Cada estado tem suas regras.
- **Regulação estadual:** o RN publicou a Portaria 754/2026 (vigente desde 01/09/2026) específica para mercados autônomos e vending. Vale acompanhar a SEFAZ do seu estado.
- **TEF/POS integrado** (Stone, PagSeguro PlugPag, Cielo, SiTef) permite que o totem envie o valor direto para a maquininha e só libere a venda após a aprovação.
- **Condomínios** são o canal principal (estimativa de ~10 mil minimercados em 2023). Pontos sensíveis: acesso só para moradores, contrato com o síndico e controle de furtos.

## Como o Mercado Danado de Bom se posiciona

Esta versão já cobre os itens padrão de gestão (multi-loja, estoque por lote, validade com FEFO, reposição sugerida pela venda média, transferências a partir do depósito, relatórios e carteira com bônus). Os próximos passos para chegar ao nível dos líderes estão no [README](../README.md#roteiro-para-produção).

## Fontes

- portaldofranchising.com.br: Market4u totem facial
- mercadoeconsumo.com.br: Market4u 2.500 lojas (02/2026), Minha Quitandinha (03/2026)
- centraldovarejo.com.br: Honest Market
- supervarejo.com.br: Smart Break
- canaltech.com.br: Onii
- guild.com.br, amlabs.com.br, mercadex24h.com
- nox.com.br, megasul.com.br, dotcompany.com.br, pdvsmart.site
- 365retailmarkets.com, vendingtimes.com (aquisição da Cantaloupe), cantaloupe.com, nayax.com
- retailtechinnovationhub.com (Just Walk Out, 11/2025), aimultiple.com/checkout-free-stores
- coad.com.br (Portaria RN 754/2026), convergenciadigital.com.br (NFC-e SP 2026)
- blog.cielo.com.br, woovi.com/pix-tef
