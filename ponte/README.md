# Ponte: verificação de idade + trava eWeLink

A ponte é um servidor pequeno (Cloudflare Worker, plano gratuito) que fica entre o app e dois serviços com chave secreta:

```
Totem / celular ──► Ponte ──► Provedor de CPF (data de nascimento)
                      │
                      └──► Webhook da Cena eWeLink ──► relé ──► trava magnética
```

**Por que existe:** se o navegador chamasse o eWeLink direto, a URL do webhook ficaria visível no código da página e qualquer pessoa poderia abrir a geladeira. Aqui quem decide é a ponte: ela confere a maioridade do CPF no provedor e só então aciona o relé. Mesmo que alguém altere os dados no navegador, a ponte nega (há um teste automatizado para isso).

## 1. Prepare o eWeLink

1. No app eWeLink, abra o relé da trava → Configurações → **Modo pulso (inching)**. Use o tempo de abertura (ex.: 8 s). Assim o relé volta à posição de travado sozinho.
2. Confira a ligação: trava magnética costuma ser **fail-safe** (energizada = travada). Nesse caso, ligue a trava no contato **NF/NC** do relé de contato seco, para que "ligar o relé" corte a energia e destrave.
3. Vá em **Cenas → Criar → Se: Webhook**. Em **Então**, coloque "ligar o relé da trava". Salve e copie a URL do webhook.
   - O gatilho Webhook pode exigir a assinatura **eWeLink Advanced**. Confira no seu app.
   - Teste colando a URL no navegador: a trava deve abrir.

## 2. Escolha o provedor de consulta de CPF

O CPF não carrega a idade. A data de nascimento vem de uma base oficial ou de um birô:

| `PROVEDOR` | Quando usar |
|---|---|
| `teste` | Instalar e testar sem custo. Todo CPF válido é "maior", exceto os listados em `TESTE_MENORES`. |
| `serpro` | API **Consulta CPF** do Serpro (dados da Receita Federal). Contrate em loja.serpro.gov.br. Precisa de `SERPRO_KEY` e `SERPRO_SECRET`. |
| `http` | Qualquer outro provedor que responda JSON (BigDataCorp, Infosimples, Direct Data, etc.). Configure `PROVEDOR_URL` (com `{cpf}`), `PROVEDOR_TOKEN` e `PROVEDOR_CAMPO` (ex.: `dados.data_nascimento`). |

Se o app que você usa hoje já faz essa consulta, pergunte ao fornecedor qual API ele usa: dá para usar a mesma no modo `http`.

## 3. Publique a ponte

```bash
cd ponte
npx wrangler login
npx wrangler secret put CHAVE_APP        # uma senha longa, usada pelo totem e pelo celular
npx wrangler secret put CHAVE_ADMIN      # outra senha, usada só no botão "Testar destravar"
npx wrangler secret put GELADEIRAS       # veja o formato abaixo
npx wrangler secret put SAL              # texto aleatório, usado no hash do CPF
# se PROVEDOR=serpro:
npx wrangler secret put SERPRO_KEY
npx wrangler secret put SERPRO_SECRET
npx wrangler deploy
```

O formato de `GELADEIRAS` é o identificador da geladeira no app → URL do webhook:

```json
{"g1": {"webhook": "https://…url-da-cena-ewelink…"}, "g2": {"webhook": "https://…"}}
```

Em `wrangler.toml`, ajuste `ORIGEM` para o endereço do app e `PROVEDOR`. Recomendado: crie o KV `IDADES` (instruções no arquivo). Com ele, cada CPF é consultado uma vez só, o que economiza o custo das consultas.

## 4. Ligue no app

1. **Administração → Configurações → Verificação de idade:**
   - modo **Automática (ponte)**;
   - o endereço `https://ponte-mercado.<sua-conta>.workers.dev`;
   - as duas chaves;
   - depois clique em **Testar conexão**.
2. **Administração → Geladeiras → Editar:**
   - modo da trava **Ponte segura**;
   - o mesmo identificador usado em `GELADEIRAS`;
   - depois clique em **Testar destravar**.

## 5. (Opcional) Baixar NF-e de compra pela chave de acesso

