# SPED Fiscal (EFD ICMS/IPI)

Em **Administração → Fiscal e SPED** o app gera o arquivo da EFD ICMS/IPI do mês.

## Para quem serve

Para comércio varejista **optante pelo Simples Nacional** que emite NFC-e. Em Alagoas, o optante do Simples escolhe entre livro manual, processamento de dados ou SPED. A opção pelo SPED é irretratável (FAQ da SEFAZ-AL). Se o contador pediu o arquivo, a empresa provavelmente fez essa adesão.

Regras aplicadas:
- **ICMS recolhido no DAS.** Base e valor do ICMS ficam zerados no C190 e no E110.
- **Entradas sem crédito.** ICMS, ICMS-ST e IPI das compras ficam sem valor, como pede o Guia Prático para quem não tem direito ao crédito.
- **NFC-e (modelo 65)** é escriturada só com C100 + C190, sem C170 e sem participante. NFC-e nunca é escriturada como entrada.
- **Situação da nota:** cancelada (02), denegada (04) e inutilizada (05) saem no formato reduzido do C100.
- **CFOP das compras** é convertido para entrada: 5102/6102 → 1102/2102 e 540x → 1403/2403.
- **CSOSN → CST:** tabela editável na tela. Padrão: 101/102 → 90, 103 → 40, 300/400 → 41, 500 → 60, 900 → 90.

## Como usar todo mês

1. Ao longo do mês, dê entrada nas notas de compra em **Notas de entrada**, importando o XML ou baixando pela chave. Elas ficam guardadas e entram sozinhas no SPED. Itens que você deixa fora do estoque no lançamento vão como **uso e consumo**: tipo 07 e CFOP 1556, ou 1407 com substituição tributária.
   No fim do mês, exporte do seu emissor de NFC-e os XMLs de venda: autorizadas, cancelamentos e inutilizações. Pode ser um .zip.
2. Em **Fiscal e SPED → Gerar**, escolha o CNPJ e o mês, carregue os arquivos e clique em **Gerar SPED Fiscal**.
3. Confira o resumo (quantidade de notas, total vendido, avisos) com o relatório do emissor.
4. Envie o .txt ao contador. Ele **valida no PVA**, assina com o certificado digital e transmite.

## Inventário (Bloco H)

No último dia do ano, clique em **Registrar inventário agora**. O app guarda a quantidade de cada produto nas lojas do CNPJ, a preço de custo. Inclua esse inventário no arquivo do mês que o contador indicar (normalmente fevereiro).

## Limites desta versão

- **NF-e de saída própria (modelo 55)**, como devolução a fornecedor, não é escriturada. O app avisa e ela deve ser lançada no sistema do contador.
- **Entradas** são lançadas pela data de emissão da NF-e.
- **Itens das compras** usam o código do fornecedor. Não há conversão de unidade (registro 0220) para casar "caixa" com "unidade" do produto da loja.
- **Registros D, G e K** não se aplicam ao varejo e saem sem movimento.
- **Perfil (A/B/C) e tabela CSOSN → CST** devem ser confirmados com o contador. Os NCMs dos produtos de demonstração também precisam de revisão.
- **Testes:** o arquivo passou no validador estrutural do projeto (campos por registro, totais de bloco, bloco 9, soma do C190 igual ao valor do documento, cadastros referenciados), mas **ainda não foi validado no PVA oficial**. Faça essa validação antes da primeira transmissão.