A SEFAZ não tem download aberto pela chave. O XML completo só é liberado para o destinatário depois da **ciência da operação** (evento 210210), assinada com o **certificado A1 da empresa**, no serviço *Distribuição de DF-e* do Ambiente Nacional. Para não deixar o certificado no navegador, a ponte usa um provedor que guarda o certificado e faz a ciência:

| `NFE_PROVEDOR` | Configuração |
|---|---|
| `focus` | Focus NFe (focusnfe.com.br): cadastre o certificado A1 no painel deles e defina o segredo `FOCUS_TOKEN`. A ponte faz a ciência (`POST /v2/nfes_recebidas/{chave}/manifesto`) e baixa o XML (`/v2/nfes_recebidas/{chave}.xml`). Confira os endereços na documentação atual do provedor. |
| `http` | Qualquer outro serviço (SIEG, Qive/Arquivei, NFE.io etc.): `NFE_URL` com `{chave}` no lugar da chave e `NFE_TOKEN` (vai no cabeçalho Authorization). O serviço deve devolver o XML completo (`nfeProc`); se devolver só o resumo, a ponte recusa e avisa. |

O download exige a **chave de administrador** (`X-Chave-Admin`), porque o totem e o celular não podem baixar notas da empresa.

Sem a ponte, o app continua aceitando o XML que o fornecedor envia por e-mail (Importar XML/ZIP).

## 6. Emitir NFC-e nas vendas e manter a base fiscal

Com a emissão ligada (**Fiscal e SPED → Emissão de NFC-e**), cada venda do totem ou do celular chama `POST /nfce/emitir`. A ponte emite a nota no provedor e **arquiva o XML no KV `NOTAS`**. É essa base compartilhada que permite ao painel gerar o SPED com as vendas de todas as lojas, sem carregar arquivos.

1. No provedor (Focus NFe):
   - cadastre a empresa com o **certificado A1** e o **CSC/ID do token da NFC-e**, gerados no portal da SEFAZ-AL;
   - comece pelo ambiente de **homologação**, com `FOCUS_URL=https://homologacao.focusnfe.com.br`. Notas de homologação não têm valor fiscal, e o SPED as ignora.
2. Crie o KV: `npx wrangler kv namespace create NOTAS` e ligue em `wrangler.toml` (binding `NOTAS`).
3. Defina `NFE_PROVEDOR=focus` e o segredo `FOCUS_TOKEN`. Se o token atender a mais de um CNPJ, defina também `CNPJ_EMITENTE`.

O que a ponte garante:
- **Sem duplicidade:** cada venda é enviada com uma referência única (o id da venda). Um reenvio devolve a nota já emitida em vez de emitir outra.
- **Sem internet:** a venda é concluída e a NFC-e fica na fila do aparelho, que reenvia sozinha a cada minuto. Isso não é a contingência offline oficial (tpEmis 9). Se a loja ficar muito tempo sem internet, combine com o contador como emitir em contingência.
- **Cancelamento:** feito ao estornar a venda no painel (`/nfce/cancelar`, com justificativa de 15 caracteres ou mais), dentro do prazo da SEFAZ-AL. O XML do cancelamento também é arquivado.
- **Histórico:** os XMLs do emissor anterior entram pelo botão "Importar XMLs de venda do emissor anterior" (`/notas/guardar`).

Os nomes dos campos enviados ao provedor estão em uma única função (`payloadFocus` em `worker.js`). Confira-os na documentação atual do Focus NFe antes de ir para produção.

## Privacidade (LGPD)

- O cliente marca uma autorização no cadastro antes de o CPF ser usado na verificação.
- A ponte devolve ao app só "maior: sim/não". A data de nascimento só é devolvida se você definir `RETORNAR_NASCIMENTO=1`.
- No cache, o CPF é guardado só como hash (SHA-256 com `SAL`).

## Limites que você precisa conhecer

- **CPF prova a idade do dono do CPF, não de quem está na frente da geladeira.** Um menor pode usar o CPF de um adulto. O PIN reduz esse risco. Para eliminá-lo, o próximo passo é a verificação facial (ex.: Serpro **Datavalid**, que compara uma selfie com a foto da CNH).
- Nesta versão o PIN do cliente é conferido no navegador. A ponte garante a **idade**, mas a garantia de **quem é** a pessoa depende do backend com login, que está no roteiro do projeto.
- Os endereços da API do Serpro em `worker.js` seguem a documentação pública. Confira-os no seu contrato antes de ativar.
